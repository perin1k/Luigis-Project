/**
 * Revision-checked kitchen transitions preserve workflow ordering, capacity and
 * cancellation safeguards. Progress writes and their audit/events share the authorized
 * transaction.
 */
import {queueInternalNotification} from '../notifications/outbox.js';
import {randomUUID} from 'node:crypto';
import {StaffOrderError} from './orders-service.js';
const NEXT_STATUS={Received:'Preparing',Preparing:'Baking',Baking:'Ready',Ready:'Completed'};
const TIMESTAMP_COLUMN={Preparing:'preparing_at',Baking:'baking_at',Ready:'ready_at',Completed:'completed_at'};
/** Authorization, guard reads, revision change and append-only event share one lock. */
export function createOrderProgressService(objDatabase,objSessionService){
  function advanceOrder(strToken,strReference,objInput){
    return objSessionService.executeAuthorized(strToken,'orders.prepare',(objIdentity,dtNow)=>{
      if(!objInput||Array.isArray(objInput)||Object.keys(objInput).length!==2||!Object.hasOwn(objInput,'intRevision')||!Object.hasOwn(objInput,'strStatus')
        ||!Number.isSafeInteger(objInput.intRevision)||objInput.intRevision<1||!Object.hasOwn(TIMESTAMP_COLUMN,objInput.strStatus))throw new StaffOrderError('Check the requested order status.',400);
      const objOrder=objDatabase.prepare(`SELECT * FROM orders o WHERE public_reference=? AND (
        EXISTS(SELECT 1 FROM demo_payment_attempts p WHERE p.order_id=o.id AND p.quote_id=o.accepted_quote_id AND p.state='succeeded') OR
        EXISTS(SELECT 1 FROM payment_attempts p WHERE p.order_id=o.id AND p.quote_id=o.accepted_quote_id AND p.state='succeeded'))`).get(strReference);
      if(!objOrder)throw new StaffOrderError('Order not found.',404);
      if(objOrder.revision!==objInput.intRevision||NEXT_STATUS[objOrder.fulfillment_status]!==objInput.strStatus)throw new StaffOrderError('This order changed. Refresh it before updating.',409);
      if(objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.id)
        ||objDatabase.prepare("SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'").get(objOrder.id))throw new StaffOrderError('This order is held for review. Contact an administrator.',409);
      if(objInput.strStatus==='Preparing'){
        if(!objDatabase.prepare("SELECT h.id FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id WHERE b.order_id=? AND h.state='confirmed'").get(objOrder.id))throw new StaffOrderError('Booking capacity needs administrator review.',409);
        // Recheck the purchased recipe, including its original catalog mappings, rather than repricing it.
        const objUnavailable=objDatabase.prepare(`SELECT l.id FROM order_lines l WHERE l.order_id=? AND EXISTS (
          SELECT 1 FROM catalog_ingredient_requirements r JOIN ingredients i ON i.id=r.ingredient_id
          WHERE i.is_available=0 AND r.catalog_version_id=l.catalog_version_id AND (
            EXISTS(SELECT 1 FROM pizza_line_details d WHERE d.order_line_id=l.id AND (r.pizza_size_id=d.pizza_size_id OR r.crust_option_id=d.crust_option_id)) OR
            EXISTS(SELECT 1 FROM pizza_line_toppings t WHERE t.order_line_id=l.id AND r.topping_id=t.topping_id) OR
            EXISTS(SELECT 1 FROM drink_line_details d WHERE d.order_line_id=l.id AND r.beverage_id=d.beverage_id))) LIMIT 1`).get(objOrder.id);
        if(objUnavailable)throw new StaffOrderError('An ingredient is unavailable. Hold this order for administrator review.',409);
      }
      const dtOccurred=dtNow.toISOString();
      const objLatest=objDatabase.prepare('SELECT occurred_at FROM order_events WHERE order_id=? ORDER BY sequence DESC LIMIT 1').get(objOrder.id);
      if(objLatest&&objLatest.occurred_at>dtOccurred)throw new StaffOrderError('Order timing needs review.',409);
      objDatabase.prepare(`UPDATE orders SET fulfillment_status=?,${TIMESTAMP_COLUMN[objInput.strStatus]}=?,revision=revision+1 WHERE id=? AND revision=?`)
        .run(objInput.strStatus,dtOccurred,objOrder.id,objInput.intRevision);
      const strEventId=randomUUID();
      objDatabase.prepare(`INSERT INTO order_events (id,order_id,sequence,event_type,from_status,to_status,occurred_at,actor_id)
        VALUES (?,?,(SELECT coalesce(max(sequence),0)+1 FROM order_events WHERE order_id=?),'fulfillment_progress',?,?,?,?)`)
        .run(strEventId,objOrder.id,objOrder.id,objOrder.fulfillment_status,objInput.strStatus,dtOccurred,objIdentity.strUserId);
      if(objInput.strStatus==='Ready')queueInternalNotification(objDatabase,objOrder.id,strEventId,'ready',dtOccurred);
      return {strStatus:objInput.strStatus,intRevision:objInput.intRevision+1,dtOccurredAt:dtOccurred};
    });
  }
  return {advanceOrder};
}
