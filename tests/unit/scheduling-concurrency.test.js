import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';

test('two competing database connections reserve only one six-pizza order', async () => {
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-race-')); const strPath=join(strDirectory,'race.sqlite');
  const objDatabase=openDatabase(strPath); applyMigrations(objDatabase); seedMenu(objDatabase);
  const strFingerprint=createCatalogService(objDatabase).readCatalog().strFingerprint; objDatabase.close();
  const objBarrier=new SharedArrayBuffer(4); const arrWorkers=[];
  const strWorker=`const {parentPort,workerData}=require('node:worker_threads');
  (async()=>{const {openDatabase}=await import(workerData.strRoot+'src/data/database.js');
    const {createCatalogService}=await import(workerData.strRoot+'src/ordering/catalog-service.js');
    const {createSchedulingService}=await import(workerData.strRoot+'src/ordering/scheduling-service.js');
    const {createOrderService}=await import(workerData.strRoot+'src/ordering/order-service.js');
    const objDatabase=openDatabase(workerData.strPath); const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});
    parentPort.postMessage('ready'); Atomics.wait(new Int32Array(workerData.objBarrier),0,0);
    try{createOrderService(objDatabase,createCatalogService(objDatabase),objScheduling).submitOrder(workerData.objInput); parentPort.postMessage('saved');}
    catch(objError){parentPort.postMessage(objError.strCode??objError.message);}finally{objDatabase.close();}
  })().catch(objError=>{throw objError;});`;
  try {
    let intReady=0;
    const arrResults=await Promise.all([0,1].map(()=>new Promise((fnResolve,fnReject)=>{
      const objInput={strRequestId:randomUUID(),strService:'carry-out',objContact:{strName:'Synthetic Guest',strPhone:'2025550100',strEmail:''},
        objPricing:{strCatalogFingerprint:strFingerprint,arrPizzas:[{strSize:'large',strCrust:'regular',arrToppings:[],intQuantity:6}],arrDrinks:[],intTipPercent:0},
        objPickup:{strServiceDate:'2026-10-21',intRevision:1,strSelectionType:'scheduled',dtPromisedAt:'2026-10-21T16:00:00.000Z'}};
      const objWorker=new Worker(strWorker,{eval:true,workerData:{strRoot:new URL('../../',import.meta.url).href,strPath,objBarrier,objInput}});arrWorkers.push(objWorker);
      objWorker.on('error',fnReject);objWorker.on('message',(strMessage)=>{
        if(strMessage==='ready'){if(++intReady===2){Atomics.store(new Int32Array(objBarrier),0,1);Atomics.notify(new Int32Array(objBarrier),0);}}else fnResolve(strMessage);
      });
    })));
    assert.deepEqual(arrResults.sort(),['pickup_changed','saved']);
    const objCheck=openDatabase(strPath);
    try{assert.equal(objCheck.prepare('SELECT count(*) AS n FROM orders').get().n,1);assert.equal(objCheck.prepare("SELECT sum(reserved_units) AS n FROM capacity_holds WHERE state='active'").get().n,6);assert.equal(objCheck.prepare('PRAGMA foreign_key_check').all().length,0);}finally{objCheck.close();}
  } finally {await Promise.all(arrWorkers.map((objWorker)=>objWorker.terminate()));rmSync(strDirectory,{recursive:true,force:true});}
});
