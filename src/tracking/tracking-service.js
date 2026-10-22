import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {runTransaction} from '../data/database.js';
import {StaffOrderError} from '../staff/orders-service.js';
const FINAL_STATES=['Completed','Cancelled','Not collected'];
export function createTrackingService(objDatabase,objSessions,{fnNow=()=>new Date()}={}){
  function hasPendingCase(strOrderId){return Boolean(objDatabase.prepare("SELECT id FROM cancellation_requests c WHERE c.order_id=? AND (c.state='pending' OR (c.state='approved' AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.cancellation_request_id=c.id AND r.state='succeeded')))").get(strOrderId)
    ||objDatabase.prepare("SELECT r.id FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=? AND r.state!='succeeded'").get(strOrderId));}
  function deadline(objOrder){
    if(!FINAL_STATES.includes(objOrder.fulfillment_status))return null;
    if(hasPendingCase(objOrder.id))return null;
    const arrTimes=[objOrder.completed_at,objOrder.cancelled_at,objOrder.not_collected_at,
      ...objDatabase.prepare('SELECT decided_at FROM cancellation_requests WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.decided_at),
      ...objDatabase.prepare('SELECT r.confirmed_at FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=?').all(objOrder.id).map((objRow)=>objRow.confirmed_at)].filter(Boolean);
    return new Date(Math.max(...arrTimes.map(Date.parse))+7*86400000).toISOString();
  }
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
  function readTracking(strToken){
    if(typeof strToken!=='string'||!/^[a-f0-9]{64}$/.test(strToken))return null;
    return runTransaction(objDatabase,()=>{
      const objGrant=objDatabase.prepare('SELECT * FROM tracking_grants WHERE token_digest=? AND revoked_at IS NULL').get(createHash('sha256').update(strToken).digest('hex'));
      if(!objGrant)return null;const dtNow=fnNow().toISOString();
      const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objGrant.order_id);
      const dtDeadline=deadline(objOrder);
      if(dtNow<objGrant.created_at||(objGrant.expires_at&&dtNow>=objGrant.expires_at)||(dtDeadline&&dtNow>=dtDeadline))return null;
      const objBooking=objDatabase.prepare('SELECT promised_at FROM fulfillment_bookings WHERE order_id=?').get(objOrder.id);
      return {strReference:objOrder.public_reference,strStatus:objOrder.fulfillment_status,strService:objOrder.service_type,dtReadyAt:objBooking?.promised_at??null,
        bReviewPending:hasPendingCase(objOrder.id)||Boolean(objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id)||objDatabase.prepare("SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'").get(objOrder.id)),
        arrProgress:objDatabase.prepare('SELECT to_status AS strStatus,occurred_at AS dtOccurredAt FROM order_events WHERE order_id=? AND to_status IS NOT NULL AND (from_status IS NULL OR from_status IS NOT to_status) ORDER BY sequence').all(objOrder.id)};
    });
  }
  function replaceGrant(strSession,strReference){
    return objSessions.executeAuthorized(strSession,'cancellation.decide',(objIdentity,dtNow)=>{
      const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=? AND fulfillment_status IS NOT NULL').get(strReference);
      if(!objOrder||!objDatabase.prepare("SELECT id FROM demo_payment_attempts WHERE order_id=? AND quote_id=? AND state='succeeded'").get(objOrder.id,objOrder.accepted_quote_id))throw new StaffOrderError('Order not found.',404);
      const objOld=objDatabase.prepare('SELECT * FROM tracking_grants WHERE order_id=? AND revoked_at IS NULL').get(objOrder.id);
      const dtExpiry=objOld?.expires_at??null;const dtDeadline=deadline(objOrder);
      if((dtExpiry&&dtExpiry<=dtNow.toISOString())||(dtDeadline&&dtDeadline<=dtNow.toISOString()))throw new StaffOrderError('Tracking access has expired.',409);
      if(objOld)objDatabase.prepare('UPDATE tracking_grants SET revoked_at=? WHERE id=?').run(dtNow.toISOString(),objOld.id);
      const strTrackingPath=insertGrant(objOrder,dtNow.toISOString(),dtExpiry);
      const strId=randomUUID();objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,'tracking_replacement','order',?,?,?,'operator_request','Tracking grant replaced')").run(strId,objIdentity.strUserId,objOrder.id,dtNow.toISOString(),strId);
      return {strTrackingPath};
    });
  }
  return {issueForPayment,readTracking,replaceGrant};
}
