import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCustomerService} from '../../src/customer/customer-service.js';
import {readCustomerCookies,CUSTOMER_COOKIES} from '../../src/customer/customer-transport.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
import {createRetentionService} from '../../src/data/retention-service.js';

const PASSWORD='Invented customer passphrase for local tests';
function fixture(){const objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);seedMenu(objDatabase);let numNow=Date.parse('2026-10-24T18:00:00Z');
  const objCustomerService=createCustomerService(objDatabase,{fnNow:()=>new Date(numNow)});return {objDatabase,objCustomerService,advance:intMs=>{numNow+=intMs;}};}
test('customer registration normalizes names, protects credentials and cannot create staff access',async()=>{
  const {objDatabase,objCustomerService}=fixture();try{
    const objAccount=await objCustomerService.register('Test.Customer',PASSWORD);
    assert.equal(objCustomerService.readProfile(objAccount.strToken).strUsername,'test.customer');
    assert.equal(objAccount.arrRecoveryCodes.length,8);
    const strDump=JSON.stringify(objDatabase.prepare('SELECT * FROM customer_accounts').all());assert.ok(!strDump.includes(PASSWORD));
    assert.ok(!JSON.stringify(objDatabase.prepare('SELECT * FROM customer_sessions').all()).includes(objAccount.strToken));
    assert.ok(!JSON.stringify(objDatabase.prepare('SELECT * FROM customer_recovery_codes').all()).includes(objAccount.arrRecoveryCodes[0]));
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM staff_users').get().n,0);
    await assert.rejects(objCustomerService.register('TEST.CUSTOMER',PASSWORD),/unavailable/);
    await assert.rejects(objCustomerService.login('test.customer','bad'),/not accepted/);
    await assert.rejects(objCustomerService.login('unknown.customer',PASSWORD),/not accepted/);
    await assert.rejects(objCustomerService.register('weak','password'),/15 characters/);
  }finally{objDatabase.close();}
});
test('profile revisions, recovery replay prevention, session revocation and deletion',async()=>{
  const {objDatabase,objCustomerService}=fixture();try{
    const objA=await objCustomerService.register('review.customer',PASSWORD);
    const objB=await objCustomerService.login('review.customer',PASSWORD);
    objCustomerService.updateProfile(objA.strToken,{strName:'Synthetic Customer',strPhone:'2025550100',strEmail:''},1);
    assert.throws(()=>objCustomerService.updateProfile(objB.strToken,{strName:'stale',strPhone:'',strEmail:''},1),/changed/);
    assert.equal(objCustomerService.readProfile(objB.strToken).objProfile.strName,'Synthetic Customer');
    assert.throws(()=>objCustomerService.updateProfile(objB.strToken,{strName:'x',strPhone:'not phone',strEmail:''},2),/usable/);
    const objRecovered=await objCustomerService.recover('review.customer',objA.arrRecoveryCodes[0],PASSWORD+' changed');
    assert.equal(objRecovered.arrRecoveryCodes.length,8);
    assert.throws(()=>objCustomerService.readProfile(objA.strToken),/sign in/);
    assert.throws(()=>objCustomerService.readProfile(objB.strToken),/sign in/);
    await assert.rejects(objCustomerService.recover('review.customer',objA.arrRecoveryCodes[0],PASSWORD),/not accepted/);
    await assert.rejects(objCustomerService.login('review.customer',PASSWORD),/not accepted/);
    const objNew=await objCustomerService.login('review.customer',PASSWORD+' changed');
    await assert.rejects(objCustomerService.deleteAccount(objNew.strToken,'bad'),/not accepted/);
    await objCustomerService.deleteAccount(objNew.strToken,PASSWORD+' changed');
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_accounts').get().n,0);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_sessions').get().n,0);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_recovery_codes').get().n,0);
  }finally{objDatabase.close();}
});
test('customer idle and absolute session deadlines never extend with activity',async()=>{
  const {objDatabase,objCustomerService,advance}=fixture();try{
    const objA=await objCustomerService.register('session.customer',PASSWORD);advance(30*60000);
    assert.throws(()=>objCustomerService.readProfile(objA.strToken),/sign in/);
    const objB=await objCustomerService.login('session.customer',PASSWORD);
    for(let intIndex=0;intIndex<32;intIndex++){advance(15*60000);if(intIndex<31)objCustomerService.readProfile(objB.strToken);}
    assert.throws(()=>objCustomerService.readProfile(objB.strToken),/sign in/);
  }finally{objDatabase.close();}
});
test('order ownership is transactional and cannot claim guest or other customer orders; deletion preserves orders',async()=>{
  const {objDatabase,objCustomerService}=fixture();try{
    const objA=await objCustomerService.register('order.customer',PASSWORD);const objB=await objCustomerService.register('other.customer',PASSWORD);
    const objCatalog=createCatalogService(objDatabase);const objOrders=createOrderService(objDatabase,objCatalog,undefined,{objCustomerService});
    function input(){return {strRequestId:randomUUID(),strService:'carry-out',objContact:{strName:'Synthetic Guest',strPhone:'2025550100',strEmail:''},objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'small',strCrust:'regular',arrToppings:[],intQuantity:1}],arrDrinks:[],intTipPercent:0}};}
    const objInput=input();objOrders.submitOrder(objInput,objA.strToken);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_order_links').get().n,1);
    assert.throws(()=>objDatabase.prepare('UPDATE customer_order_links SET customer_id=(SELECT id FROM customer_accounts WHERE username=?)').run('other.customer'),/cannot be reassigned/);
    assert.throws(()=>objOrders.submitOrder(objInput,objB.strToken),/another sign-in/);
    assert.throws(()=>objOrders.submitOrder(input(),'a'.repeat(64)),/expired/);
    const objGuest=input();objOrders.submitOrder(objGuest);objOrders.submitOrder(objGuest,objB.strToken);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_order_links').get().n,1);
    assert.deepEqual(objCustomerService.orders(objB.strToken),[]);
    await objCustomerService.deleteAccount(objA.strToken,PASSWORD);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM orders').get().n,2);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_order_links').get().n,0);
  }finally{objDatabase.close();}
});
test('customer cookie parser ignores staff identities and rejects duplicates/malformed tokens',()=>{
  assert.deepEqual(readCustomerCookies('__Host-luigis-session='+'a'.repeat(64)),{});
  assert.throws(()=>readCustomerCookies(`${CUSTOMER_COOKIES.strSession}=bad`));
  assert.throws(()=>readCustomerCookies(`${CUSTOMER_COOKIES.strSession}=${'a'.repeat(64)};${CUSTOMER_COOKIES.strSession}=${'b'.repeat(64)}`));
});
test('asynchronous password operations recheck account revisions and one-use recovery proofs',async()=>{
  const {objDatabase,objCustomerService}=fixture();try{
    const objA=await objCustomerService.register('race.customer',PASSWORD);
    const pDelete=objCustomerService.deleteAccount(objA.strToken,PASSWORD);
    objCustomerService.updateProfile(objA.strToken,{strName:'Changed during verification',strPhone:'',strEmail:''},1);
    await assert.rejects(pDelete,/changed/);
    const arrResults=await Promise.allSettled([
      objCustomerService.recover('race.customer',objA.arrRecoveryCodes[0],PASSWORD+' first'),
      objCustomerService.recover('race.customer',objA.arrRecoveryCodes[0],PASSWORD+' second')
    ]);
    assert.equal(arrResults.filter(objRow=>objRow.status==='fulfilled').length,1);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_accounts').get().n,1);
  }finally{objDatabase.close();}
});
test('expired final orders vanish before cleanup, then links are removed without deleting the profile',async()=>{
  const {objDatabase,objCustomerService,advance}=fixture();try{
    const objAccount=await objCustomerService.register('retention.customer',PASSWORD);
    const [objOrder]=seedStaffOrders(objDatabase,{intCount:1});
    const strId=objDatabase.prepare('SELECT id FROM customer_accounts').get().id;
    // Private fixture association only: production has no guest-linking endpoint.
    objDatabase.prepare('INSERT INTO customer_order_links VALUES (?,?)').run(objOrder.strOrderId,strId);
    assert.equal(objCustomerService.orders(objAccount.strToken).length,1);
    objDatabase.prepare("UPDATE orders SET fulfillment_status='Completed',preparing_at='2026-10-21T16:00:00.000Z',baking_at='2026-10-21T16:05:00.000Z',ready_at='2026-10-21T16:15:00.000Z',completed_at='2026-10-21T16:20:00.000Z' WHERE id=?").run(objOrder.strOrderId);
    advance(8*86400000);const objNew=await objCustomerService.login('retention.customer',PASSWORD);
    assert.deepEqual(objCustomerService.orders(objNew.strToken),[]);
    createRetentionService(objDatabase,{fnNow:()=>new Date('2026-11-01T18:00:00Z')}).cleanup();
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM customer_order_links').get().n,0);
    assert.equal(objCustomerService.readProfile(objNew.strToken).strUsername,'retention.customer');
  }finally{objDatabase.close();}
});
