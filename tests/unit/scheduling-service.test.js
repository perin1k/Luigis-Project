import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
import { createSchedulingService } from '../../src/ordering/scheduling-service.js';
function fixture(fnWork) {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
  let dtNow = '2026-10-21T15:00:00.000Z';
  const objScheduling = createSchedulingService(objDatabase, { fnNow: () => dtNow });
  const objCatalog = createCatalogService(objDatabase); const objOrders = createOrderService(objDatabase, objCatalog, objScheduling);
  function input(intQuantity = 1, dtPromisedAt = '2026-10-21T16:00:00.000Z', strType = 'scheduled') {
    return { strRequestId: randomUUID(), strService: 'carry-out', objContact: { strName: 'Synthetic Guest', strPhone: '2025550100', strEmail: '' },
      objPricing: { strCatalogFingerprint: objCatalog.readCatalog().strFingerprint, arrPizzas: [{ strSize: 'medium', strCrust: 'regular', arrToppings: [], intQuantity }], arrDrinks: [], intTipPercent: 0 },
      objPickup: { strServiceDate: '2026-10-21', intRevision: 1, strSelectionType: strType, dtPromisedAt } };
  }
  try { fnWork({ objDatabase, objScheduling, objOrders, input, setNow: (dtValue) => { dtNow = dtValue; } }); } finally { objDatabase.close(); }
}
test('Chicago DST, before-opening, exact cutoff and after-cutoff schedules use restaurant dates', () => fixture(({ objScheduling, setNow }) => {
  setNow('2026-10-21T12:00:00.000Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2026-10-21T15:00:00.000Z');
  setNow('2026-10-22T03:30:00.000Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2026-10-22T03:50:00.000Z');
  setNow('2026-10-22T03:30:00.001Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].strServiceDate,'2026-10-22');
  setNow('2026-11-01T12:00:00.000Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2026-11-01T16:00:00.000Z');
  setNow('2027-03-14T12:00:00.000Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2027-03-14T15:00:00.000Z');
}));
test('off-grid ASAP and rolling half-open capacity reject bucket-boundary overbooking', () => fixture(({ objScheduling, objOrders, input, setNow }) => {
  setNow('2026-10-21T15:59:00.000Z');
  objOrders.submitOrder(input(4,'2026-10-21T16:19:00.000Z','ASAP'));
  assert.throws(() => objOrders.submitOrder(input(3,'2026-10-21T16:20:00.000Z')), /no longer available/);
  objOrders.submitOrder(input(2,'2026-10-21T16:20:00.000Z'));
  // Exactly 20 minutes apart do not overlap, but the adjacent reservation still counts.
  objOrders.submitOrder(input(4,'2026-10-21T16:39:00.000Z','ASAP'));
  assert.equal(objScheduling.listOptions(6).arrOptions.some((objItem) => objItem.dtPromisedAt==='2026-10-21T16:40:00.000Z'),false);
}));
test('atomic hold expiry, replay and conflict behavior preserves original pickup without renewing', () => fixture(({ objDatabase, objScheduling, objOrders, input, setNow }) => {
  const objInput = input(6); const objSaved = objOrders.submitOrder(objInput);
  assert.equal(objSaved.objPickup.dtExpiresAt,'2026-10-21T15:30:00.000Z');
  assert.throws(() => objOrders.submitOrder(input()),/no longer available/);
  setNow('2026-10-21T15:30:00.000Z');
  const objReplay = objOrders.submitOrder(objInput); assert.equal(objReplay.objPickup.strHoldState,'expired');
  assert.equal(objReplay.objPickup.dtExpiresAt,objSaved.objPickup.dtExpiresAt);
  objOrders.submitOrder(input(6));
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM capacity_holds WHERE state='expired'").get().n,1);
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM orders").get().n,2);
  assert.equal(objScheduling.listOptions(6).arrOptions.some((objItem)=>objItem.dtPromisedAt==='2026-10-21T16:00:00.000Z'),false);
}));
test('schedule revision changes, malformed selections and late/early times roll back all order data', () => fixture(({ objDatabase, objOrders, input }) => {
  for (const objPickup of [null, {...input().objPickup,strSelectionType:'ASAP'}, {...input().objPickup,intRevision:2}, {...input().objPickup,dtPromisedAt:'2026-10-21T15:10:00.000Z'}, {...input().objPickup,dtPromisedAt:'2026-10-21T16:01:00.000Z'}, {...input().objPickup,dtPromisedAt:'2026-10-22T03:51:00.000Z'}]) {
    assert.throws(()=>objOrders.submitOrder({...input(),objPickup}));
  }
  for (const strTable of ['orders','order_quotes','order_contacts','order_lines','capacity_holds','fulfillment_bookings']) assert.equal(objDatabase.prepare(`SELECT count(*) AS n FROM ${strTable}`).get().n,0);
}));
test('ASAP advances to capacity release and includes confirmed bookings beyond hold expiry', () => fixture(({ objDatabase, objScheduling, objOrders, input, setNow }) => {
  objOrders.submitOrder(input(6,'2026-10-21T15:20:00.000Z','ASAP'));
  assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2026-10-21T15:40:00.000Z');
  objDatabase.exec("UPDATE capacity_holds SET state='confirmed',confirmed_at='2026-10-21T15:01:00.000Z'");
  setNow('2026-10-21T15:30:00.000Z');
  // Confirmed past promises still affect nearby slots; here the 20-minute lead is stricter.
  assert.equal(objScheduling.listOptions(1).arrOptions[0].dtPromisedAt,'2026-10-21T15:50:00.000Z');
}));
test('closed and special service days override defaults and revisions invalidate stale selection', () => fixture(({ objDatabase, objScheduling, objOrders, input, setNow }) => {
  objDatabase.exec(`INSERT INTO service_days (id,service_date,is_closed) VALUES ('closed','2026-10-21',1);
    INSERT INTO service_days (id,service_date,opens_at,closes_at,cutoff_at,latest_pickup_at,revision)
    VALUES ('special','2026-10-22','2026-10-22T17:00:00.000Z','2026-10-22T23:00:00.000Z','2026-10-22T22:30:00.000Z','2026-10-22T22:50:00.000Z',2)`);
  const objOption = objScheduling.listOptions(1).arrOptions[0]; assert.equal(objOption.dtPromisedAt,'2026-10-22T17:00:00.000Z'); assert.equal(objOption.intRevision,2);
  const objInput = {...input(), objPickup:objOption};
  objDatabase.exec("UPDATE service_days SET revision=3 WHERE id='special'");
  assert.throws(()=>objOrders.submitOrder(objInput),/no longer available/);
  setNow('2026-10-22T22:30:00.001Z'); assert.equal(objScheduling.listOptions(1).arrOptions[0].strServiceDate,'2026-10-23');
}));
test('confirmed capacity remains consumed after the original expiration timestamp', () => fixture(({ objDatabase,objScheduling,objOrders,input,setNow })=>{
  objOrders.submitOrder(input(6,'2026-10-21T18:00:00.000Z'));
  objDatabase.exec("UPDATE capacity_holds SET state='confirmed',confirmed_at='2026-10-21T15:01:00.000Z'");
  setNow('2026-10-21T15:31:00.000Z');
  assert.equal(objScheduling.listOptions(1).arrOptions.some((objItem)=>objItem.dtPromisedAt==='2026-10-21T18:00:00.000Z'),false);
}));
