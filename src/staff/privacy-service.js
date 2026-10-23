import {randomUUID} from 'node:crypto';
import {orderRetentionDeadline} from '../data/order-retention.js';
import {validateContact} from '../ordering/order-service.js';
import {StaffOrderError} from './orders-service.js';

/** Authorization, revision checks, contact changes and sanitized audit share one lock. */
export function createPrivacyService(objDatabase,objSessions) {
  function current(strReference,dtNow) {
    if(typeof strReference!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(strReference))throw new StaffOrderError('Order not found.',404);
    const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=?').get(strReference);
    if(!objOrder)throw new StaffOrderError('Order not found.',404);
    const objContact=objDatabase.prepare('SELECT * FROM order_contacts WHERE order_id=?').get(objOrder.id);
    const dtDeadline=orderRetentionDeadline(objDatabase,objOrder);
    if(!objContact||objContact.redacted_at||dtDeadline&&dtNow.toISOString()>=dtDeadline)throw new StaffOrderError('Contact details are no longer available.',410);
    return {objOrder,objContact};
  }
  function view(objOrder,objContact) {
    return {strReference:objOrder.public_reference,intRevision:objOrder.revision,strService:objOrder.service_type,
      objContact:{strName:objContact.customer_name??'',strPhone:objContact.phone??'',strEmail:objContact.email??''}};
  }
  function reviewed(objInput,objOrder,arrKeys) {
    if(!objInput||Array.isArray(objInput)||Object.keys(objInput).length!==arrKeys.length||arrKeys.some(strKey=>!Object.hasOwn(objInput,strKey))||objInput.bReviewed!==true||!Number.isSafeInteger(objInput.intRevision)||objInput.intRevision<1)throw new StaffOrderError('Verify the requester and review this order first.');
    if(objInput.intRevision!==objOrder.revision)throw new StaffOrderError('Order changed. Reload this page before continuing.',409);
  }
  function audit(objIdentity,objOrder,strAction,dtNow) {
    objDatabase.prepare('INSERT INTO privacy_actions (id,actor_id,order_id,action,order_revision,occurred_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(),objIdentity.strUserId,objOrder.id,strAction,objOrder.revision,dtNow.toISOString());
  }
  return {
    read(strToken,strReference) {
      return objSessions.executeAuthorized(strToken,'privacy.manage',(objIdentity,dtNow)=>{
        const {objOrder,objContact}=current(strReference,dtNow);return view(objOrder,objContact);
      });
    },
    correct(strToken,strReference,objInput) {
      return objSessions.executeAuthorized(strToken,'privacy.manage',(objIdentity,dtNow)=>{
        const {objOrder}=current(strReference,dtNow);reviewed(objInput,objOrder,['intRevision','bReviewed','objContact']);
        let objClean;
        try {objClean=validateContact(objInput.objContact,objOrder.service_type);} catch {throw new StaffOrderError('Check the name, phone and email. Carry-out requires a phone; dine-in requires a phone or email.');}
        objDatabase.prepare('UPDATE order_contacts SET customer_name=?,phone=?,email=? WHERE order_id=? AND redacted_at IS NULL')
          .run(objClean.strName,objClean.strPhone||null,objClean.strEmail||null,objOrder.id);
        objDatabase.prepare('UPDATE orders SET revision=revision+1 WHERE id=?').run(objOrder.id);
        objOrder.revision++;audit(objIdentity,objOrder,'contact_corrected',dtNow);
        return {intRevision:objOrder.revision,strMessage:'Contact correction saved. Purchased prices and privacy expiry are unchanged.'};
      });
    },
    copy(strToken,strReference,objInput) {
      return objSessions.executeAuthorized(strToken,'privacy.manage',(objIdentity,dtNow)=>{
        const {objOrder,objContact}=current(strReference,dtNow);reviewed(objInput,objOrder,['intRevision','bReviewed']);
        audit(objIdentity,objOrder,'copy_reviewed',dtNow);
        return {strReference:objOrder.public_reference,strService:objOrder.service_type,strStatus:objOrder.fulfillment_status??'Unpaid',
          objContact:view(objOrder,objContact).objContact,
          arrItems:objDatabase.prepare('SELECT display_name_snapshot,quantity FROM order_lines WHERE order_id=? ORDER BY line_number').all(objOrder.id)
            .map(objLine=>({strDescription:objLine.display_name_snapshot,intQuantity:objLine.quantity}))};
      });
    },
  };
}
