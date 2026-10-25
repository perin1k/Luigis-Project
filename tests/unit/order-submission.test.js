import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
function fixture(fnWork) {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
  const objCatalogService = createCatalogService(objDatabase);
  const objOrderService = createOrderService(objDatabase, objCatalogService);
  const objInput = { strRequestId: randomUUID(), strService: 'carry-out', objContact: { strName: 'Synthetic Guest', strPhone: '202-555-0100', strEmail: '' },
    objPricing: { strCatalogFingerprint: objCatalogService.readCatalog().strFingerprint, arrPizzas: [{ strSize: 'large', strCrust: 'regular', arrToppings: ['pepperoni', 'sausage'], intQuantity: 1 }], arrDrinks: [], intTipPercent: 10 } };
  return Promise.resolve().then(() => fnWork({ objDatabase, objCatalogService, objOrderService, objInput })).finally(() => objDatabase.close());
}
test('submission atomically saves immutable unpaid snapshots and safely replays after menu changes', () => fixture(({ objDatabase, objOrderService, objInput }) => {
  const objFirst = objOrderService.submitOrder(objInput); assert.equal(objFirst.strState, 'unpaid');
  const objQuote = objDatabase.prepare('SELECT * FROM order_quotes').get(); assert.equal(objQuote.total_cents, 1811);
  assert.equal(objDatabase.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status, null);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM payment_attempts').get().n, 0);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM fulfillment_bookings').get().n, 0);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=1000 WHERE code='large'");
  assert.deepEqual(objOrderService.submitOrder(objInput), { ...objFirst, bReplayed: true });
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
  assert.equal(objDatabase.prepare('SELECT unit_price_cents FROM order_lines').get().unit_price_cents, 1500);
  assert.throws(() => objDatabase.exec('UPDATE order_lines SET unit_price_cents=1'));
  assert.throws(() => objOrderService.submitOrder({ ...objInput, strService: 'dine-in' }), /different order/);
}));
test('contact rules, forged values, stale menus and quantities create no partial records', () => fixture(({ objDatabase, objOrderService, objInput }) => {
  for (const objBad of [
    { ...objInput, objContact: { ...objInput.objContact, strPhone: '' } },
    { ...objInput, objContact: { ...objInput.objContact, strName: '\nBad' } },
    { ...objInput, objContact: { ...objInput.objContact, strEmail: 'bad' } },
    { ...objInput, strService: 'delivery' },
    { ...objInput, objPricing: { ...objInput.objPricing, centsTotal: 1 } },
    { ...objInput, objPricing: { ...objInput.objPricing, arrPizzas: [{ ...objInput.objPricing.arrPizzas[0], intQuantity: 7 }] } },
  ]) assert.throws(() => objOrderService.submitOrder(objBad));
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM orders').get().n, 0);
  objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='cheese'");
  assert.throws(() => objOrderService.submitOrder(objInput), /menu changed/);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM orders').get().n, 0);
}));
test('dine-in accepts email instead of phone; a mid-write error rolls back contacts, lines and quotes', () => fixture(({ objDatabase, objOrderService, objInput }) => {
  objInput.strService = 'dine-in'; objInput.objContact.strPhone = ''; objInput.objContact.strEmail = 'guest@example.invalid';
  objDatabase.exec("CREATE TRIGGER fail_quote BEFORE INSERT ON order_quotes BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.throws(() => objOrderService.submitOrder(objInput), /fixture failure/);
  for (const strTable of ['orders', 'order_contacts', 'order_lines', 'pizza_line_details', 'pizza_line_toppings', 'order_quotes']) assert.equal(objDatabase.prepare(`SELECT count(*) AS n FROM ${strTable}`).get().n, 0);
  objDatabase.exec('DROP TRIGGER fail_quote');
  assert.equal(objOrderService.submitOrder(objInput).strState, 'unpaid');
}));
test('HTTP submission enforces same-origin JSON and keeps contacts out of responses', () => fixture(async ({ objDatabase, objCatalogService, objOrderService, objInput }) => {
  const objServer = createServer(createApp({ objCatalogService, objOrderService }));
  await new Promise((fnResolve) => objServer.listen(0, '127.0.0.1', fnResolve));
  const strOrigin = `http://127.0.0.1:${objServer.address().port}`;
  async function post(objBody, objHeaders = {}) { return fetch(`${strOrigin}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: strOrigin, ...objHeaders }, body: typeof objBody === 'string' ? objBody : JSON.stringify(objBody) }); }
  try {
    assert.equal((await post(objInput, { Origin: 'https://other.invalid' })).status, 403);
    assert.equal((await post(objInput, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await post('{')).status, 400); assert.equal((await post('x'.repeat(9000))).status, 413);
    const objResponse = await post(objInput); assert.equal(objResponse.status, 201); assert.equal(objResponse.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await objResponse.text(), /Synthetic Guest|555|customer_name|SELECT/);
    assert.equal((await post(objInput)).status, 200);
    assert.equal((await fetch(`${strOrigin}/api/orders/${objInput.strRequestId}`)).status, 403);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
  } finally { await new Promise((fnResolve) => objServer.close(fnResolve)); }
}));
