/**
 * Shared privacy-deadline calculation for tracking, previews and cleanup. Unresolved
 * cancellation/refund cases postpone expiry; final records use the latest relevant
 * resolution plus seven days.
 */
const FINAL_STATES=['Completed','Cancelled','Not collected'];
export function hasPendingCase(objDatabase,strOrderId){
  return Boolean(objDatabase.prepare("SELECT id FROM cancellation_requests c WHERE c.order_id=? AND (c.state='pending' OR (c.state='approved' AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.cancellation_request_id=c.id AND r.state='succeeded') AND NOT EXISTS(SELECT 1 FROM demo_refund_attempts d WHERE d.cancellation_request_id=c.id AND d.state='succeeded')))").get(strOrderId)
    ||objDatabase.prepare("SELECT r.id FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=? AND r.state!='succeeded'").get(strOrderId));
}
export function orderRetentionDeadline(objDatabase,objOrder){
  if(objOrder.fulfillment_status===null)return unpaidCheckoutRetentionDeadline(objDatabase,objOrder);
  if(!FINAL_STATES.includes(objOrder.fulfillment_status)||hasPendingCase(objDatabase,objOrder.id))return null;
  const arrTimes=[objOrder.completed_at,objOrder.cancelled_at,objOrder.not_collected_at,
    ...objDatabase.prepare('SELECT decided_at FROM cancellation_requests WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.decided_at),
    ...objDatabase.prepare('SELECT confirmed_at FROM demo_refund_attempts WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.confirmed_at),
    ...objDatabase.prepare('SELECT r.confirmed_at FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=?').all(objOrder.id).map((objRow)=>objRow.confirmed_at)].filter(Boolean);
  return new Date(Math.max(...arrTimes.map(Date.parse))+7*86400000).toISOString();
}

function unpaidCheckoutRetentionDeadline(objDatabase,objOrder){
  if(hasPendingCase(objDatabase,objOrder.id)
    ||objDatabase.prepare("SELECT id FROM payment_attempts WHERE order_id=? AND state IN ('pending','succeeded')").get(objOrder.id)
    ||objDatabase.prepare("SELECT id FROM demo_payment_attempts WHERE order_id=? AND state='succeeded'").get(objOrder.id)
    ||objDatabase.prepare("SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'").get(objOrder.id)
    ||objDatabase.prepare("SELECT h.id FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id WHERE b.order_id=? AND h.state='confirmed'").get(objOrder.id))return null;
  const objQuote=objDatabase.prepare('SELECT expires_at FROM order_quotes WHERE id=? AND order_id=?').get(objOrder.accepted_quote_id,objOrder.id);
  if(!objQuote)return null;
  const arrTimes=[objQuote.expires_at,
    ...objDatabase.prepare('SELECT failed_at FROM payment_attempts WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.failed_at),
    ...objDatabase.prepare('SELECT failed_at FROM demo_payment_attempts WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.failed_at),
    ...objDatabase.prepare('SELECT decided_at FROM cancellation_requests WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.decided_at),
    ...objDatabase.prepare('SELECT resolved_at FROM fulfillment_reviews WHERE order_id=?').all(objOrder.id).map((objRow)=>objRow.resolved_at),
    ...objDatabase.prepare('SELECT h.expires_at FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id WHERE b.order_id=?').all(objOrder.id).map((objRow)=>objRow.expires_at)].filter(Boolean);
  return new Date(Math.max(...arrTimes.map(Date.parse))+7*86400000).toISOString();
}
