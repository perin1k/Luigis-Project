import {createOrderService} from '../../src/ordering/order-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {createSyntheticVault} from '../../src/payments/synthetic-vault.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createMenuService} from '../../src/staff/menu-service.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
function fixture(fnWork){const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);const fnNow=()=>new Date('2026-10-21T15:00:00.000Z');const arrOrders=seedStaffOrders(objDatabase,{intCount:1,fnNow});const objTokens={};
  for(const strRole of ['admin','employee']){objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strRole,strRole,strRole,fnNow().toISOString());const strToken=randomBytes(32).toString('hex');objTokens[strRole]=strToken;objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),strRole,createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),strRole==='admin'?fnNow().toISOString():null,'2026-10-21T23:00:00.000Z');}
  try{fnWork({objDatabase,arrOrders,objTokens,objService:createMenuService(objDatabase,createSessionService(objDatabase,{fnNow})),objCatalog:createCatalogService(objDatabase)});}finally{objDatabase.close();}}
function prices(objSnapshot){return {strFingerprint:objSnapshot.objCatalog.strFingerprint,arrSizes:objSnapshot.objCatalog.arrSizes.map(({strCode,centsBase,centsTopping})=>({strCode,centsBase:centsBase+100,centsTopping})),arrDrinkSizes:objSnapshot.objCatalog.arrDrinkSizes.map(({strCode,centsPrice})=>({strCode,centsPrice}))};}
test('inventory review blocks preparation then permits authorized whole-order cancellation and exact refund',()=>fixture(({objDatabase,arrOrders,objTokens,objService})=>{
  const objSessions=createSessionService(objDatabase,{fnNow:()=>new Date('2026-10-21T15:00:00.000Z')});
  const objOrder=arrOrders[0];
  const objPurchased=objDatabase.prepare('SELECT q.* FROM order_quotes q JOIN orders o ON o.accepted_quote_id=q.id WHERE o.id=?').get(objOrder.strOrderId);
  const strLines=JSON.stringify(objDatabase.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY id').all(objOrder.strOrderId));
  const objIngredient=objService.read(objTokens.employee).arrIngredients.find((objRow)=>objRow.strLabel==='Pepperoni');
  objService.availability(objTokens.employee,{strId:objIngredient.strId,intRevision:objIngredient.intRevision,bAvailable:false});
  const fnRevision=()=>objDatabase.prepare('SELECT revision FROM orders WHERE id=?').get(objOrder.strOrderId).revision;
  assert.throws(()=>createOrderProgressService(objDatabase,objSessions).advanceOrder(objTokens.employee,objOrder.strReference,{intRevision:fnRevision(),strStatus:'Preparing'}),/held for review/);
  const objExceptions=createOrderExceptionService(objDatabase,objSessions);
  assert.equal(objExceptions.decide(objTokens.employee,objOrder.strReference,{intRevision:fnRevision(),strAction:'cancel'}),null);
  objExceptions.decide(objTokens.admin,objOrder.strReference,{intRevision:fnRevision(),strAction:'cancel'});
  assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders WHERE id=?').get(objOrder.strOrderId).fulfillment_status,'Cancelled');
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id WHERE b.order_id=? AND h.state='confirmed'").get(objOrder.strOrderId).n,0);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n,0);
  const objRefunds=createDemoRefundService(objDatabase,objSessions);
  const objRequest={intRevision:fnRevision(),strRequestId:randomUUID()};
  const objResult=objRefunds.refund(objTokens.admin,objOrder.strReference,objRequest);
  assert.equal(objResult.strState,'succeeded');
  assert.equal(objResult.centsAmount,objPurchased.total_cents);
  assert.equal(objRefunds.refund(objTokens.admin,objOrder.strReference,objRequest).bReplayed,true);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n,1);
  assert.equal(objDatabase.prepare('SELECT sum(signed_cents) AS centsNet FROM demo_financial_allocations').get().centsNet,0);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY id').all(objOrder.strOrderId)),strLines);
  assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length,0);
}));
test('admin price publication clones recipes, changes authoritative fingerprint and preserves paid snapshots',()=>fixture(({objDatabase,objTokens,objService,objCatalog})=>{
  const objBefore=objService.read(objTokens.admin);const strHistory=JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all());const objInput=prices(objBefore);
  assert.equal(objService.prices(objTokens.employee,objInput),null);assert.equal(objService.prices('invalid',objInput),null);
  const objAfter=objService.prices(objTokens.admin,objInput);assert.notEqual(objAfter.objCatalog.strFingerprint,objBefore.objCatalog.strFingerprint);assert.equal(objAfter.objCatalog.intRevision,2);assert.equal(objAfter.objCatalog.arrSizes[0].centsBase,objBefore.objCatalog.arrSizes[0].centsBase+100);assert.equal(objAfter.objCatalog.arrSizes[0].bAvailable,true);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all()),strHistory);assert.throws(()=>objService.prices(objTokens.admin,objInput),/Another team member/);assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.throws(()=>objCatalog.priceOrder({strCatalogFingerprint:objBefore.objCatalog.strFingerprint,arrPizzas:[{strSize:'small',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:0}),/menu changed/);
}));
test('employee availability disables recipes and opens review without silently changing purchased orders',()=>fixture(({objDatabase,arrOrders,objTokens,objService})=>{
  const objBefore=objService.read(objTokens.employee);const objIngredient=objBefore.arrIngredients.find((objRow)=>objRow.strLabel==='Pepperoni');
  const objAfter=objService.availability(objTokens.employee,{strId:objIngredient.strId,intRevision:objIngredient.intRevision,bAvailable:false});assert.equal(objAfter.intReviews,1);assert.equal(objAfter.objCatalog.arrToppings.find((objRow)=>objRow.strCode==='pepperoni').bAvailable,false);
  assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders WHERE id=?').get(arrOrders[0].strOrderId).fulfillment_status,'Received');assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM fulfillment_reviews WHERE state='open'").get().n,1);assert.throws(()=>objService.availability(objTokens.employee,{strId:objIngredient.strId,intRevision:objIngredient.intRevision,bAvailable:true}),/Another team member/);
}));
test('hours change flags affected bookings, preserves promised time, and denies employees and stale edits',()=>fixture(({objDatabase,objTokens,objService})=>{
  const objDay=objService.readHours(objTokens.admin,'2026-10-21').objDay;const strBookings=JSON.stringify(objDatabase.prepare('SELECT * FROM fulfillment_bookings').all());const objInput={strDate:'2026-10-21',intRevision:objDay.revision,bClosed:true,intOpens:10,intCloses:23};
  assert.equal(objService.hours(objTokens.employee,objInput),null);const objResult=objService.hours(objTokens.admin,objInput);assert.equal(objResult.intReviews,1);assert.equal(objResult.objDay.is_closed,1);assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM fulfillment_bookings').all()),strBookings);assert.throws(()=>objService.hours(objTokens.admin,objInput),/Another team member/);
  const objSpecial=objService.hours(objTokens.admin,{strDate:'2026-11-01',intRevision:0,bClosed:false,intOpens:10,intCloses:20});assert.equal(objSpecial.objDay.closes_at,'2026-11-02T02:00:00.000Z');assert.equal(objSpecial.objDay.cutoff_at,'2026-11-02T01:30:00.000Z');assert.equal(objSpecial.objDay.latest_pickup_at,'2026-11-02T01:50:00.000Z');
}));
test('validation and audit failure leave catalog/availability/history unchanged',()=>fixture(({objDatabase,objTokens,objService})=>{
  const objBefore=objService.read(objTokens.admin);const objInvalid=prices(objBefore);objInvalid.arrSizes[0].centsBase=1.2;assert.throws(()=>objService.prices(objTokens.admin,objInvalid),/whole cents/);
  objDatabase.exec("CREATE TRIGGER reject_menu_audit BEFORE INSERT ON audit_events WHEN NEW.action IN ('menu_change','availability_change','hours_change') BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  assert.throws(()=>objService.prices(objTokens.admin,prices(objBefore)),/audit failure/);assert.equal(objService.read(objTokens.admin).objCatalog.strFingerprint,objBefore.objCatalog.strFingerprint);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM catalog_versions').get().n,1);
  assert.throws(()=>objService.availability(objTokens.admin,{strId:objBefore.arrIngredients[0].strId,intRevision:1,bAvailable:false}),/audit failure/);assert.equal(objService.read(objTokens.admin).arrIngredients[0].bAvailable,1);
}));

for(const strChange of ['price','ingredient','hours'])test(`unpaid checkout rechecks ${strChange} changes without confirming or altering purchased history`,()=>fixture(({objDatabase,objTokens,objService,objCatalog})=>{
  const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});const strOrderId=randomUUID();
  createOrderService(objDatabase,objCatalog,objScheduling).submitOrder({strRequestId:strOrderId,strService:'carry-out',objContact:{strName:'Synthetic unpaid guest',strPhone:'2025550100',strEmail:''},objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup:{strServiceDate:'2026-10-21',intRevision:1,strSelectionType:'scheduled',dtPromisedAt:'2026-10-21T16:00:00.000Z'}});
  const strQuotes=JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes ORDER BY id').all());
  if(strChange==='price')objService.prices(objTokens.admin,prices(objService.read(objTokens.admin)));
  if(strChange==='ingredient'){const objIngredient=objService.read(objTokens.employee).arrIngredients.find((objRow)=>objRow.strLabel==='Pepperoni');objService.availability(objTokens.employee,{strId:objIngredient.strId,intRevision:objIngredient.intRevision,bAvailable:false});}
  if(strChange==='hours'){const objDay=objService.readHours(objTokens.admin,'2026-10-21').objDay;objService.hours(objTokens.admin,{strDate:'2026-10-21',intRevision:objDay.revision,bClosed:true,intOpens:10,intCloses:23});}
  const objPayments=createDemoPaymentService(objDatabase,{objCatalogService:objCatalog,objSchedulingService:objScheduling,objVault:createSyntheticVault({strActiveKeyId:'fixture',mapKeys:{fixture:randomBytes(32).toString('hex')}})});
  assert.throws(()=>objPayments.pay({strOrderId,strRequestId:randomUUID(),strMethod:'card'}),(objError)=>objError.intStatus===409);
  assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders WHERE id=?').get(strOrderId).fulfillment_status,null);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts WHERE order_id=?').get(strOrderId).n,0);assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes ORDER BY id').all()),strQuotes);
}));
