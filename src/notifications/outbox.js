import {randomUUID} from 'node:crypto';
// Caller owns the state-change transaction. No external delivery occurs here.
export function queueInternalNotification(objDatabase,strOrderId,strEventId,strTemplate,dtNow){
  const objContact=objDatabase.prepare('SELECT phone,email,redacted_at FROM order_contacts WHERE order_id=?').get(strOrderId);
  if(!objContact||objContact.redacted_at)return;
  for(const [strChannel,bUsable] of [['email',Boolean(objContact.email)],['sms',Boolean(objContact.phone)]])if(bUsable)objDatabase.prepare('INSERT INTO notification_outbox (id,order_id,source_event_id,channel,template_key,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(source_event_id,channel,template_key) DO NOTHING').run(randomUUID(),strOrderId,strEventId,strChannel,strTemplate,dtNow);
}
