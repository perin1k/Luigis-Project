import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createSchedulingService } from '../../src/ordering/scheduling-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
import { createDemoPaymentService } from '../../src/payments/demo-payment-service.js';
import { createSyntheticVault,generateSyntheticNumber } from '../../src/payments/synthetic-vault.js';
function fixture(fnWork){
  const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);seedMenu(objDatabase);let dtNow='2026-10-21T15:00:00.000Z';
  const objCatalogService=createCatalogService(objDatabase);const objSchedulingService=createSchedulingService(objDatabase,{fnNow:()=>dtNow});
  const objVault=createSyntheticVault({strActiveKeyId:'test-v1',mapKeys:{'test-v1':randomBytes(32).toString('hex')}});
  const strOrderId=randomUUID();const objPricing={strCatalogFingerprint:objCatalogService.readCatalog().strFingerprint,arrPizzas:[{strSize:'large',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:10};
  createOrderService(objDatabase,objCatalogService,objSchedulingService).submitOrder({strRequestId:strOrderId,strService:'carry-out',objContact:{strName:'Synthetic Guest',strPhone:'2025550100',strEmail:''},objPricing,objPickup:objSchedulingService.listOptions(1).arrOptions[0]});
  function service(objOptions={}){return createDemoPaymentService(objDatabase,{objVault,objCatalogService,objSchedulingService,...objOptions});}
  try{fnWork({objDatabase,objVault,service,objInput:{strOrderId,strRequestId:randomUUID(),strMethod:'card'},setNow:(dtValue)=>{dtNow=dtValue;}});}finally{objDatabase.close();}
}
test('authenticated encryption binds every identity and key version; rotation retains old-key readability',()=>{
  const strOldKey=randomBytes(32).toString('hex');const strNewKey=randomBytes(32).toString('hex');const objIdentity={strPaymentId:randomUUID(),strOrderId:randomUUID(),strQuoteId:randomUUID()};
  const objOld=createSyntheticVault({strActiveKeyId:'old',mapKeys:{old:strOldKey}});const strNumber=generateSyntheticNumber();const objRecord=objOld.encrypt(strNumber,objIdentity);
  const objNew=createSyntheticVault({strActiveKeyId:'new',mapKeys:{old:strOldKey,new:strNewKey}});
  assert.equal(objNew.decrypt(objRecord,objIdentity)===strNumber,true);assert.equal(objRecord.strCiphertextHex.includes(strNumber),false);
  assert.notEqual(objOld.encrypt(strNumber,objIdentity).strNonceHex,objRecord.strNonceHex);
  for(const objBad of [{...objRecord,strTagHex:'0'.repeat(32)},{...objRecord,strKeyId:'missing'},{...objRecord,strCiphertextHex:'f'.repeat(32)}])assert.throws(()=>objNew.decrypt(objBad,objIdentity),/Unable to verify/);
  assert.throws(()=>objNew.decrypt(objRecord,{...objIdentity,strOrderId:randomUUID()}),/Unable to verify/);
  assert.throws(()=>objOld.encrypt('not-a-generated-identity',objIdentity));
});
test('success commits ciphertext, exact amount, confirmed hold, Received timestamp and event with safe replay',()=>fixture(({objDatabase,objVault,service,objInput,setNow})=>{
  const objPayment=service();const objReceipt=objPayment.pay(objInput);assert.equal(objReceipt.strState,'succeeded');assert.equal(objReceipt.objTotals.centsTotal,1449);
  assert.equal(objReceipt.objPickup.strHoldState,'confirmed');assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'Received');
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM provider_events').get().n,0);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM payment_attempts').get().n,0);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM order_events').get().n,1);
  const objSecret=objDatabase.prepare('SELECT * FROM demo_payment_secrets').get();const objAttempt=objDatabase.prepare('SELECT * FROM demo_payment_attempts').get();
  const strNumber=objVault.decrypt({strKeyId:objSecret.key_id,strNonceHex:objSecret.nonce_hex,strCiphertextHex:objSecret.ciphertext_hex,strTagHex:objSecret.tag_hex},{strPaymentId:objAttempt.id,strOrderId:objAttempt.order_id,strQuoteId:objAttempt.quote_id});
  assert.equal(/^0000\d{12}$/.test(strNumber),true);assert.equal(JSON.stringify(objReceipt).includes(strNumber),false);
  setNow('2026-10-21T16:00:00.000Z');assert.deepEqual(objPayment.pay(objInput),{...objReceipt,bReplayed:true});
  assert.equal(objPayment.pay({...objInput,strRequestId:randomUUID()}).strReference,objReceipt.strReference);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,1);
  assert.throws(()=>objPayment.pay({...objInput,strMethod:'apple-pay'}),/different payment/);
}));
test('decline releases capacity and stays unpaid; replay does not change the outcome',()=>fixture(({objDatabase,service,objInput})=>{
  const objPayment=service({fnProcess:()=>false});const objFailed=objPayment.pay(objInput);assert.equal(objFailed.strState,'failed');assert.equal(objFailed.objPickup.strHoldState,'released');
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,0);
  assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,null);
  assert.equal(service().pay(objInput).strState,'failed');
  assert.throws(()=>service().pay({...objInput,strRequestId:randomUUID()}),/hold expired/);
}));
test('expired hold, changed prices and unavailable ingredients reject payment and release the hold',()=>{
  for(const strScenario of ['expired','price','ingredient'])fixture(({objDatabase,service,objInput,setNow})=>{
    if(strScenario==='expired')setNow('2026-10-21T15:30:00.000Z');
    if(strScenario==='price')objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=1000 WHERE code='large'");
    if(strScenario==='ingredient')objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='cheese'");
    assert.throws(()=>service().pay(objInput));assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,0);
    assert.equal(objDatabase.prepare('SELECT state FROM capacity_holds').get().state,'released');
  });
});
test('encryption or event-write failure rolls back payment, hold confirmation and fulfillment',()=>{
  for(const strFailure of ['encryption','event'])fixture(({objDatabase,service,objInput})=>{
    if(strFailure==='event')objDatabase.exec("CREATE TRIGGER fail_demo_event BEFORE INSERT ON order_events BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    const objPayment=service(strFailure==='encryption'?{objVault:{encrypt(){throw new Error('fixture encryption failure');}}}:{});
    assert.throws(()=>objPayment.pay(objInput));assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,0);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_secrets').get().n,0);assert.equal(objDatabase.prepare('SELECT state FROM capacity_holds').get().state,'active');
    assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,null);
  });
});
test('no key fails closed; forged fields and browser outcomes are rejected',()=>fixture(({service,objInput})=>{
  assert.throws(()=>service({objVault:null}).pay(objInput),/temporarily unavailable/);
  for(const objBad of [{...objInput,strNumber:'rejected-input'},{...objInput,bApproved:true},{...objInput,centsTotal:1},{...objInput,strMethod:'cash'}])assert.throws(()=>service().pay(objBad));
}));
test('expired encrypted numbers are deleted while immutable masked financial history remains',()=>fixture(({objDatabase,service,objInput,setNow})=>{
  const objPayment=service();objPayment.pay(objInput);setNow('2026-10-28T15:00:00.000Z');
  assert.equal(objPayment.purgeExpiredSecrets(),1);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_secrets').get().n,0);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,1);
  assert.throws(()=>objDatabase.exec("UPDATE demo_payment_attempts SET amount_cents=1"),/immutable/);
  assert.throws(()=>objDatabase.exec('DELETE FROM demo_payment_attempts'),/Preserve/);
}));
