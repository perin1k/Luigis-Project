import {randomUUID} from 'node:crypto';
import {runTransaction} from './database.js';
import {orderRetentionDeadline} from './order-retention.js';

/** Server-owned disposable-demo cleanup. Never exposed through a request route. */
export function createRetentionService(objDatabase,{fnNow=()=>new Date()}={}){
  function audit(strEntityId,dtNow){const strId=randomUUID();objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,NULL,'retention_cleanup','retention',?,?,?,'retention','Record redacted')").run(strId,strEntityId,dtNow,strId);}
  function cleanup(){return runTransaction(objDatabase,()=>{
    const dtNow=fnNow().toISOString();const objResult={intOrders:0,intContacts:0,intTrackingGrants:0,intNotifications:0,intPaymentSecrets:0};
    const arrOrders=objDatabase.prepare("SELECT o.* FROM orders o WHERE o.fulfillment_status IN ('Completed','Cancelled','Not collected') AND (EXISTS(SELECT 1 FROM order_contacts c WHERE c.order_id=o.id AND c.redacted_at IS NULL) OR EXISTS(SELECT 1 FROM tracking_grants g WHERE g.order_id=o.id) OR EXISTS(SELECT 1 FROM notification_outbox n WHERE n.order_id=o.id)) ORDER BY o.id").all();
    for(const objOrder of arrOrders){
      if(objResult.intOrders>=50)break;const dtDeadline=orderRetentionDeadline(objDatabase,objOrder);if(!dtDeadline||dtNow<dtDeadline)continue;
      objResult.intContacts+=objDatabase.prepare('UPDATE order_contacts SET customer_name=NULL,phone=NULL,email=NULL,redacted_at=? WHERE order_id=? AND redacted_at IS NULL').run(dtNow,objOrder.id).changes;
      objResult.intTrackingGrants+=objDatabase.prepare('DELETE FROM tracking_grants WHERE order_id=?').run(objOrder.id).changes;
      objResult.intNotifications+=objDatabase.prepare('DELETE FROM notification_outbox WHERE order_id=?').run(objOrder.id).changes;
      audit(objOrder.id,dtNow);objResult.intOrders++;
    }
    // Ciphertext has its separately approved seven-days-after-attempt lifecycle.
    objResult.intPaymentSecrets=objDatabase.prepare('DELETE FROM demo_payment_secrets WHERE payment_id IN (SELECT payment_id FROM demo_payment_secrets WHERE expires_at<=? ORDER BY expires_at,payment_id LIMIT 50)').run(dtNow).changes;
    if(objResult.intPaymentSecrets)audit('demo-payment-secrets',dtNow);
    return objResult;
  });}
  return {cleanup};
}
