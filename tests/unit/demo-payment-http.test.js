import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../../src/app.js';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {createSyntheticVault} from '../../src/payments/synthetic-vault.js';
test('demo HTTP accepts no number, outcome or total; enforces same-site bounded JSON and returns committed masked receipt',async()=>{
  const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);seedMenu(objDatabase);
  const objCatalogService=createCatalogService(objDatabase);const objSchedulingService=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});
  const objOrderService=createOrderService(objDatabase,objCatalogService,objSchedulingService);
  const objPaymentService=createDemoPaymentService(objDatabase,{objCatalogService,objSchedulingService,objVault:createSyntheticVault({strActiveKeyId:'test',mapKeys:{test:randomBytes(32).toString('hex')}})});
  const strOrderId=randomUUID();objOrderService.submitOrder({strRequestId:strOrderId,strService:'dine-in',objContact:{strName:'Synthetic Guest',strPhone:'',strEmail:'guest@example.invalid'},
    objPricing:{strCatalogFingerprint:objCatalogService.readCatalog().strFingerprint,arrPizzas:[{strSize:'small',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup:objSchedulingService.listOptions(1).arrOptions[0]});
  const objServer=createServer(createApp({objCatalogService,objSchedulingService,objOrderService,objPaymentService}));await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));
  const strOrigin=`http://127.0.0.1:${objServer.address().port}`;const objInput={strOrderId,strRequestId:randomUUID(),strMethod:'apple-pay'};
  const fnPost=(objBody,objHeaders={})=>fetch(`${strOrigin}/api/demo-payments`,{method:'POST',headers:{Origin:strOrigin,'Content-Type':'application/json',...objHeaders},body:typeof objBody==='string'?objBody:JSON.stringify(objBody)});
  try{
    assert.equal((await fnPost(objInput,{Origin:'https://other.invalid'})).status,403);assert.equal((await fnPost(objInput,{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await fnPost('{')).status,400);assert.equal((await fnPost('x'.repeat(1100))).status,413);assert.equal((await fnPost(objInput,{'Content-Encoding':'gzip'})).status,415);
    assert.equal((await fnPost({...objInput,strNumber:'not-accepted'})).status,422);assert.equal((await fnPost({...objInput,bApproved:true})).status,422);
    const objResponse=await fnPost(objInput);assert.equal(objResponse.status,201);assert.equal(objResponse.headers.get('cache-control'),'no-store');
    const strResponse=await objResponse.text();assert.doesNotMatch(strResponse,/guest@example|Synthetic Guest|ciphertext|key_id|nonce_hex|\b\d{16}\b/);
    assert.equal(JSON.parse(strResponse).strState,'succeeded');assert.equal((await fnPost(objInput)).status,200);
  }finally{await new Promise((fnResolve)=>objServer.close(fnResolve));objDatabase.close();}
});
