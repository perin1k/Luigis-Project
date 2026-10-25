import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../src/app.js';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {loadPaymentVault} from '../../src/payments/payment-config.js';

test('committed HTTP payment keeps full generated identity and key out of SQLite bytes, responses and operational events',async()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-qa02-'));
  const strDataDirectory=join(strDirectory,'data');
  const strKeyDirectory=join(strDirectory,'keys');
  mkdirSync(strDataDirectory);mkdirSync(strKeyDirectory);
  const strDatabasePath=join(strDataDirectory,'demo.sqlite');
  const strKeyPath=join(strKeyDirectory,'payment.json');
  const strKey=randomBytes(32).toString('hex');
  writeFileSync(strKeyPath,JSON.stringify({strActiveKeyId:'qa02',mapKeys:{qa02:strKey}}),{mode:0o600});
  let objDatabase;let objServer;
  try{
    objDatabase=openDatabase(strDatabasePath);applyMigrations(objDatabase);seedMenu(objDatabase);
    const objVault=loadPaymentVault(strKeyPath);
    const objCatalog=createCatalogService(objDatabase);
    const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});
    const objPayment=createDemoPaymentService(objDatabase,{objVault,objCatalogService:objCatalog,objSchedulingService:objScheduling});
    const arrEvents=[];
    objServer=createServer(createApp({objCatalogService:objCatalog,objSchedulingService:objScheduling,
      objOrderService:createOrderService(objDatabase,objCatalog,objScheduling),objPaymentService:objPayment,
      fnWriteOperational:(strLine)=>arrEvents.push(JSON.parse(strLine))}));
    await new Promise((fnResolve,fnReject)=>{objServer.once('error',fnReject);objServer.listen(0,'127.0.0.1',fnResolve);});
    const strOrigin=`http://127.0.0.1:${objServer.address().port}`;
    const fnPost=(strPath,objBody)=>fetch(`${strOrigin}${strPath}`,{method:'POST',headers:{Origin:strOrigin,'Content-Type':'application/json'},body:JSON.stringify(objBody)});
    const strOrderId=randomUUID();
    const objSaved=await fnPost('/api/orders',{strRequestId:strOrderId,strService:'carry-out',
      objContact:{strName:'Synthetic QA guest',strPhone:'2025550100',strEmail:''},
      objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,
        arrPizzas:[{strSize:'small',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:10},
      objPickup:objScheduling.listOptions(1).arrOptions[0]});
    assert.equal(objSaved.status,201);
    const objInput={strOrderId,strRequestId:randomUUID(),strMethod:'card'};
    const objRejected=await fnPost('/api/demo-payments',{...objInput,strCardNumber:'synthetic-input',strCvv:'not-a-code'});
    assert.equal(objRejected.status,422);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,0);
    const objResponse=await fnPost('/api/demo-payments',objInput);
    assert.equal(objResponse.status,201);
    const strResponse=await objResponse.text();
    const objSecret=objDatabase.prepare('SELECT * FROM demo_payment_secrets').get();
    const objAttempt=objDatabase.prepare('SELECT * FROM demo_payment_attempts').get();
    const strNumber=objVault.decrypt({strKeyId:objSecret.key_id,strNonceHex:objSecret.nonce_hex,
      strCiphertextHex:objSecret.ciphertext_hex,strTagHex:objSecret.tag_hex},
    {strPaymentId:objAttempt.id,strOrderId:objAttempt.order_id,strQuoteId:objAttempt.quote_id});
    assert.equal(/^0000\d{12}$/.test(strNumber),true);
    assert.equal(strResponse.includes(strNumber),false);assert.equal(strResponse.includes(strKey),false);
    assert.equal(JSON.stringify(arrEvents).includes(strNumber),false);
    assert.equal(JSON.stringify(arrEvents).includes(strKey),false);
    assert.equal(JSON.stringify(arrEvents).includes('synthetic-input'),false);
    assert.equal(JSON.stringify(arrEvents).includes('not-a-code'),false);
    assert.equal(arrEvents.some((objEvent)=>objEvent.strEvent==='payment_request_succeeded'),true);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM provider_events').get().n,0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    await new Promise((fnResolve)=>objServer.close(fnResolve));objServer=null;
    objDatabase.close();objDatabase=null;
    const objBytes=readFileSync(strDatabasePath);
    assert.equal(objBytes.includes(Buffer.from(strNumber)),false);
    assert.equal(objBytes.includes(Buffer.from(strKey)),false);
    assert.equal(objBytes.includes(Buffer.from('synthetic-input')),false);
    assert.equal(objBytes.includes(Buffer.from('not-a-code')),false);
  }finally{
    if(objServer)await new Promise((fnResolve)=>objServer.close(fnResolve));
    objDatabase?.close();rmSync(strDirectory,{recursive:true,force:true});
  }
});
