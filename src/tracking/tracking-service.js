import {hasPendingCase,orderRetentionDeadline} from '../data/order-retention.js';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {runTransaction} from '../data/database.js';
import {StaffOrderError} from '../staff/orders-service.js';

export function createTrackingService(objDatabase,objSessions,{fnNow=()=>new Date()}={}){
  // Internal only: callers already own the payment transaction. Never exposed by order ID.
  function issueForPayment(strOrderId,dtNow){
    const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=? AND fulfillment_status IS NOT NULL').get(strOrderId);
    if(!objOrder||!objDatabase.prepare("SELECT id FROM demo_payment_attempts WHERE order_id=? AND quote_id=? AND state='succeeded'").get(objOrder.id,objOrder.accepted_quote_id))throw new Error('Confirmed demonstration payment required.');
    if(objDatabase.prepare('SELECT id FROM tracking_grants WHERE order_id=?').get(strOrderId))return null;
    return insertGrant(objOrder,dtNow,null);
  }
  function insertGrant(objOrder,dtNow,dtExpiry){
    const strToken=randomBytes(32).toString('hex');
    objDatabase.prepare('INSERT INTO tracking_grants (id,order_id,token_digest,created_at,expires_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(),objOrder.id,createHash('sha256').update(strToken).digest('hex'),dtNow,dtExpiry);
    return `/track#${strToken}`;
  }
  function resolveOrder(strToken,dtNow){
    if(typeof strToken!=='string'||!/^[a-f0-9]{64}$/.test(strToken))return null;
      const objGrant=objDatabase.prepare('SELECT * FROM tracking_grants WHERE token_digest=? AND revoked_at IS NULL').get(createHash('sha256').update(strToken).digest('hex'));
      if(!objGrant)return null;
      const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objGrant.order_id);
      const dtDeadline=orderRetentionDeadline(objDatabase,objOrder);
      if(dtNow<objGrant.created_at||(objGrant.expires_at&&dtNow>=objGrant.expires_at)||(dtDeadline&&dtNow>=dtDeadline))return null;
      return objOrder;
  }
  function readTracking(strToken){
    if(typeof strToken!=='string'||!/^[a-f0-9]{64}$/.test(strToken))return null;
    return runTransaction(objDatabase,()=>{
      const dtNow=fnNow().toISOString();const objOrder=resolveOrder(strToken,dtNow);if(!objOrder)return null;
      const objBooking=objDatabase.prepare('SELECT promised_at FROM fulfillment_bookings WHERE order_id=?').get(objOrder.id);
      return {strReference:objOrder.public_reference,strStatus:objOrder.fulfillment_status,strService:objOrder.service_type,dtReadyAt:objBooking?.promised_at??null,
        bCanRequestCancellation:objOrder.fulfillment_status==='Received'&&!objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id),
        strRefundState:objOrder.fulfillment_status==='Cancelled'?(objDatabase.prepare("SELECT state FROM demo_refund_attempts WHERE order_id=? ORDER BY CASE state WHEN 'succeeded' THEN 0 ELSE 1 END,requested_at DESC,rowid DESC LIMIT 1").get(objOrder.id)?.state??'review-required'):'not-applicable',
        bReviewPending:hasPendingCase(objDatabase,objOrder.id)||Boolean(objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id)||objDatabase.prepare("SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'").get(objOrder.id)),
        arrProgress:objDatabase.prepare('SELECT to_status AS strStatus,occurred_at AS dtOccurredAt FROM order_events WHERE order_id=? AND to_status IS NOT NULL AND (from_status IS NULL OR from_status IS NOT to_status) ORDER BY sequence').all(objOrder.id)};
    });
  }
  function requestCancellation(strToken){
    return runTransaction(objDatabase,()=>{
      const dtNow=fnNow().toISOString();const objOrder=resolveOrder(strToken,dtNow);if(!objOrder)return null;
      if(objOrder.fulfillment_status!=='Received')throw new StaffOrderError('Preparation has started or the order is final. Contact the team for help.',409);
      if(objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id))return {strState:'pending',bReplayed:true};
      const objLatest=objDatabase.prepare('SELECT occurred_at FROM order_events WHERE order_id=? ORDER BY sequence DESC LIMIT 1').get(objOrder.id);if(objLatest&&objLatest.occurred_at>dtNow)throw new StaffOrderError('Order timing needs review.',409);
      objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code,requested_at) VALUES (?,?,'customer','customer_request',?)").run(randomUUID(),objOrder.id,dtNow);
      objDatabase.prepare('UPDATE orders SET revision=revision+1 WHERE id=?').run(objOrder.id);
      objDatabase.prepare("INSERT INTO order_events (id,order_id,sequence,event_type,occurred_at,reason_code) VALUES (?,?,(SELECT coalesce(max(sequence),0)+1 FROM order_events WHERE order_id=?),'customer_cancellation_requested',?,'customer_request')").run(randomUUID(),objOrder.id,objOrder.id,dtNow);
      return {strState:'pending',bReplayed:false};
    });
  }
  function replaceGrant(strSession,strReference){
    return objSessions.executeAuthorized(strSession,'cancellation.decide',(objIdentity,dtNow)=>{
      const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=? AND fulfillment_status IS NOT NULL').get(strReference);
      if(!objOrder||!objDatabase.prepare("SELECT id FROM demo_payment_attempts WHERE order_id=? AND quote_id=? AND state='succeeded'").get(objOrder.id,objOrder.accepted_quote_id))throw new StaffOrderError('Order not found.',404);
      const objOld=objDatabase.prepare('SELECT * FROM tracking_grants WHERE order_id=? AND revoked_at IS NULL').get(objOrder.id);
      const dtExpiry=objOld?.expires_at??null;const dtDeadline=orderRetentionDeadline(objDatabase,objOrder);
      if((dtExpiry&&dtExpiry<=dtNow.toISOString())||(dtDeadline&&dtDeadline<=dtNow.toISOString()))throw new StaffOrderError('Tracking access has expired.',409);
      if(objOld)objDatabase.prepare('UPDATE tracking_grants SET revoked_at=? WHERE id=?').run(dtNow.toISOString(),objOld.id);
      const strTrackingPath=insertGrant(objOrder,dtNow.toISOString(),dtExpiry);
      const strId=randomUUID();objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,'tracking_replacement','order',?,?,?,'operator_request','Tracking grant replaced')").run(strId,objIdentity.strUserId,objOrder.id,dtNow.toISOString(),strId);
      return {strTrackingPath};
    });
  }
  return {issueForPayment,readTracking,replaceGrant,requestCancellation};
}
