import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createNotificationService} from '../../src/notifications/notification-service.js';
import {queueInternalNotification} from '../../src/notifications/outbox.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
import {readFileSync,readdirSync} from 'node:fs';
const ADMIN='a'.repeat(64),EMPLOYEE='e'.repeat(64);
function fixture(fnWork){const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);let numNow=Date.parse('2026-10-21T15:00:00.000Z');const fnNow=()=>new Date(numNow);const arrOrders=seedStaffOrders(objDatabase,{intCount:2,fnNow});
  for(const [strRole,strToken] of [['admin',ADMIN],['employee',EMPLOYEE]]){objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strRole,strRole,strRole,fnNow().toISOString());objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(strRole,strRole,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),strRole==='admin'?fnNow().toISOString():null,new Date(numNow+8*3600000).toISOString());}
  const objSessions=createSessionService(objDatabase,{fnNow});const objNotices=createNotificationService(objDatabase,objSessions,{fnNow});
  try{fnWork({objDatabase,arrOrders,objSessions,objNotices,fnNow,setNow(numValue){numNow=numValue;}});}finally{objDatabase.close();}}
test('actual confirmation/Ready events generate deduplicated internal previews, never delivery outcomes',()=>fixture(({objDatabase,arrOrders,objSessions,objNotices})=>{
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,4);objNotices.processPending();
  const objOrder=arrOrders[0];const objRead=objNotices.read(EMPLOYEE,objOrder.strReference);assert.equal(objRead.arrPreviews.length,2);assert.ok(objRead.arrPreviews.every((objRow)=>objRow.strState==='previewed'&&objRow.strBody.includes('Nothing was sent or delivered.')&&!objRow.strBody.includes('2025550100')));assert.equal(objRead.bCanRetry,false);assert.equal(objNotices.read('invalid',objOrder.strReference),null);
  const objEvent=objDatabase.prepare("SELECT * FROM order_events WHERE order_id=? AND event_type='demo_payment_confirmed'").get(objOrder.strOrderId);queueInternalNotification(objDatabase,objOrder.strOrderId,objEvent.id,'confirmation',objEvent.occurred_at);objNotices.processPending();assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_outbox').get().n,4);
  const objProgress=createOrderProgressService(objDatabase,objSessions);let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;
  for(const strStatus of ['Preparing','Baking','Ready'])intRevision=objProgress.advanceOrder(EMPLOYEE,objOrder.strReference,{intRevision,strStatus}).intRevision;
  objNotices.processPending();assert.equal(objNotices.read(EMPLOYEE,objOrder.strReference).arrPreviews.filter((objRow)=>objRow.strTemplate==='ready').length,2);assert.ok(objNotices.read(EMPLOYEE,objOrder.strReference).arrPreviews.some((objRow)=>objRow.strBody.includes('ready for pickup')));
}));
test('render failures are sanitized, admin retries are idempotent and generation is atomic',()=>fixture(({objDatabase,arrOrders,objSessions,objNotices,fnNow})=>{
  const objFailure=createNotificationService(objDatabase,objSessions,{fnNow,fnRender(){throw new Error('secret contact data must not escape');}});objFailure.processPending();const objOrder=arrOrders[0];const strId=objNotices.read(ADMIN,objOrder.strReference).arrPreviews[0].strId;
  assert.equal(objNotices.read(EMPLOYEE,objOrder.strReference).arrPreviews[0].strError,'render_failed');assert.equal(objNotices.retry(EMPLOYEE,objOrder.strReference,{strNotificationId:strId}),null);assert.throws(()=>objNotices.retry(ADMIN,arrOrders[1].strReference,{strNotificationId:strId}),/not found/);
  assert.equal(objNotices.retry(ADMIN,objOrder.strReference,{strNotificationId:strId}).strState,'pending');assert.equal(objNotices.retry(ADMIN,objOrder.strReference,{strNotificationId:strId}).strState,'pending');
  objDatabase.exec("CREATE TRIGGER fail_preview_audit BEFORE INSERT ON audit_events WHEN NEW.action='notification_preview' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");assert.throws(()=>objNotices.processPending(),/rollback/);assert.equal(objDatabase.prepare('SELECT state FROM notification_outbox WHERE id=?').get(strId).state,'pending');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_previews').get().n,0);objDatabase.exec('DROP TRIGGER fail_preview_audit');objNotices.processPending();assert.equal(objNotices.read(ADMIN,objOrder.strReference).arrPreviews[0].intAttempts,2);assert.equal(objNotices.retry(ADMIN,objOrder.strReference,{strNotificationId:strId}).strState,'previewed');
}));
test('inventory cancellation apology/refund are distinct and previews expire seven days after resolution',()=>fixture(({objDatabase,arrOrders,objSessions,objNotices,setNow,fnNow})=>{
  const objOrder=arrOrders[0];objDatabase.prepare("INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference,opened_at) VALUES (? ,?,'inventory_change','fixture',?)").run(randomUUID(),objOrder.strOrderId,fnNow().toISOString());const objExceptions=createOrderExceptionService(objDatabase,objSessions);let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;
  intRevision=objExceptions.decide(ADMIN,objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;objNotices.processPending();assert.ok(objNotices.read(ADMIN,objOrder.strReference).arrPreviews.some((objRow)=>objRow.strBody.includes('ingredient became unavailable')));
  createDemoRefundService(objDatabase,objSessions).refund(ADMIN,objOrder.strReference,{intRevision,strRequestId:randomUUID()});objNotices.processPending();assert.ok(objNotices.read(ADMIN,objOrder.strReference).arrPreviews.some((objRow)=>objRow.strTemplate==='refund'&&objRow.strBody.includes('No money was transferred')));
  setNow(Date.parse('2026-10-28T15:00:00.000Z'));objNotices.processPending();assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_outbox WHERE order_id=?').get(objOrder.strOrderId).n,0);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_previews p JOIN notification_outbox n ON n.id=p.notification_id WHERE n.order_id=?').get(objOrder.strOrderId).n,0);assert.ok(objDatabase.prepare('SELECT id FROM demo_refund_attempts WHERE order_id=?').get(objOrder.strOrderId));
}));
test('redacted contacts suppress generation and forged source events cannot become successful previews',()=>fixture(({objDatabase,arrOrders,objNotices})=>{
  const objOrder=arrOrders[0];const objEvent=objDatabase.prepare("SELECT * FROM order_events WHERE order_id=? AND event_type='demo_payment_confirmed'").get(objOrder.strOrderId);queueInternalNotification(objDatabase,objOrder.strOrderId,objEvent.id,'refund',objEvent.occurred_at);objNotices.processPending();assert.equal(objDatabase.prepare("SELECT state FROM notification_outbox WHERE order_id=? AND template_key='refund'").get(objOrder.strOrderId).state,'failed');
  objDatabase.prepare("UPDATE order_contacts SET customer_name=NULL,phone=NULL,email=NULL,redacted_at='2026-10-21T15:00:00.000Z' WHERE order_id=?").run(objOrder.strOrderId);assert.equal(objNotices.read(EMPLOYEE,objOrder.strReference).bExpired,true);objNotices.processPending();assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_outbox WHERE order_id=?').get(objOrder.strOrderId).n,0);
}));

test('unresolved approved cancellations retain previews beyond seven days',()=>fixture(({objDatabase,arrOrders,objSessions,objNotices,setNow})=>{
  const objOrder=arrOrders[0];const intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;createOrderExceptionService(objDatabase,objSessions).decide(ADMIN,objOrder.strReference,{intRevision,strAction:'cancel'});objNotices.processPending();setNow(Date.parse('2026-10-29T15:00:00.000Z'));objNotices.processPending();assert.ok(objDatabase.prepare('SELECT id FROM notification_outbox WHERE order_id=?').get(objOrder.strOrderId));
}));
test('v13 upgrade preserves queued history and stores immutable preview content with cascading cleanup',()=>{
  const objDatabase=openDatabase(':memory:');try{
    const objDirectory=new URL('../../src/data/migrations/',import.meta.url);const arrOld=readdirSync(objDirectory).filter((strFile)=>Number(strFile.slice(0,3))<=12).sort().map((strFile)=>({intVersion:Number(strFile.slice(0,3)),strName:strFile.slice(4,-4),strSql:readFileSync(new URL(strFile,objDirectory),'utf8')}));applyMigrations(objDatabase,arrOld);seedStaffOrders(objDatabase,{intCount:1});const strBefore=JSON.stringify(objDatabase.prepare('SELECT * FROM notification_outbox').all());applyMigrations(objDatabase);applyMigrations(objDatabase);assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM notification_outbox').all()),strBefore);
    createNotificationService(objDatabase,null,{fnNow:()=>new Date('2026-10-21T15:00:00.000Z')}).processPending();assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_previews').get().n,2);assert.throws(()=>objDatabase.exec("UPDATE notification_previews SET body='changed'"),/immutable/);objDatabase.exec('DELETE FROM notification_outbox');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_previews').get().n,0);assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{objDatabase.close();}
});
