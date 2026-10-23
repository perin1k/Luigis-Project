import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';

test('simultaneous cancellation and preparation commit exactly one compatible outcome across SQLite connections',{timeout:15000},async()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-qa03-race-'));
  const strPath=join(strDirectory,'race.sqlite');
  const arrWorkers=[];let objDatabase;
  try{
    objDatabase=openDatabase(strPath);applyMigrations(objDatabase);
    const fnNow=()=>new Date('2026-10-21T15:00:00.000Z');
    const [objOrder]=seedStaffOrders(objDatabase,{intCount:1,fnNow});
    const strStaffToken=randomBytes(32).toString('hex');
    const strStaffId=randomUUID();
    objDatabase.prepare("INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,'employee',?)").run(strStaffId,strStaffId,fnNow().toISOString());
    objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,expires_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(),strStaffId,createHash('sha256').update(strStaffToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),'2026-10-21T23:00:00.000Z');
    const strGuestToken=createTrackingService(objDatabase,undefined,{fnNow}).issueForPayment(objOrder.strOrderId,fnNow().toISOString()).split('#')[1];
    const intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;
    objDatabase.close();objDatabase=null;
    const objBarrier=new SharedArrayBuffer(4);let intReady=0;
    const arrResults=await Promise.all(['cancel','prepare'].map((strAction)=>new Promise((fnResolve,fnReject)=>{
      const objWorker=new Worker(new URL('../fixtures/cancellation-race-worker.js',import.meta.url),{workerData:{strFixture:'qa03-cancellation-race',strPath,strAction,strStaffToken,strGuestToken,strReference:objOrder.strReference,intRevision,objBarrier}});
      arrWorkers.push(objWorker);objWorker.once('error',fnReject);
      objWorker.on('message',(objResult)=>{
        if(objResult.strState==='ready'){
          if(++intReady===2){Atomics.store(new Int32Array(objBarrier),0,1);Atomics.notify(new Int32Array(objBarrier),0);}
        }else fnResolve(objResult.strState);
      });
      objWorker.once('exit',(intCode)=>{if(intCode!==0)fnReject(new Error('Disposable race worker failed.'));});
    })));
    assert.deepEqual(arrResults.sort(),['committed','conflict']);
    objDatabase=openDatabase(strPath);
    const objStored=objDatabase.prepare('SELECT fulfillment_status,preparing_at,revision FROM orders WHERE id=?').get(objOrder.strOrderId);
    const intPending=objDatabase.prepare("SELECT count(*) AS n FROM cancellation_requests WHERE order_id=? AND state='pending'").get(objOrder.strOrderId).n;
    assert.equal(objStored.revision,intRevision+1);
    if(objStored.fulfillment_status==='Preparing'){assert.equal(intPending,0);assert.equal(objStored.preparing_at,fnNow().toISOString());}
    else{assert.equal(objStored.fulfillment_status,'Received');assert.equal(intPending,1);assert.equal(objStored.preparing_at,null);}
    assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM order_events WHERE order_id=? AND event_type IN ('fulfillment_progress','customer_cancellation_requested')").get(objOrder.strOrderId).n,1);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(objDatabase.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{
    await Promise.all(arrWorkers.map((objWorker)=>objWorker.terminate()));
    objDatabase?.close();rmSync(strDirectory,{recursive:true,force:true});
  }
});
