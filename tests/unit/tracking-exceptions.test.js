import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createStaffOrdersService} from '../../src/staff/orders-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
const EMPLOYEE_TOKEN='1'.repeat(64);const ADMIN_TOKEN='2'.repeat(64);
function fixture(fnWork,intCount=3){
  const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);let numNow=Date.parse('2026-10-21T15:00:00.000Z');
  const fnNow=()=>new Date(numNow);const arrOrders=seedStaffOrders(objDatabase,{intCount,fnNow});
  for(const [strId,strRole,strToken] of [['employee','employee',EMPLOYEE_TOKEN],['admin','admin',ADMIN_TOKEN]]){
    objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strId,strId,strRole,fnNow().toISOString());
    objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(strId,strId,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),strRole==='admin'?fnNow().toISOString():null,new Date(numNow+8*3600000).toISOString());
  }
  const objService=createStaffOrdersService(objDatabase,createSessionService(objDatabase,{fnNow}));
  try{fnWork({objDatabase,objService,objTracking:createTrackingService(objDatabase,createSessionService(objDatabase,{fnNow}),{fnNow}),objExceptions:createOrderExceptionService(objDatabase,createSessionService(objDatabase,{fnNow})),objProgress:createOrderProgressService(objDatabase,createSessionService(objDatabase,{fnNow})),arrOrders,setNow:(numValue)=>{numNow=numValue;}});}finally{objDatabase.close();}
}
test('private grants store only digests, expose minimum progress and expire seven days after final outcome',()=>fixture(({objDatabase,objTracking,objService,objProgress,arrOrders,setNow})=>{
  const objOrder=arrOrders[0];const strLink=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z');const strToken=strLink.split('#')[1];
  assert.match(strToken,/^[a-f0-9]{64}$/);assert.equal(objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z'),null);
  assert.notEqual(objDatabase.prepare('SELECT token_digest FROM tracking_grants').get().token_digest,strToken);
  const objResult=objTracking.readTracking(strToken);assert.equal(objResult.strStatus,'Received');assert.doesNotMatch(JSON.stringify(objResult),/202555|unused@example|Guest|cents|ciphertext|strUserId/);
  assert.equal(objTracking.readTracking(objOrder.strReference),null);assert.equal(objTracking.readTracking('f'.repeat(64)),null);
  let intRevision=objService.readOrder(EMPLOYEE_TOKEN,objOrder.strReference).intRevision;
  for(const strStatus of ['Preparing','Baking','Ready','Completed'])intRevision=objProgress.advanceOrder(EMPLOYEE_TOKEN,objOrder.strReference,{intRevision,strStatus}).intRevision;
  setNow(Date.parse('2026-10-28T14:59:59.999Z'));assert.equal(objTracking.readTracking(strToken).strStatus,'Completed');
  setNow(Date.parse('2026-10-28T15:00:00.000Z'));assert.equal(objTracking.readTracking(strToken),null);
}));
test('only an authenticated admin can replace a private grant, revoking the old link and preserving expiry',()=>fixture(({objDatabase,objTracking,arrOrders})=>{
  const strLink=objTracking.issueForPayment(arrOrders[0].strOrderId,'2026-10-21T15:00:00.000Z');
  objDatabase.exec("UPDATE tracking_grants SET expires_at='2026-10-22T15:00:00.000Z'");
  assert.equal(objTracking.replaceGrant(EMPLOYEE_TOKEN,arrOrders[0].strReference),null);
  const objReplacement=objTracking.replaceGrant(ADMIN_TOKEN,arrOrders[0].strReference);assert.equal(objTracking.readTracking(strLink.split('#')[1]),null);assert.ok(objTracking.readTracking(objReplacement.strTrackingPath.split('#')[1]));
  assert.equal(objDatabase.prepare('SELECT expires_at FROM tracking_grants WHERE revoked_at IS NULL').get().expires_at,'2026-10-22T15:00:00.000Z');assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM audit_events WHERE action='tracking_replacement'").get().n,1);
}));
test('admin cancellation is atomic, releases capacity and keeps financial state separate; employees cannot decide',()=>fixture(({objDatabase,objService,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];const intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;
  assert.equal(objExceptions.decide(EMPLOYEE_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}),null);
  const objResult=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'});assert.equal(objResult.strStatus,'Cancelled');assert.equal(objResult.bRefundReviewRequired,true);
  assert.equal(objDatabase.prepare('SELECT state FROM cancellation_requests WHERE order_id=?').get(objOrder.strOrderId).state,'approved');
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM capacity_holds h JOIN fulfillment_bookings b ON h.booking_id=b.id WHERE b.order_id=? AND h.state='confirmed'").get(objOrder.strOrderId).n,0);
  assert.equal(objDatabase.prepare('SELECT state FROM demo_payment_attempts WHERE order_id=?').get(objOrder.strOrderId).state,'succeeded');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM refunds').get().n,0);
  assert.throws(()=>objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}),/changed/);
}));
test('pending customer cancellation can be denied; only reviewed hours/inventory holds resolve; no-shows require closing',()=>fixture(({objDatabase,objService,objExceptions,objTracking,arrOrders})=>{
  const objOrder=arrOrders[0];let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;
  const strTrackingToken=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z').split('#')[1];
  assert.equal(objTracking.readTracking(strTrackingToken).strCancellationState,'none');
  objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code,requested_at) VALUES ('request',?,'customer','fixture','2026-10-21T15:00:00.000Z')").run(objOrder.strOrderId);
  assert.equal(objTracking.readTracking(strTrackingToken).strCancellationState,'pending');
  intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'deny-cancellation'}).intRevision;
  assert.equal(objDatabase.prepare("SELECT state FROM cancellation_requests WHERE id='request'").get().state,'denied');
  assert.equal(objTracking.readTracking(strTrackingToken).strCancellationState,'denied');
  assert.equal(objTracking.readTracking(strTrackingToken).bInventoryIssue,false);
  objDatabase.prepare("INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference,opened_at) VALUES ('inventory-review',?,'inventory_change','fixture','2026-10-21T15:00:00.000Z')").run(objOrder.strOrderId);
  assert.equal(objTracking.readTracking(strTrackingToken).bInventoryIssue,true);
  objDatabase.prepare("INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference,opened_at) VALUES ('review',?,'hours_change','fixture','2026-10-21T15:00:00.000Z')").run(objOrder.strOrderId);
  intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'resolve-review'}).intRevision;
  assert.equal(objDatabase.prepare("SELECT state FROM fulfillment_reviews WHERE id='review'").get().state,'resolved');
  assert.equal(objTracking.readTracking(strTrackingToken).arrProgress.length,1);
  assert.equal(objTracking.readTracking(strTrackingToken).bInventoryIssue,false);
  assert.throws(()=>objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'not-collected'}),/closing/);
}));
test('prepared no-show can be marked only by a current admin at closing, without a refund',()=>fixture(({objDatabase,objService,objProgress,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;
  for(const strStatus of ['Preparing','Baking','Ready'])intRevision=objProgress.advanceOrder(ADMIN_TOKEN,objOrder.strReference,{intRevision,strStatus}).intRevision;
  assert.throws(()=>objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'not-collected'}),/closing/);
  const strNewToken='3'.repeat(64);const dtClosing='2026-10-22T04:00:00.000Z';
  objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run('closing-admin','admin',createHash('sha256').update(strNewToken).digest('hex'),dtClosing,dtClosing,dtClosing,'2026-10-22T12:00:00.000Z');
  const objClosing=createOrderExceptionService(objDatabase,createSessionService(objDatabase,{fnNow:()=>new Date(dtClosing)}));
  assert.equal(objClosing.decide(strNewToken,objOrder.strReference,{intRevision,strAction:'not-collected'}).strStatus,'Not collected');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM refunds').get().n,0);
}));
test('failed admin audit/event writes roll back cancellation and grant replacement',()=>fixture(({objDatabase,objTracking,objService,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];const strPath=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z');const intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;
  objDatabase.exec("CREATE TRIGGER reject_admin_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  assert.throws(()=>objTracking.replaceGrant(ADMIN_TOKEN,objOrder.strReference),/audit failure/);assert.ok(objTracking.readTracking(strPath.split('#')[1]));
  assert.throws(()=>objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}),/audit failure/);assert.equal(objService.readOrder(EMPLOYEE_TOKEN,objOrder.strReference).strStatus,'Received');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM cancellation_requests').get().n,0);
}));
test('genuine successful payment issues a private grant in the same committed checkout',()=>fixture(({objDatabase,objTracking})=>{
  const arrNew=seedStaffOrders(objDatabase,{intCount:1,objTrackingService:objTracking});assert.match(arrNew[0].strTrackingPath,/^\/track#[a-f0-9]{64}$/);assert.equal(objTracking.readTracking(arrNew[0].strTrackingPath.split('#')[1]).strStatus,'Received');
}));
test('pending final-order cancellation extends tracking until seven days after resolution',()=>fixture(({objDatabase,objTracking,arrOrders,setNow})=>{
  const objOrder=arrOrders[0];const strPath=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z');
  objDatabase.prepare("UPDATE orders SET fulfillment_status='Completed',completed_at='2026-10-21T16:00:00.000Z' WHERE id=?").run(objOrder.strOrderId);
  objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code,requested_at) VALUES ('later',?,'restaurant','fixture','2026-10-21T16:00:00.000Z')").run(objOrder.strOrderId);
  setNow(Date.parse('2026-10-30T15:00:00.000Z'));assert.ok(objTracking.readTracking(strPath.split('#')[1]));
  objDatabase.exec("UPDATE cancellation_requests SET state='denied',decided_at='2026-10-30T15:00:00.000Z',decided_by='admin',decision_reason='fixture' WHERE id='later'");
  setNow(Date.parse('2026-11-06T14:59:59.999Z'));assert.ok(objTracking.readTracking(strPath.split('#')[1]));setNow(Date.parse('2026-11-06T15:00:00.000Z'));assert.equal(objTracking.readTracking(strPath.split('#')[1]),null);
}));
test('tracking-grant failure rolls back payment, hold confirmation and Received transition',()=>fixture(({objDatabase})=>{
  const intPaid=objDatabase.prepare("SELECT count(*) AS n FROM demo_payment_attempts WHERE state='succeeded'").get().n;
  assert.throws(()=>seedStaffOrders(objDatabase,{intCount:1,objTrackingService:{issueForPayment(){throw new Error('fixture tracking failure');}}}),/tracking failure/);
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM demo_payment_attempts WHERE state='succeeded'").get().n,intPaid);
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM orders WHERE fulfillment_status IS NULL").get().n,1);
}));
test('cancelled orders awaiting refund review do not lose their private link at seven days',()=>fixture(({objTracking,objService,objExceptions,arrOrders,setNow})=>{
  const objOrder=arrOrders[0];const strPath=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z');
  objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision:objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision,strAction:'cancel'});
  setNow(Date.parse('2026-11-10T15:00:00.000Z'));assert.equal(objTracking.readTracking(strPath.split('#')[1]).bReviewPending,true);
}));
