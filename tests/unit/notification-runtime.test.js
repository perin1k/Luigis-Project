import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
test('configured runtime cleans expired ciphertext and generates previews without exposing staff APIs on public HTTP',{timeout:15000},async()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-notification-runtime-'));const strPath=join(strDirectory,'demo.sqlite');let objChild;
  try{
    const objDatabase=openDatabase(strPath);try{applyMigrations(objDatabase);seedStaffOrders(objDatabase,{intCount:1});objDatabase.prepare('UPDATE demo_payment_secrets SET expires_at=?').run('2000-01-01T00:00:00.000Z');}finally{objDatabase.close();}
    const objReservation=createServer();objReservation.listen(0,'127.0.0.1');await once(objReservation,'listening');const intPort=objReservation.address().port;await new Promise((fnResolve)=>objReservation.close(fnResolve));
    const objEnvironment={...process.env,NODE_ENV:'production',DATABASE_PATH:strPath,PORT:String(intPort),HOST:'127.0.0.1'};for(const strName of ['AUTH_ORIGIN','TLS_KEY_PATH','TLS_CERT_PATH','MFA_ENCRYPTION_KEY_HEX','DEMO_PAYMENT_KEYS_PATH'])delete objEnvironment[strName];
    objChild=spawn(process.execPath,['src/server.js'],{env:objEnvironment,stdio:['ignore','pipe','pipe']});
    await new Promise((fnResolve,fnReject)=>{const intTimer=setTimeout(()=>fnReject(new Error('Disposable runtime did not start.')),5000);objChild.once('error',(objError)=>{clearTimeout(intTimer);fnReject(objError);});objChild.once('exit',()=>{clearTimeout(intTimer);fnReject(new Error('Disposable runtime exited.'));});objChild.stdout.on('data',(objChunk)=>{if(objChunk.toString().includes(`http://127.0.0.1:${intPort}`)){clearTimeout(intTimer);fnResolve();}});});
    const objRead=openDatabase(strPath);try{assert.equal(objRead.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state='previewed'").get().n,2);assert.equal(objRead.prepare('SELECT count(*) AS n FROM notification_previews').get().n,2);assert.equal(objRead.prepare('SELECT count(*) AS n FROM demo_payment_secrets').get().n,0);}finally{objRead.close();}
    assert.equal((await fetch(`http://127.0.0.1:${intPort}/api/staff/orders/example/notifications`)).status,404);
  }finally{if(objChild&&objChild.exitCode===null){const pExit=once(objChild,'exit');objChild.kill('SIGTERM');await pExit;}rmSync(strDirectory,{recursive:true,force:true});}
});
