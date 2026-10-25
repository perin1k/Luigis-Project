/**
 * Full demonstration refunds require an approved cancellation and server-authorized staff action. Signed component allocations reverse the original payment for date-based reporting.
 */
import { queueInternalNotification } from '../notifications/outbox.js';
import { randomUUID } from 'node:crypto';
import { StaffOrderError } from '../staff/orders-service.js';
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** Record item/tax/tip components; a refund writes equal negative components. */

export function recordDemoAllocations(objDatabase, strPaymentId, dtEffectiveAt, strRefundId = null) {
  const objQuote = objDatabase.prepare('SELECT q.* FROM order_quotes q JOIN demo_payment_attempts p ON p.quote_id=q.id WHERE p.id=?').get(strPaymentId);
  for (const [strComponent, centsValue] of[['item', objQuote.item_subtotal_cents], ['tax', objQuote.tax_cents], ['tip', objQuote.tip_cents]]) objDatabase.prepare('INSERT INTO demo_financial_allocations (id,payment_id,refund_id,component,signed_cents,effective_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), strPaymentId, strRefundId, strComponent, strRefundId ? - centsValue: centsValue, dtEffectiveAt);
}

function event(objDatabase, strOrderId, strType, dtNow, strActor) {
  const strId = randomUUID();
  objDatabase.prepare('INSERT INTO order_events (id,order_id,sequence,event_type,occurred_at,actor_id) VALUES (?,?,(SELECT coalesce(max(sequence),0)+1 FROM order_events WHERE order_id=?),?,?,?)').run(strId, strOrderId, strOrderId, strType, dtNow, strActor);
  return strId;
}

export function createDemoRefundService(objDatabase, objSessions, { fnProcess =() => true } = {}) {
  function refund(strSession, strReference, objInput) {
    return objSessions.executeAuthorized(strSession, 'refund.approve',(objIdentity, dtNow) => {
      if (!objInput || Array.isArray(objInput) || Object.keys(objInput).length !== 2 || !UUID_PATTERN.test(objInput.strRequestId) || !Number.isSafeInteger(objInput.intRevision) || objInput.intRevision < 1) throw new StaffOrderError('Check the refund request.', 400);
      const objOrder = objDatabase.prepare('SELECT * FROM orders WHERE public_reference=?').get(strReference);
      if (!objOrder) throw new StaffOrderError('Order not found.', 404);
      const objExisting = objDatabase.prepare('SELECT * FROM demo_refund_attempts WHERE id=?').get(objInput.strRequestId);
      if (objExisting) {
        if (objExisting.order_id !== objOrder.id) throw new StaffOrderError('This refund request belongs to another order.', 409);
        return result(objExisting, true);
      }
      const objPaid = objDatabase.prepare("SELECT * FROM demo_payment_attempts WHERE order_id=? AND quote_id=? AND state='succeeded'").get(objOrder.id, objOrder.accepted_quote_id);
      if (!objPaid) throw new StaffOrderError('A confirmed demonstration payment is required.', 409);
      const objRefunded = objDatabase.prepare("SELECT * FROM demo_refund_attempts WHERE payment_id=? AND state='succeeded'").get(objPaid.id);
      if (objRefunded) return result(objRefunded, true);
      if (objOrder.revision !== objInput.intRevision) throw new StaffOrderError('Order changed. Refresh before approving a refund.', 409);
      const objCancellation = objDatabase.prepare("SELECT * FROM cancellation_requests WHERE order_id=? AND state='approved' ORDER BY decided_at DESC,id LIMIT 1").get(objOrder.id);
      if (objOrder.fulfillment_status !== 'Cancelled' || !objCancellation) throw new StaffOrderError('Approve the cancellation before refunding.', 409);
      if (objDatabase.prepare("SELECT id FROM demo_refund_attempts WHERE payment_id=? AND state='pending'").get(objPaid.id)) throw new StaffOrderError('A refund is pending reconciliation. Do not start another.', 409);
      const dtOccurred = dtNow.toISOString();
      const strId = objInput.strRequestId;
      objDatabase.prepare("INSERT INTO demo_refund_attempts (id,payment_id,order_id,cancellation_request_id,adapter,policy_reference,state,amount_cents,currency,approved_by,requested_at) VALUES (?,?,?,?,'luigis-demo-v1','demo-full-refund-v1','pending',?,'USD',?,?)")
      .run(strId, objPaid.id, objOrder.id, objCancellation.id, objPaid.amount_cents, objIdentity.strUserId, dtOccurred);
      event(objDatabase, objOrder.id, 'demo_refund_requested', dtOccurred, objIdentity.strUserId);
      // Synchronous local adapter only. No remote operation is held across a SQL lock.
      const bApproved = fnProcess();
      if (typeof bApproved !== 'boolean') throw new Error('Invalid demonstration refund outcome.');
      objDatabase.prepare('UPDATE demo_refund_attempts SET state=?,confirmed_at=?,failed_at=?,evidence_id=? WHERE id=?').run(bApproved ? 'succeeded': 'failed', bApproved ? dtOccurred: null, bApproved ? null: dtOccurred, bApproved ? randomUUID(): null, strId);
      if (bApproved) recordDemoAllocations(objDatabase, objPaid.id, dtOccurred, strId);
      objDatabase.prepare('UPDATE orders SET revision=revision+1 WHERE id=?').run(objOrder.id);
      const strEventId = event(objDatabase, objOrder.id, bApproved ? 'demo_refund_confirmed': 'demo_refund_failed', dtOccurred, objIdentity.strUserId);
      if (bApproved) queueInternalNotification(objDatabase, objOrder.id, strEventId, 'refund', dtOccurred);
      objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,'refund_update','order',?,?,?,'operator_request','Refund recorded')").run(randomUUID(), objIdentity.strUserId, objOrder.id, dtOccurred, strEventId);
      return result(objDatabase.prepare('SELECT * FROM demo_refund_attempts WHERE id=?').get(strId), false);
    });
  }
  function result(objAttempt, bReplayed) {
    return {
      strState: objAttempt.state,
      centsAmount: objAttempt.amount_cents,
      bReplayed,
      strMessage: objAttempt.state === 'succeeded' ? 'Demonstration refund completed. No money was transferred.': objAttempt.state === 'failed' ? 'Demonstration refund failed. Refresh and review before a new attempt.': 'Refund pending reconciliation. Do not start another.'
    };
  }
  return { refund };
}
