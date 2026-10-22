import {randomUUID} from 'node:crypto';
import {runTransaction} from '../data/database.js';
import {orderRetentionDeadline} from '../data/order-retention.js';
import {StaffOrderError} from '../staff/orders-service.js';

function available(objDatabase,objOrder,dtNow){
  const objContact=objDatabase.prepare('SELECT phone,email,redacted_at FROM order_contacts WHERE order_id=?').get(objOrder.id);
  const dtDeadline=orderRetentionDeadline(objDatabase,objOrder);
  return Boolean(objContact&&!objContact.redacted_at&&(objContact.phone||objContact.email)&&(!dtDeadline||dtNow<dtDeadline));
}
function renderPreview(objDatabase,objNotice){
  const objEvent=objDatabase.prepare('SELECT * FROM order_events WHERE id=? AND order_id=?').get(objNotice.source_event_id,objNotice.order_id);
  const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objNotice.order_id);
  const bPaid=Boolean(objDatabase.prepare("SELECT id FROM demo_payment_attempts WHERE order_id=? AND state='succeeded' AND quote_id=?").get(objOrder.id,objOrder.accepted_quote_id));
  const bValid=bPaid&&objEvent&&({confirmation:objEvent.event_type==='demo_payment_confirmed'&&objEvent.to_status==='Received',ready:objEvent.event_type==='fulfillment_progress'&&objEvent.to_status==='Ready',cancellation:objEvent.event_type==='admin_order_decision'&&objEvent.to_status==='Cancelled',refund:objEvent.event_type==='demo_refund_confirmed'&&Boolean(objDatabase.prepare("SELECT id FROM demo_refund_attempts WHERE order_id=? AND confirmed_at=? AND state='succeeded'").get(objOrder.id,objEvent.occurred_at))}[objNotice.template_key]);
  if(!bValid)throw new Error('Invalid notification source.');
  const objBooking=objDatabase.prepare('SELECT promised_at FROM fulfillment_bookings WHERE order_id=?').get(objOrder.id);
  const strReady=objBooking?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(new Date(objBooking.promised_at))+' Central':'Please ask the team to confirm the ready time.';
  const bInventory=Boolean(objDatabase.prepare("SELECT id FROM fulfillment_reviews WHERE order_id=? AND trigger_type='inventory_change' AND opened_at<=? LIMIT 1").get(objOrder.id,objEvent.occurred_at));
  const mapText={confirmation:['Order confirmed',`Your ${objOrder.service_type==='carry-out'?'carry-out':'dine-in'} order is confirmed. Ready time: ${strReady}. Keep the private tracking link from your confirmation.`],ready:['Your order is ready',`Your order is ready for ${objOrder.service_type==='carry-out'?'pickup':'dine-in service'}.`],cancellation:['Order cancelled',`${bInventory?'We’re sorry—an ingredient became unavailable. ':''}Your order was cancelled after team review. A refund is reviewed separately; cancellation alone does not confirm it.`],refund:['Demonstration refund completed','Your full demonstration payment, including tax and tip, was refunded in the demonstration records. No money was transferred.']};
  const [strSubject,strText]=mapText[objNotice.template_key];
  return {strSubject,strBody:`Order ${objOrder.public_reference}\n${strText}\nInternal ${objNotice.channel==='sms'?'SMS':'email'} preview only. Nothing was sent or delivered.`};
}
export function createNotificationService(objDatabase,objSessions,{fnNow=()=>new Date(),fnRender=renderPreview}={}){
  function audit(strId,dtNow,strActor=null){const strEventId=randomUUID();objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,'notification_preview','notification',?,?,?,'operator_request','Notification preview updated')").run(strEventId,strActor,strId,dtNow,strEventId);}
  function processPending(){
    return runTransaction(objDatabase,()=>{
      const dtNow=fnNow().toISOString();let intProcessed=0;
      // Bounded generation work; sensitive text is never written to logs or audit.
      for(const objNotice of objDatabase.prepare("SELECT * FROM notification_outbox WHERE state='pending' AND created_at<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at,id LIMIT 50").all(dtNow,dtNow)){
        const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objNotice.order_id);if(!available(objDatabase,objOrder,dtNow))continue;
        let objPreview;try{objPreview=fnRender(objDatabase,objNotice);if(!objPreview||typeof objPreview.strSubject!=='string'||!objPreview.strSubject.trim()||objPreview.strSubject.length>160||typeof objPreview.strBody!=='string'||!objPreview.strBody.trim()||objPreview.strBody.length>4096)throw new Error('Invalid preview.');}catch{
          objDatabase.prepare("UPDATE notification_outbox SET state='failed',attempt_count=attempt_count+1,next_attempt_at=NULL,sanitized_error_code='render_failed' WHERE id=?").run(objNotice.id);audit(objNotice.id,dtNow);intProcessed++;continue;
        }
        objDatabase.prepare("UPDATE notification_outbox SET state='previewed',attempt_count=attempt_count+1,previewed_at=?,next_attempt_at=NULL,sanitized_error_code=NULL WHERE id=?").run(dtNow,objNotice.id);
        objDatabase.prepare('INSERT INTO notification_previews (notification_id,subject,body,generated_at) VALUES (?,?,?,?)').run(objNotice.id,objPreview.strSubject,objPreview.strBody,dtNow);audit(objNotice.id,dtNow);intProcessed++;
      }
      // Read authorization also enforces this deadline if cleanup has not yet run.
      for(const objOrder of objDatabase.prepare('SELECT DISTINCT o.* FROM orders o JOIN notification_outbox n ON n.order_id=o.id').all())if(!available(objDatabase,objOrder,dtNow))objDatabase.prepare('DELETE FROM notification_outbox WHERE order_id=?').run(objOrder.id);
      return {intProcessed};
    });
  }
  function read(strToken,strReference){return objSessions.executeAuthorized(strToken,'orders.read',(objIdentity,dtNow)=>{
    const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=?').get(strReference);if(!objOrder)throw new StaffOrderError('Order not found.',404);
    if(!available(objDatabase,objOrder,dtNow.toISOString()))return {arrPreviews:[],bExpired:true,bCanRetry:false};
    return {bExpired:false,bCanRetry:objIdentity.strRole==='admin',arrPreviews:objDatabase.prepare('SELECT n.id AS strId,n.channel AS strChannel,n.template_key AS strTemplate,n.state AS strState,n.attempt_count AS intAttempts,n.created_at AS dtCreatedAt,n.sanitized_error_code AS strError,p.subject AS strSubject,p.body AS strBody FROM notification_outbox n LEFT JOIN notification_previews p ON p.notification_id=n.id WHERE n.order_id=? ORDER BY n.created_at,n.rowid LIMIT 50').all(objOrder.id)};
  });}
  function retry(strToken,strReference,objInput){return objSessions.executeAuthorized(strToken,'notifications.retry',(objIdentity,dtNow)=>{
    if(!objInput||Object.keys(objInput).length!==1||typeof objInput.strNotificationId!=='string'||objInput.strNotificationId.length>100)throw new StaffOrderError('Choose a failed preview.',400);
    const objNotice=objDatabase.prepare('SELECT n.* FROM notification_outbox n JOIN orders o ON o.id=n.order_id WHERE o.public_reference=? AND n.id=?').get(strReference,objInput.strNotificationId);if(!objNotice)throw new StaffOrderError('Preview not found.',404);
    const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objNotice.order_id);if(!available(objDatabase,objOrder,dtNow.toISOString()))throw new StaffOrderError('Preview retention has ended.',409);
    if(objNotice.state==='failed'){objDatabase.prepare("UPDATE notification_outbox SET state='pending',sanitized_error_code=NULL,next_attempt_at=NULL WHERE id=? AND state='failed'").run(objNotice.id);audit(objNotice.id,dtNow.toISOString(),objIdentity.strUserId);}
    return {strState:objNotice.state==='failed'?'pending':objNotice.state};
  });}
  return {processPending,read,retry};
}
