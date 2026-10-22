import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
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
  try{fnWork({objDatabase,objService,arrOrders,setNow:(numValue)=>{numNow=numValue;}});}finally{objDatabase.close();}
}
test('employee/admin can read paid operational orders with minimum contact detail and no financial/admin fields',()=>fixture(({objService,arrOrders})=>{
  const objQueue=objService.listOrders(EMPLOYEE_TOKEN);assert.equal(objQueue.arrOrders.length,3);
  assert.equal(objService.listOrders(ADMIN_TOKEN).arrOrders.length,3);
  assert.doesNotMatch(JSON.stringify(objQueue),/202555|unused@example|cents|ciphertext|password|key_id|strRole|session/);
  const objOrder=objService.readOrder(EMPLOYEE_TOKEN,arrOrders[0].strReference);assert.equal(objOrder.objContact.strPhone,'2025550100');assert.equal(objOrder.objContact.strEmail,'');assert.match(objOrder.arrItems[0].strDescription,/Pepperoni/);
  assert.doesNotMatch(JSON.stringify(objOrder),/cents|ciphertext|nonce_hex|payment_id|password_hash/);
}));
test('unknown, expired, disabled and revoked sessions cannot read orders; admin MFA stays enforced',()=>fixture(({objDatabase,objService,arrOrders,setNow})=>{
  assert.equal(objService.listOrders(null),null);assert.equal(objService.readOrder('f'.repeat(64),arrOrders[0].strReference),null);
  assert.throws(()=>objDatabase.exec("UPDATE staff_sessions SET mfa_verified_at=NULL WHERE id='admin'"),/MFA/);objDatabase.exec("UPDATE staff_sessions SET revoked_at='2026-10-21T15:00:00.000Z' WHERE id='admin'");assert.equal(objService.listOrders(ADMIN_TOKEN),null);
  objDatabase.exec("UPDATE staff_users SET state='disabled',disabled_at='2026-10-21T15:00:00.000Z' WHERE id='employee'");assert.equal(objService.listOrders(EMPLOYEE_TOKEN),null);
  objDatabase.exec("UPDATE staff_users SET state='active',disabled_at=NULL WHERE id='employee'");setNow(Date.parse('2026-10-21T15:30:00.000Z'));assert.equal(objService.listOrders(EMPLOYEE_TOKEN),null);
}));
test('queue filters, stable pages and status/date handling preserve active paid-only boundaries',()=>fixture(({objDatabase,objService,arrOrders})=>{
  const objFirst=objService.listOrders(EMPLOYEE_TOKEN);assert.equal(objFirst.arrOrders.length,20);assert.equal(objFirst.bHasNext,true);
  const objSecond=objService.listOrders(EMPLOYEE_TOKEN,{page:'1'});assert.equal(objSecond.arrOrders.length,3);assert.equal(new Set([...objFirst.arrOrders,...objSecond.arrOrders].map((objOrder)=>objOrder.strReference)).size,23);
  objDatabase.prepare("UPDATE orders SET fulfillment_status='Completed',completed_at=? WHERE id=?").run('2026-10-21T15:00:00.000Z',arrOrders[0].strOrderId);
  assert.equal(objService.listOrders(EMPLOYEE_TOKEN,{status:'Received',date:'2026-10-21'}).arrOrders.length,20);
  assert.equal(objService.listOrders(EMPLOYEE_TOKEN,{date:'2026-10-22'}).arrOrders.length,0);
  for(const objFilter of [{date:'2026-02-30'},{page:'-1'},{status:'Cancelled'},{role:'admin'},{date:['2026-10-21']}])assert.throws(()=>objService.listOrders(EMPLOYEE_TOKEN,objFilter));
},23));
test('unpaid orders stay hidden; cancellation/review and contact redaction are represented safely',()=>fixture(({objDatabase,objService,arrOrders})=>{
  const objFirst=arrOrders[0];
  objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code) VALUES ('cancel',?,'customer','synthetic_fixture')").run(objFirst.strOrderId);
  objDatabase.prepare("INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference) VALUES ('review',?,'inventory_change','fixture')").run(objFirst.strOrderId);
  const objOrder=objService.readOrder(EMPLOYEE_TOKEN,objFirst.strReference);assert.equal(objOrder.arrWarnings.length,2);
  objDatabase.prepare("UPDATE order_contacts SET customer_name=NULL,phone=NULL,email=NULL,redacted_at='2026-10-21T15:00:00.000Z' WHERE order_id=?").run(objFirst.strOrderId);
  assert.equal(objService.readOrder(EMPLOYEE_TOKEN,objFirst.strReference).objContact,null);
  objDatabase.prepare('DELETE FROM order_contacts WHERE order_id=?').run(objFirst.strOrderId);assert.equal(objService.readOrder(EMPLOYEE_TOKEN,objFirst.strReference).objContact,null);
  assert.throws(()=>objService.readOrder(EMPLOYEE_TOKEN,'not-found'),/not found/);
  const objVersion=objDatabase.prepare('SELECT id FROM catalog_versions LIMIT 1').get();objDatabase.prepare("INSERT INTO orders (id,public_reference,service_type,catalog_version_id,fulfillment_status) VALUES ('unpaid','unpaid','carry-out',?,'Received')").run(objVersion.id);
  assert.equal(objService.listOrders(EMPLOYEE_TOKEN).arrOrders.length,3);assert.throws(()=>objService.readOrder(EMPLOYEE_TOKEN,'unpaid'),/not found/);
}));
