import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {randomBytes,randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
test('competing payment requests across file connections create one payment, one event and a durable encrypted identity',{timeout:10000},async()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-demo-pay-'));const strPath=join(strDirectory,'payments.sqlite');const objDatabase=openDatabase(strPath);applyMigrations(objDatabase);seedMenu(objDatabase);
  const objCatalog=createCatalogService(objDatabase);const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});const strOrderId=randomUUID();
  createOrderService(objDatabase,objCatalog,objScheduling).submitOrder({strRequestId:strOrderId,strService:'carry-out',objContact:{strName:'Synthetic Guest',strPhone:'2025550100',strEmail:''},
    objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'small',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup:objScheduling.listOptions(1).arrOptions[0]});objDatabase.close();
  const objBarrier=new SharedArrayBuffer(4);const arrWorkers=[];let intReady=0;const strKey=randomBytes(32).toString('hex');
  const strWorker=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{
    const fnImport=(strPath)=>import(workerData.strRoot+strPath);
    const {openDatabase}=await fnImport('src/data/database.js');const {createCatalogService}=await fnImport('src/ordering/catalog-service.js');
    const {createSchedulingService}=await fnImport('src/ordering/scheduling-service.js');const {createSyntheticVault}=await fnImport('src/payments/synthetic-vault.js');const {createDemoPaymentService}=await fnImport('src/payments/demo-payment-service.js');
    const objDatabase=openDatabase(workerData.strPath);const objPayment=createDemoPaymentService(objDatabase,{objCatalogService:createCatalogService(objDatabase),objSchedulingService:createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'}),objVault:createSyntheticVault({strActiveKeyId:'test',mapKeys:{test:workerData.strKey}})});
    parentPort.postMessage('ready');Atomics.wait(new Int32Array(workerData.objBarrier),0,0);
    try{parentPort.postMessage(objPayment.pay(workerData.objInput).strState);}finally{objDatabase.close();}
  })().catch(objError=>{throw objError;});`;
  try{
    const arrResults=await Promise.all([0,1].map(()=>new Promise((fnResolve,fnReject)=>{const objWorker=new Worker(strWorker,{eval:true,workerData:{strRoot:new URL('../../',import.meta.url).href,strPath,strKey,objBarrier,objInput:{strOrderId,strRequestId:randomUUID(),strMethod:'card'}}});arrWorkers.push(objWorker);objWorker.on('error',fnReject);objWorker.on('message',(strValue)=>{if(strValue==='ready'){if(++intReady===2){Atomics.store(new Int32Array(objBarrier),0,1);Atomics.notify(new Int32Array(objBarrier),0);}}else fnResolve(strValue);});})));
    assert.deepEqual(arrResults,['succeeded','succeeded']);const objCheck=openDatabase(strPath);try{applyMigrations(objCheck);for(const strTable of ['demo_payment_attempts','demo_payment_secrets','order_events'])assert.equal(objCheck.prepare(`SELECT count(*) AS n FROM ${strTable}`).get().n,1);assert.equal(objCheck.prepare('PRAGMA foreign_key_check').all().length,0);}finally{objCheck.close();}
  }finally{await Promise.all(arrWorkers.map((objWorker)=>objWorker.terminate()));rmSync(strDirectory,{recursive:true,force:true});}
});
