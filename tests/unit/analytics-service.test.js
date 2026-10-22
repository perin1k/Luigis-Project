import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createAnalyticsService} from '../../src/staff/analytics-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
function fixture(fnWork,dtStart='2026-10-21T15:00:00.000Z'){const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);let numNow=Date.parse(dtStart);const fnNow=()=>new Date(numNow);const arrOrders=seedStaffOrders(objDatabase,{intCount:2,fnNow});for(const strRole of ['admin','employee'])objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strRole,strRole,strRole,fnNow().toISOString());const objSessions=createSessionService(objDatabase,{fnNow});
  function token(strRole='admin',bMfa=true){const strToken=randomBytes(32).toString('hex');objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),strRole,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),bMfa?fnNow().toISOString():null,new Date(numNow+8*3600000).toISOString());return strToken;}
  try{fnWork({objDatabase,arrOrders,objSessions,objService:createAnalyticsService(objDatabase,objSessions),token,setNow(dtValue){numNow=Date.parse(dtValue);}});}finally{objDatabase.close();}}
test('period sales use payment/refund dates while cancelled cohorts stay excluded',()=>fixture(({objDatabase,arrOrders,objSessions,objService,token,setNow})=>{
  const objOrder=arrOrders[0];let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;intRevision=createOrderExceptionService(objDatabase,objSessions).decide(token(),objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;
  assert.equal(objService.read(token(),{from:'2026-10-21',to:'2026-10-21'}).intCancelledAwaitingRefund,1);
  setNow('2026-10-22T15:00:00.000Z');createDemoRefundService(objDatabase,objSessions).refund(token(),objOrder.strReference,{intRevision,strRequestId:randomUUID()});
  const objSale=objService.read(token(),{from:'2026-10-21',to:'2026-10-21'});assert.equal(objSale.objPeriod.centsItems,1800);assert.equal(objSale.objPeriod.centsTax,176);assert.equal(objSale.objPaymentCohort.intEligibleOrders,1);assert.equal(objSale.objPaymentCohort.centsAverageItems,900);assert.equal(objSale.intCancelledAwaitingRefund,0);
  const objRefund=objService.read(token(),{from:'2026-10-22',to:'2026-10-22'});assert.equal(objRefund.objPeriod.centsItems,-900);assert.equal(objRefund.objPeriod.centsTax,-88);assert.equal(objRefund.objPeriod.centsRefunds,988);assert.equal(objRefund.objPeriod.centsNetRecorded,-988);assert.equal(objRefund.objPaymentCohort.centsAverageItems,null);assert.equal(objRefund.objPeriod.centsProcessorCosts,0);assert.equal(objRefund.objPeriod.centsRetainedCancellationRecovery,0);
}));
test('Central date boundaries exclude UTC-adjacent days and invalid filters never run reports',()=>fixture(({objService,token})=>{
  const strToken=token();for(const objInput of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-22',to:'2026-10-21'},{from:'2025-01-01',to:'2026-12-31'},{from:'2026-10-21',to:'2026-10-21',role:'admin'},{from:['2026-10-21'],to:'2026-10-21'}])assert.throws(()=>objService.read(strToken,objInput),/date range/);
  assert.equal(objService.read(strToken,{from:'2026-10-20',to:'2026-10-20'}).objPaymentCohort.centsAverageItems,null);
  assert.equal(objService.read(strToken,{from:'2026-10-21',to:'2026-10-21'}).objPickup.arrHours[0].intHour,11);
}));
test('employees, missing MFA and expired sessions cannot access financial aggregates',()=>fixture(({objService,token,setNow})=>{
  const objInput={from:'2026-10-21',to:'2026-10-21'};assert.equal(objService.read('invalid',objInput),null);assert.equal(objService.read(token('employee'),objInput),null);assert.throws(()=>token('admin',false),/MFA/);const strToken=token();setNow('2026-10-21T15:31:00.000Z');assert.equal(objService.read(strToken,objInput),null);
}));
test('pickup workload separates no-shows and reports timing coverage without invented zeros',()=>fixture(({objDatabase,arrOrders,objSessions,objService,token,setNow})=>{
  const objOrder=arrOrders[0];let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;setNow('2026-10-21T15:40:00.000Z');const objProgress=createOrderProgressService(objDatabase,objSessions);for(const strStatus of ['Preparing','Baking','Ready'])intRevision=objProgress.advanceOrder(token('employee'),objOrder.strReference,{intRevision,strStatus}).intRevision;
  setNow('2026-10-22T04:00:00.000Z');createOrderExceptionService(objDatabase,objSessions).decide(token(),objOrder.strReference,{intRevision,strAction:'not-collected'});const objResult=objService.read(token(),{from:'2026-10-21',to:'2026-10-21'});assert.equal(objResult.objPaymentCohort.intEligibleOrders,2);assert.equal(objResult.objPickup.arrHours[0].intNotCollected,1);assert.equal(objResult.objPickup.intReadyCoverage,1);assert.equal(objResult.objPickup.intOnTime,1);assert.equal(objResult.objPickup.numAverageElapsedMinutes,40);
}));

test('payments after UTC midnight remain on their Central service date',()=>fixture(({objService,token})=>{
  assert.equal(objService.read(token(),{from:'2026-10-21',to:'2026-10-21'}).objPaymentCohort.intEligibleOrders,2);assert.equal(objService.read(token(),{from:'2026-10-22',to:'2026-10-22'}).objPeriod.centsItems,0);
},'2026-10-22T02:00:00.000Z'));
