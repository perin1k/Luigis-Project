import {queueInternalNotification} from '../notifications/outbox.js';
import {recordDemoAllocations} from './demo-refund-service.js';
import { randomUUID } from 'node:crypto';
import { runTransaction } from '../data/database.js';
import { PricingError } from '../ordering/catalog-service.js';
import { generateSyntheticNumber } from './synthetic-vault.js';
const UUID_PATTERN=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function problem(strCode,strMessage,intStatus=409) { return new PricingError(strCode,strMessage,intStatus); }
export function createDemoPaymentService(objDatabase,{objVault,objCatalogService,objSchedulingService,objTrackingService,fnProcess=()=>true}) {
  function pay(objInput) {
    if(!objVault)throw problem('payment_unavailable','Demonstration checkout is temporarily unavailable. Your selections are preserved.',503);
    if (!objInput || typeof objInput!=='object' || Object.keys(objInput).length!==3 || !['strRequestId','strOrderId','strMethod'].every((strKey)=>Object.hasOwn(objInput,strKey))
      || !UUID_PATTERN.test(objInput.strRequestId) || !UUID_PATTERN.test(objInput.strOrderId) || !['card','apple-pay'].includes(objInput.strMethod)) throw problem('invalid_payment','Use the demonstration payment controls.',422);
    const objResult=runTransaction(objDatabase,()=>{
      const objExisting=objDatabase.prepare('SELECT * FROM demo_payment_attempts WHERE id=?').get(objInput.strRequestId);
      if(objExisting){if(objExisting.order_id!==objInput.strOrderId || objExisting.method!==objInput.strMethod)throw problem('payment_conflict','This request already processed a different payment.');return receipt(objExisting,true);}
      const objPaid=objDatabase.prepare("SELECT * FROM demo_payment_attempts WHERE order_id=? AND state='succeeded'").get(objInput.strOrderId);
      if(objPaid)return receipt(objPaid,true);
      const objOrder=objDatabase.prepare(`SELECT o.*,q.id AS quote_id,q.item_subtotal_cents,q.tax_cents,q.tip_cents,q.total_cents,q.currency,q.expires_at,q.tax_policy_reference
        FROM orders o JOIN order_quotes q ON q.id=o.accepted_quote_id WHERE o.id=? AND q.accepted_at IS NOT NULL`).get(objInput.strOrderId);
      if(!objOrder)throw problem('order_unavailable','Saved order unavailable. Review your order before continuing.',404);
      const dtNow=objSchedulingService.now();
      function reject(strCode,strMessage) {
        objDatabase.prepare("UPDATE capacity_holds SET state='released',released_at=? WHERE booking_id IN (SELECT id FROM fulfillment_bookings WHERE order_id=?) AND state='active'").run(dtNow,objInput.strOrderId);
        return {objError:problem(strCode,strMessage)};
      }
      const objHold=objDatabase.prepare(`SELECT h.*,b.promised_at,b.service_day_id FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id
        WHERE b.order_id=? AND h.state='active'`).get(objInput.strOrderId);
      if(!objHold || objHold.expires_at<=dtNow || objOrder.expires_at<=dtNow || objHold.promised_at<=dtNow) return reject('checkout_expired','The checkout hold expired. Choose a new ready time and review your order.');
      if(!objSchedulingService.hasCapacity(objInput.strOrderId,dtNow))return reject('capacity_changed','Pickup capacity changed. Choose a new ready time.');
      const objDay=objDatabase.prepare('SELECT * FROM service_days WHERE id=?').get(objHold.service_day_id);
      if(!objDay || objDay.is_closed || objHold.promised_at<objDay.opens_at || objHold.promised_at>objDay.latest_pickup_at || objOrder.fulfillment_status!==null
        || objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objInput.strOrderId)) return reject('order_changed','The order needs a new review before payment.');
      try {
        const objCatalog=objCatalogService.readCatalog({bWithinTransaction:true});
        const arrPizzas=objDatabase.prepare(`SELECT l.id,l.quantity,s.code AS strSize,c.code AS strCrust FROM order_lines l JOIN pizza_line_details p ON p.order_line_id=l.id
          JOIN pizza_sizes s ON s.id=p.pizza_size_id JOIN crust_options c ON c.id=p.crust_option_id WHERE l.order_id=? ORDER BY l.line_number`).all(objInput.strOrderId)
          .map((objRow)=>({strSize:objRow.strSize,strCrust:objRow.strCrust,intQuantity:objRow.quantity,arrToppings:objDatabase.prepare('SELECT t.code FROM pizza_line_toppings p JOIN toppings t ON t.id=p.topping_id WHERE p.order_line_id=? ORDER BY t.code').all(objRow.id).map((objTopping)=>objTopping.code)}));
        const arrDrinks=objDatabase.prepare(`SELECT l.quantity,b.code AS strBeverage,s.code AS strSize FROM order_lines l JOIN drink_line_details d ON d.order_line_id=l.id
          JOIN beverages b ON b.id=d.beverage_id JOIN drink_sizes s ON s.id=d.drink_size_id WHERE l.order_id=? ORDER BY l.line_number`).all(objInput.strOrderId)
          .map((objRow)=>({strBeverage:objRow.strBeverage,strSize:objRow.strSize,intQuantity:objRow.quantity}));
        const objCurrent=objCatalogService.priceOrder({strCatalogFingerprint:objCatalog.strFingerprint,arrPizzas,arrDrinks,intTipPercent:0},{bWithinTransaction:true});
        if(objCurrent.centsSubtotal!==objOrder.item_subtotal_cents || objCurrent.centsTax!==objOrder.tax_cents || objCurrent.strTaxPolicy!==objOrder.tax_policy_reference) return reject('price_changed','Prices changed. Review the current total and ready time before a new checkout.');
      } catch(objError){if(objError instanceof PricingError)return reject('items_changed','Some items are unavailable. Edit your order and choose a new ready time.');throw objError;}
      const bApproved=fnProcess();if(typeof bApproved!=='boolean')throw new Error('Invalid demo adapter result.');
      const strNumber=generateSyntheticNumber();const strId=objInput.strRequestId;
      const objEncrypted=objVault.encrypt(strNumber,{strPaymentId:strId,strOrderId:objInput.strOrderId,strQuoteId:objOrder.quote_id});
      if(bApproved)objDatabase.prepare("UPDATE capacity_holds SET state='confirmed',confirmed_at=? WHERE id=? AND state='active'").run(dtNow,objHold.id);
      else objDatabase.prepare("UPDATE capacity_holds SET state='released',released_at=? WHERE id=? AND state='active'").run(dtNow,objHold.id);
      objDatabase.prepare(`INSERT INTO demo_payment_attempts (id,order_id,quote_id,adapter,method,state,amount_cents,currency,evidence_id,synthetic_last_four,created_at,paid_at,failed_at)
        VALUES (?,?,?,'luigis-demo-v1',?,?,?,'USD',?,?,?,?,?)`).run(strId,objInput.strOrderId,objOrder.quote_id,objInput.strMethod,bApproved?'succeeded':'failed',objOrder.total_cents,randomUUID(),strNumber.slice(-4),dtNow,bApproved?dtNow:null,bApproved?null:dtNow);
      objDatabase.prepare('INSERT INTO demo_payment_secrets VALUES (?,?,?,?,?,?)').run(strId,objEncrypted.strKeyId,objEncrypted.strNonceHex,objEncrypted.strCiphertextHex,objEncrypted.strTagHex,new Date(Date.parse(dtNow)+7*86400000).toISOString());
      // Explicit short-lived ciphertext lifecycle; immutable masked financial history is separate.
      objDatabase.prepare('DELETE FROM demo_payment_secrets WHERE expires_at<=?').run(dtNow);
      if(bApproved){
        recordDemoAllocations(objDatabase,strId,dtNow);
        objDatabase.prepare("UPDATE orders SET fulfillment_status='Received',received_at=?,revision=revision+1 WHERE id=? AND fulfillment_status IS NULL").run(dtNow,objInput.strOrderId);
        const intSequence=objDatabase.prepare('SELECT coalesce(max(sequence),0)+1 AS n FROM order_events WHERE order_id=?').get(objInput.strOrderId).n;
        const strEventId=randomUUID();
        objDatabase.prepare("INSERT INTO order_events (id,order_id,sequence,event_type,to_status,occurred_at,reason_code) VALUES (?,?,?,'demo_payment_confirmed','Received',?,'demo_payment')").run(strEventId,objInput.strOrderId,intSequence,dtNow);
        queueInternalNotification(objDatabase,objInput.strOrderId,strEventId,'confirmation',dtNow);
      }
      const objReceipt=receipt(objDatabase.prepare('SELECT * FROM demo_payment_attempts WHERE id=?').get(strId),false);
      if(bApproved&&objTrackingService)objReceipt.strTrackingPath=objTrackingService.issueForPayment(objInput.strOrderId,dtNow);
      return objReceipt;
    });
    if(objResult.objError)throw objResult.objError;return objResult;
  }
  function receipt(objPayment,bReplayed){
    const objOrder=objDatabase.prepare('SELECT public_reference,service_type FROM orders WHERE id=?').get(objPayment.order_id);
    const objQuote=objDatabase.prepare('SELECT item_subtotal_cents,tax_cents,tip_cents,total_cents FROM order_quotes WHERE id=?').get(objPayment.quote_id);
    return {strState:objPayment.state,strAdapter:'luigis-demo-v1',strMethod:objPayment.method,strReference:objOrder.public_reference,bReplayed,
      strMaskedIdentity:`•••• ${objPayment.synthetic_last_four}`,strService:objOrder.service_type,dtPaidAt:objPayment.paid_at,
      objPickup:objSchedulingService.readReservation(objPayment.order_id),
      objTotals:{centsSubtotal:objQuote.item_subtotal_cents,centsTax:objQuote.tax_cents,centsTip:objQuote.tip_cents,centsTotal:objQuote.total_cents},
      arrItems:receiptItems(objPayment.order_id),
      strMessage:objPayment.state==='succeeded'?'Demonstration payment successful. Your demonstration order is confirmed. No money was charged.':'Demonstration payment declined. No money was charged. Choose a ready time to start a new checkout.'};
  }
  function receiptItems(strOrderId){
    return objDatabase.prepare('SELECT id,item_type,quantity AS intQuantity,display_name_snapshot AS strLabel,line_subtotal_cents AS centsTotal FROM order_lines WHERE order_id=? ORDER BY line_number').all(strOrderId).map((objRow)=>{
      let strLabel=objRow.strLabel;
      if(objRow.item_type==='pizza'){
        const objPizza=objDatabase.prepare('SELECT size_name_snapshot,crust_name_snapshot FROM pizza_line_details WHERE order_line_id=?').get(objRow.id);
        const arrNames=objDatabase.prepare('SELECT name_snapshot FROM pizza_line_toppings WHERE order_line_id=? ORDER BY name_snapshot').all(objRow.id).map((objTopping)=>objTopping.name_snapshot);
        strLabel=`${objPizza.size_name_snapshot} pizza · ${objPizza.crust_name_snapshot} · ${arrNames.join(', ')||'Marinara & cheese'}`;
      }
      return {intQuantity:objRow.intQuantity,strLabel,centsTotal:objRow.centsTotal};
    });
  }
  function purgeExpiredSecrets(){return runTransaction(objDatabase,()=>objDatabase.prepare('DELETE FROM demo_payment_secrets WHERE expires_at<=?').run(objSchedulingService.now()).changes);}
  return {pay,purgeExpiredSecrets};
}
