import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {openDatabase,runTransaction} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createRetentionService} from '../../src/data/retention-service.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createStaffOrdersService} from '../../src/staff/orders-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createNotificationService} from '../../src/notifications/notification-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
function fixture(fnWork,intCount=2){const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);let numNow=Date.parse('2026-10-21T15:00:00.000Z');const fnNow=()=>new Date(numNow);const arrOrders=seedStaffOrders(objDatabase,{intCount,fnNow});for(const strRole of ['admin','employee'])objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strRole,strRole,strRole,fnNow().toISOString());const objSessions=createSessionService(objDatabase,{fnNow});
  function token(strRole='admin'){const strToken=randomBytes(32).toString('hex');objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),strRole,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),strRole==='admin'?fnNow().toISOString():null,new Date(numNow+8*3600000).toISOString());return strToken;}
  const objProgress=createOrderProgressService(objDatabase,objSessions);const objTracking=createTrackingService(objDatabase,objSessions,{fnNow});
  const arrPaths=runTransaction(objDatabase,()=>arrOrders.map((objOrder)=>objTracking.issueForPayment(objOrder.strOrderId,fnNow().toISOString())));
  function complete(objOrder){let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;for(const strStatus of ['Preparing','Baking','Ready','Completed'])intRevision=objProgress.advanceOrder(token('employee'),objOrder.strReference,{intRevision,strStatus}).intRevision;}
  try{fnWork({objDatabase,arrOrders,arrPaths,objTracking,objSessions,objCleanup:createRetentionService(objDatabase,{fnNow}),objNotifications:createNotificationService(objDatabase,objSessions,{fnNow}),objStaff:createStaffOrdersService(objDatabase,objSessions),token,complete,setNow(dtValue){numNow=Date.parse(dtValue);}});}finally{objDatabase.close();}}
test('exact seven-day boundary redacts contacts/grants/previews while preserving financial records and idempotency',()=>fixture(({objDatabase,arrOrders,arrPaths,objTracking,objCleanup,objNotifications,objStaff,token,complete,setNow})=>{
  const objOrder=arrOrders[0];complete(objOrder);objNotifications.processPending();const strHistory=JSON.stringify(objDatabase.prepare('SELECT * FROM demo_payment_attempts').all());const strLedger=JSON.stringify(objDatabase.prepare('SELECT * FROM demo_financial_allocations').all());
  setNow('2026-10-28T14:59:59.999Z');assert.equal(objCleanup.cleanup().intOrders,0);assert.ok(objStaff.readOrder(token(),objOrder.strReference).objContact);
  setNow('2026-10-28T15:00:00.000Z');assert.equal(objStaff.readOrder(token(),objOrder.strReference).objContact,null);assert.equal(objStaff.readOrder(token(),objOrder.strReference).strCustomerName,'Contact unavailable');assert.equal(objTracking.readTracking(arrPaths[0].split('#')[1]),null);
  const objResult=objCleanup.cleanup();assert.equal(objResult.intOrders,1);assert.equal(objResult.intContacts,1);assert.equal(objResult.intTrackingGrants,1);assert.equal(objResult.intNotifications,4);assert.equal(objResult.intPaymentSecrets,2);
  const objContact=objDatabase.prepare('SELECT * FROM order_contacts WHERE order_id=?').get(objOrder.strOrderId);assert.equal(objContact.customer_name,null);assert.equal(objContact.phone,null);assert.equal(objContact.email,null);assert.equal(objContact.redacted_at,'2026-10-28T15:00:00.000Z');assert.equal(objDatabase.prepare('SELECT id FROM tracking_grants WHERE order_id=?').get(objOrder.strOrderId),undefined);assert.equal(objDatabase.prepare('SELECT n.id FROM notification_outbox n WHERE n.order_id=?').get(objOrder.strOrderId),undefined);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM demo_payment_attempts').all()),strHistory);assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM demo_financial_allocations').all()),strLedger);assert.ok(objDatabase.prepare('SELECT customer_name FROM order_contacts WHERE order_id=?').get(arrOrders[1].strOrderId).customer_name);
  const intAudits=objDatabase.prepare("SELECT count(*) AS n FROM audit_events WHERE action='retention_cleanup'").get().n;assert.deepEqual(objCleanup.cleanup(),{intOrders:0,intContacts:0,intTrackingGrants:0,intNotifications:0,intPaymentSecrets:0});assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM audit_events WHERE action='retention_cleanup'").get().n,intAudits);assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length,0);
}));
test('pending cancellation and failed refund retain contacts until seven days after actual refund resolution',()=>fixture(({objDatabase,arrOrders,arrPaths,objTracking,objSessions,objCleanup,objStaff,token,setNow})=>{
  const objOrder=arrOrders[0];objTracking.requestCancellation(arrPaths[0].split('#')[1]);setNow('2026-10-29T15:00:00.000Z');assert.equal(objCleanup.cleanup().intOrders,0);assert.ok(objStaff.readOrder(token(),objOrder.strReference).objContact);let intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;
  intRevision=createOrderExceptionService(objDatabase,objSessions).decide(token(),objOrder.strReference,{intRevision,strAction:'cancel'}).intRevision;createDemoRefundService(objDatabase,objSessions,{fnProcess:()=>false}).refund(token(),objOrder.strReference,{intRevision,strRequestId:randomUUID()});setNow('2026-11-06T15:00:00.000Z');assert.equal(objCleanup.cleanup().intOrders,0);assert.ok(objStaff.readOrder(token(),objOrder.strReference).objContact);
  intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;createDemoRefundService(objDatabase,objSessions).refund(token(),objOrder.strReference,{intRevision,strRequestId:randomUUID()});setNow('2026-11-13T14:59:59.999Z');assert.equal(objCleanup.cleanup().intOrders,0);setNow('2026-11-13T15:00:00.000Z');assert.equal(objCleanup.cleanup().intOrders,1);assert.equal(objStaff.readOrder(token(),objOrder.strReference).objContact,null);
}));
test('audit failure rolls back cleanup and read-time expiry still prevents contact disclosure',()=>fixture(({objDatabase,arrOrders,objCleanup,objNotifications,objStaff,token,complete,setNow})=>{
  const objOrder=arrOrders[0];complete(objOrder);objNotifications.processPending();setNow('2026-10-28T15:00:00.000Z');objDatabase.exec("CREATE TRIGGER reject_retention BEFORE INSERT ON audit_events WHEN NEW.action='retention_cleanup' BEGIN SELECT RAISE(ABORT,'fixture cleanup audit failure'); END");assert.throws(()=>objCleanup.cleanup(),/audit failure/);assert.ok(objDatabase.prepare('SELECT customer_name FROM order_contacts WHERE order_id=?').get(objOrder.strOrderId).customer_name);assert.ok(objDatabase.prepare('SELECT id FROM tracking_grants WHERE order_id=?').get(objOrder.strOrderId));assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM notification_previews').get().n,6);assert.equal(objStaff.readOrder(token(),objOrder.strReference).objContact,null);objDatabase.exec('DROP TRIGGER reject_retention');assert.equal(objCleanup.cleanup().intOrders,1);
}));
test('cleanup bounds each batch and does not erase explicit grant caps on active orders',()=>fixture(({objDatabase,arrOrders,arrPaths,objTracking,objCleanup,token,complete,setNow})=>{
  objDatabase.prepare('UPDATE tracking_grants SET expires_at=? WHERE order_id=?').run('2026-10-22T15:00:00.000Z',arrOrders[0].strOrderId);setNow('2026-10-23T15:00:00.000Z');assert.equal(objCleanup.cleanup().intTrackingGrants,0);assert.throws(()=>objTracking.replaceGrant(token(),arrOrders[0].strReference),/expired/);
  for(const objOrder of arrOrders)complete(objOrder);setNow('2026-10-30T15:00:00.000Z');assert.equal(objCleanup.cleanup().intOrders,50);assert.equal(objCleanup.cleanup().intOrders,5);assert.equal(objCleanup.cleanup().intOrders,0);assert.equal(objTracking.readTracking(arrPaths[0].split('#')[1]),null);assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
},55));

function unpaid(objDatabase){
  const objCatalog=createCatalogService(objDatabase);
  const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});
  const strOrderId=randomUUID();
  createOrderService(objDatabase,objCatalog,objScheduling).submitOrder({strRequestId:strOrderId,strService:'carry-out',objContact:{strName:'Synthetic abandoned guest',strPhone:'2025550100',strEmail:''},objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup:{strServiceDate:'2026-10-21',intRevision:1,strSelectionType:'scheduled',dtPromisedAt:'2026-10-21T16:00:00.000Z'}});
  return objDatabase.prepare('SELECT * FROM orders WHERE id=?').get(strOrderId);
}
test('abandoned checkout contacts expire exactly seven days after checkout expiry without deleting history',()=>fixture(({objDatabase,objCleanup,setNow})=>{
  const objOrder=unpaid(objDatabase);const strHistory=JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all());
  setNow('2026-10-28T15:29:59.999Z');assert.equal(objCleanup.cleanup().intContacts,0);
  setNow('2026-10-28T15:30:00.000Z');assert.equal(objCleanup.cleanup().intContacts,1);
  assert.equal(objDatabase.prepare('SELECT customer_name FROM order_contacts WHERE order_id=?').get(objOrder.id).customer_name,null);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all()),strHistory);assert.equal(objCleanup.cleanup().intOrders,0);
},0));
test('unresolved payment protects abandoned contacts and later confirmed failure restarts the seven-day clock',()=>fixture(({objDatabase,objCleanup,setNow})=>{
  const objOrder=unpaid(objDatabase);
  // Synthetic pending/failure storage only: no provider verification or successful charge is fabricated.
  objDatabase.prepare("INSERT INTO payment_attempts (id,order_id,quote_id,provider,idempotency_key,amount_cents,currency,created_at) VALUES ('pending-fixture',?,?,'stripe','pending-fixture',768,'USD','2026-10-21T15:00:00.000Z')").run(objOrder.id,objOrder.accepted_quote_id);
  setNow('2026-10-29T15:00:00.000Z');assert.equal(objCleanup.cleanup().intContacts,0);
  objDatabase.prepare("UPDATE payment_attempts SET state='failed',failed_at='2026-10-29T15:00:00.000Z' WHERE id='pending-fixture'").run();
  setNow('2026-11-05T14:59:59.999Z');assert.equal(objCleanup.cleanup().intContacts,0);
  setNow('2026-11-05T15:00:00.000Z');assert.equal(objCleanup.cleanup().intContacts,1);
  assert.equal(objDatabase.prepare("SELECT state FROM payment_attempts WHERE id='pending-fixture'").get().state,'failed');assert.deepEqual(objDatabase.prepare('PRAGMA foreign_key_check').all(),[]);
},0));
