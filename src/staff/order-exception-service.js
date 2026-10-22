import {randomUUID} from 'node:crypto';
import {StaffOrderError} from './orders-service.js';
export function createOrderExceptionService(objDatabase,objSessions){
  function decide(strSession,strReference,objInput){
    return objSessions.executeAuthorized(strSession,'cancellation.decide',(objIdentity,dtNow)=>{
      if(!objInput||Object.keys(objInput).length!==2||!Number.isSafeInteger(objInput.intRevision)||objInput.intRevision<1||!['cancel','deny-cancellation','not-collected','resolve-review'].includes(objInput.strAction))throw new StaffOrderError('Check the administrative action.',400);
      const objOrder=objDatabase.prepare(`SELECT o.* FROM orders o WHERE public_reference=? AND EXISTS (SELECT 1 FROM demo_payment_attempts p WHERE p.order_id=o.id AND p.quote_id=o.accepted_quote_id AND p.state='succeeded')`).get(strReference);
      if(!objOrder)throw new StaffOrderError('Confirmed demonstration order not found.',404);
      if(objInput.intRevision!==objOrder.revision||!['Received','Preparing','Baking','Ready'].includes(objOrder.fulfillment_status))throw new StaffOrderError('Order changed. Refresh before deciding.',409);
      const dtOccurred=dtNow.toISOString();const objLatest=objDatabase.prepare('SELECT occurred_at FROM order_events WHERE order_id=? ORDER BY sequence DESC LIMIT 1').get(objOrder.id);if(objLatest&&objLatest.occurred_at>dtOccurred)throw new StaffOrderError('Order timing needs review.',409);let strNext=objOrder.fulfillment_status;
      const objPending=objDatabase.prepare("SELECT * FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id);
      if(objInput.strAction==='cancel'||objInput.strAction==='deny-cancellation'){
        if(objInput.strAction==='deny-cancellation'&&!objPending)throw new StaffOrderError('No cancellation request is pending.',409);
        let strRequestId=objPending?.id;
        if(!strRequestId){strRequestId=randomUUID();objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code,requested_at) VALUES (?,?,'restaurant','cannot_fulfill',?)").run(strRequestId,objOrder.id,dtOccurred);}
        objDatabase.prepare('UPDATE cancellation_requests SET state=?,decided_at=?,decided_by=?,decision_reason=? WHERE id=?')
          .run(objInput.strAction==='cancel'?'approved':'denied',dtOccurred,objIdentity.strUserId,'Admin reviewed synthetic order',strRequestId);
        if(objInput.strAction==='cancel')strNext='Cancelled';
      }else if(objInput.strAction==='not-collected'){
        const objDay=objDatabase.prepare('SELECT d.closes_at FROM service_days d JOIN fulfillment_bookings b ON b.service_day_id=d.id WHERE b.order_id=?').get(objOrder.id);
        if(objOrder.fulfillment_status==='Received'||!objDay||dtOccurred<objDay.closes_at||objPending)throw new StaffOrderError('Only prepared, uncollected orders can be marked at closing, after pending review.',409);
        strNext='Not collected';
      }else{
        const arrReviews=objDatabase.prepare("SELECT * FROM fulfillment_reviews WHERE order_id=? AND state='open'").all(objOrder.id);
        if(!arrReviews.length||arrReviews.some((objReview)=>objReview.trigger_type==='late_payment'))throw new StaffOrderError('This review requires booking recovery before it can be resolved.',409);
        objDatabase.prepare("UPDATE fulfillment_reviews SET state='resolved',resolved_at=?,resolved_by=?,resolution='Admin reviewed; preparation safeguards remain enforced' WHERE order_id=? AND state='open'").run(dtOccurred,objIdentity.strUserId,objOrder.id);
      }
      const strColumn=strNext==='Cancelled'?'cancelled_at':strNext==='Not collected'?'not_collected_at':null;
      objDatabase.prepare(`UPDATE orders SET fulfillment_status=?,revision=revision+1${strColumn?`,${strColumn}=?`:''} WHERE id=?`).run(strNext,...(strColumn?[dtOccurred]:[]),objOrder.id);
      if(strColumn)objDatabase.prepare("UPDATE capacity_holds SET state='released',released_at=? WHERE booking_id IN (SELECT id FROM fulfillment_bookings WHERE order_id=?) AND state IN ('active','confirmed')").run(dtOccurred,objOrder.id);
      const strId=randomUUID();objDatabase.prepare("INSERT INTO order_events (id,order_id,sequence,event_type,from_status,to_status,occurred_at,actor_id,reason_code) VALUES (?,?,(SELECT coalesce(max(sequence),0)+1 FROM order_events WHERE order_id=?),'admin_order_decision',?,?,?,?,?)")
        .run(strId,objOrder.id,objOrder.id,objOrder.fulfillment_status,strNext,dtOccurred,objIdentity.strUserId,objInput.strAction);
      objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,'fulfillment_change','order',?,?,?,'operator_request','Order status changed')").run(randomUUID(),objIdentity.strUserId,objOrder.id,dtOccurred,strId);
      return {strStatus:strNext,intRevision:objOrder.revision+1,bRefundReviewRequired:strNext==='Cancelled'};
    });
  }
  return {decide};
}
