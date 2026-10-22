import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
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
  try{fnWork({objDatabase,objService,objProgress:createOrderProgressService(objDatabase,createSessionService(objDatabase,{fnNow})),arrOrders,setNow:(numValue)=>{numNow=numValue;}});}finally{objDatabase.close();}
}
test('authorized staff advance exactly one step with timestamps and one event; stale retries cannot advance twice',()=>fixture(({objDatabase,objService,objProgress,arrOrders})=>{
  const strReference=arrOrders[0].strReference;let intRevision=objService.readOrder(EMPLOYEE_TOKEN,strReference).intRevision;
  for(const strStatus of ['Preparing','Baking','Ready','Completed']){
    const objResult=objProgress.advanceOrder(EMPLOYEE_TOKEN,strReference,{intRevision,strStatus});assert.equal(objResult.strStatus,strStatus);
    assert.throws(()=>objProgress.advanceOrder(ADMIN_TOKEN,strReference,{intRevision,strStatus}),/changed/);intRevision=objResult.intRevision;
  }
  const arrEvents=objDatabase.prepare("SELECT * FROM order_events WHERE order_id=? AND event_type='fulfillment_progress' ORDER BY sequence").all(arrOrders[0].strOrderId);
  assert.equal(arrEvents.length,4);assert.deepEqual(arrEvents.map((objEvent)=>objEvent.to_status),['Preparing','Baking','Ready','Completed']);assert.ok(arrEvents.every((objEvent)=>objEvent.actor_id==='employee'&&objEvent.occurred_at==='2026-10-21T15:00:00.000Z'));
  const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(arrOrders[0].strOrderId);assert.equal(objOrder.completed_at,'2026-10-21T15:00:00.000Z');assert.equal(objService.listOrders(EMPLOYEE_TOKEN).arrOrders.length,2);
}));
test('invalid, skipped, unknown, unpaid and unauthorized updates cannot mutate state',()=>fixture(({objDatabase,objService,objProgress,arrOrders})=>{
  const strReference=arrOrders[0].strReference;const intRevision=objService.readOrder(EMPLOYEE_TOKEN,strReference).intRevision;
  assert.equal(objProgress.advanceOrder(null,strReference,{intRevision,strStatus:'Preparing'}),null);
  for(const objInput of [{intRevision,strStatus:'Ready'},{intRevision:0,strStatus:'Preparing'},{intRevision,strStatus:'Cancelled'},{intRevision,strStatus:'Preparing',role:'admin'},null])assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,strReference,objInput));
  assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,'missing',{intRevision,strStatus:'Preparing'}),/not found/);
  objDatabase.prepare("INSERT INTO orders (id,public_reference,service_type,catalog_version_id,fulfillment_status) SELECT 'unpaid','unpaid','carry-out',catalog_version_id,'Received' FROM orders LIMIT 1").run();
  assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,'unpaid',{intRevision:1,strStatus:'Preparing'}),/not found/);
  assert.equal(objService.readOrder(EMPLOYEE_TOKEN,strReference).strStatus,'Received');
}));
test('cancellation and review holds block progress; ingredient and capacity guards block preparation',()=>fixture(({objDatabase,objService,objProgress,arrOrders})=>{
  const objFirst=arrOrders[0];const objInput={intRevision:objService.readOrder(EMPLOYEE_TOKEN,objFirst.strReference).intRevision,strStatus:'Preparing'};
  objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code) VALUES ('cancel',?,'customer','fixture')").run(objFirst.strOrderId);
  assert.throws(()=>objProgress.advanceOrder(ADMIN_TOKEN,objFirst.strReference,objInput),/held/);
  const objSecond=arrOrders[1];const objSecondInput={intRevision:objService.readOrder(EMPLOYEE_TOKEN,objSecond.strReference).intRevision,strStatus:'Preparing'};
  objDatabase.prepare("INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference) VALUES ('review',?,'hours_change','fixture')").run(objSecond.strOrderId);
  assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,objSecond.strReference,objSecondInput),/held/);
  const objThird=arrOrders[2];const objThirdInput={intRevision:objService.readOrder(EMPLOYEE_TOKEN,objThird.strReference).intRevision,strStatus:'Preparing'};
  objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='pepperoni'");assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,objThird.strReference,objThirdInput),/ingredient/);
  objDatabase.exec("UPDATE ingredients SET is_available=1 WHERE code='pepperoni'");
  objDatabase.prepare("UPDATE capacity_holds SET state='released',released_at='2026-10-21T15:00:00.000Z' WHERE booking_id IN (SELECT id FROM fulfillment_bookings WHERE order_id=?)").run(objThird.strOrderId);
  assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,objThird.strReference,objThirdInput),/capacity/);
}));
test('event-write failure rolls back the status/revision/timestamp and leaves retry possible',()=>fixture(({objDatabase,objService,objProgress,arrOrders})=>{
  const objFirst=arrOrders[0];const intRevision=objService.readOrder(EMPLOYEE_TOKEN,objFirst.strReference).intRevision;
  objDatabase.exec("CREATE TRIGGER fail_progress BEFORE INSERT ON order_events WHEN NEW.event_type='fulfillment_progress' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.throws(()=>objProgress.advanceOrder(EMPLOYEE_TOKEN,objFirst.strReference,{intRevision,strStatus:'Preparing'}),/fixture failure/);
  const objOrder=objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(objFirst.strOrderId);assert.equal(objOrder.revision,intRevision);assert.equal(objOrder.fulfillment_status,'Received');assert.equal(objOrder.preparing_at,null);
}));
