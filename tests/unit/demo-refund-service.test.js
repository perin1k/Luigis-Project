import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createStaffOrdersService} from '../../src/staff/orders-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
const EMPLOYEE_TOKEN='1'.repeat(64);const ADMIN_TOKEN='2'.repeat(64);
function fixture(fnWork){
  const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);let numNow=Date.parse('2026-10-21T15:00:00.000Z');const fnNow=()=>new Date(numNow);
  const arrOrders=seedStaffOrders(objDatabase,{intCount:3,fnNow,intTipPercent:20});
  for(const [strId,strRole,strToken] of [['employee','employee',EMPLOYEE_TOKEN],['admin','admin',ADMIN_TOKEN]]){
    objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strId,strId,strRole,fnNow().toISOString());
    objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(strId,strId,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),strRole==='admin'?fnNow().toISOString():null,new Date(numNow+8*3600000).toISOString());
  }
  const objSessions=createSessionService(objDatabase,{fnNow});
  try{fnWork({objDatabase,objSessions,arrOrders,objService:createStaffOrdersService(objDatabase,objSessions),objRefund:createDemoRefundService(objDatabase,objSessions),objTracking:createTrackingService(objDatabase,objSessions,{fnNow}),objExceptions:createOrderExceptionService(objDatabase,objSessions),objProgress:createOrderProgressService(objDatabase,objSessions),setNow(numValue){numNow=numValue;}});}finally{objDatabase.close();}
}
test('full refund reverses items, tax and tip once and ends the pending tracking case',()=>fixture(({objDatabase,objService,objRefund,objExceptions,objTracking,arrOrders,setNow})=>{
  const objOrder=arrOrders[0];const strToken=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z').split('#')[1];
  const objPaid=objDatabase.prepare("SELECT * FROM demo_payment_attempts WHERE order_id=? AND state='succeeded'").get(objOrder.strOrderId);assert.equal(objPaid.amount_cents,1186);
  let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;
  assert.throws(()=>objRefund.refund(ADMIN_TOKEN,objOrder.strReference,{intRevision,strRequestId:randomUUID()}),/cancellation/);
  intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;
  assert.equal(objTracking.readTracking(strToken).strCancellationState,'approved');
  assert.equal(objTracking.readTracking(strToken).strRefundState,'review-required');
  const objInput={intRevision,strRequestId:randomUUID()};assert.equal(objRefund.refund(EMPLOYEE_TOKEN,objOrder.strReference,objInput),null);
  const objResult=objRefund.refund(ADMIN_TOKEN,objOrder.strReference,objInput);assert.equal(objResult.strState,'succeeded');assert.equal(objResult.centsAmount,1186);assert.equal(objResult.bReplayed,false);
  assert.equal(objRefund.refund(ADMIN_TOKEN,objOrder.strReference,objInput).bReplayed,true);assert.equal(objRefund.refund(ADMIN_TOKEN,objOrder.strReference,{intRevision,strRequestId:randomUUID()}).strState,'succeeded');
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n,1);assert.equal(objDatabase.prepare('SELECT sum(signed_cents) AS n FROM demo_financial_allocations WHERE payment_id=?').get(objPaid.id).n,0);
  assert.deepEqual(objDatabase.prepare('SELECT signed_cents FROM demo_financial_allocations WHERE payment_id=? AND refund_id IS NOT NULL ORDER BY component').all(objPaid.id).map((objRow)=>objRow.signed_cents),[-900,-88,-198]);
  assert.equal(objDatabase.prepare('SELECT state FROM demo_payment_attempts WHERE id=?').get(objPaid.id).state,'succeeded');assert.equal(objTracking.readTracking(strToken).strRefundState,'succeeded');assert.equal(objTracking.readTracking(strToken).bReviewPending,false);
  assert.ok(!objService.readOrder(ADMIN_TOKEN,objOrder.strReference).arrWarnings.some((strWarning)=>strWarning.includes('Booking capacity')));
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM notification_outbox WHERE order_id=? AND template_key='refund' AND state='pending'").get(objOrder.strOrderId).n,2);
  setNow(Date.parse('2026-10-28T15:00:00.000Z'));assert.equal(objTracking.readTracking(strToken),null);
}));
test('failed refund remains distinct and retryable after review with no duplicate successful reversal',()=>fixture(({objDatabase,objService,objSessions,objRefund,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;
  const objInput={intRevision,strRequestId:randomUUID()};const objDecline=createDemoRefundService(objDatabase,objSessions,{fnProcess:()=>false});assert.equal(objDecline.refund(ADMIN_TOKEN,objOrder.strReference,objInput).strState,'failed');assert.equal(objRefund.refund(ADMIN_TOKEN,objOrder.strReference,objInput).strState,'failed');
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_financial_allocations WHERE refund_id IS NOT NULL').get().n,0);
  intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;assert.equal(objRefund.refund(ADMIN_TOKEN,objOrder.strReference,{intRevision,strRequestId:randomUUID()}).strState,'succeeded');assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n,2);
  assert.throws(()=>objRefund.refund(ADMIN_TOKEN,arrOrders[1].strReference,objInput),/another order/);assert.throws(()=>objDatabase.exec("UPDATE demo_refund_attempts SET state='pending' WHERE state='failed'"),/Preserve/);
}));
test('invalid and stale input or failed audit cannot partially mutate refund accounting',()=>fixture(({objDatabase,objService,objRefund,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;
  for(const objInput of [{intRevision:intRevision-1,strRequestId:randomUUID()},{intRevision,strRequestId:'bad'},{intRevision,strRequestId:randomUUID(),centsAmount:1}])assert.throws(()=>objRefund.refund(ADMIN_TOKEN,objOrder.strReference,objInput));
  objDatabase.exec("CREATE TRIGGER reject_refund_audit BEFORE INSERT ON audit_events WHEN NEW.action='refund_update' BEGIN SELECT RAISE(ABORT,'fixture refund audit failure'); END");assert.throws(()=>objRefund.refund(ADMIN_TOKEN,objOrder.strReference,{intRevision,strRequestId:randomUUID()}),/audit failure/);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n,0);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_financial_allocations WHERE refund_id IS NOT NULL').get().n,0);assert.equal(objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision,intRevision);
}));
test('private cancellation requests hold preparation and serialize against starting preparation',()=>fixture(({objDatabase,objTracking,objService,objProgress,objExceptions,arrOrders})=>{
  const objOrder=arrOrders[0];const strToken=objTracking.issueForPayment(objOrder.strOrderId,'2026-10-21T15:00:00.000Z').split('#')[1];assert.equal(objTracking.requestCancellation(objOrder.strReference),null);assert.equal(objTracking.requestCancellation(strToken).strState,'pending');assert.equal(objTracking.requestCancellation(strToken).bReplayed,true);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM cancellation_requests').get().n,1);let intRevision=objService.readOrder(ADMIN_TOKEN,objOrder.strReference).intRevision;assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,objOrder.strReference,{intRevision,strStatus:'Preparing'}),/held/);
  intRevision=objExceptions.decide(ADMIN_TOKEN,objOrder.strReference,{intRevision,strAction:'deny-cancellation'}).intRevision;objProgress.advanceOrder(EMPLOYEE_TOKEN,objOrder.strReference,{intRevision,strStatus:'Preparing'});assert.throws(()=>objTracking.requestCancellation(strToken),/Preparation/);assert.equal(objTracking.readTracking(strToken).bCanRequestCancellation,false);
}));
