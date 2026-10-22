import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
function fixture() {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
  const objService = createCatalogService(objDatabase);
  const objInput = { strCatalogFingerprint: objService.readCatalog().strFingerprint,
    arrPizzas: [{ strSize: 'large', strCrust: 'regular', arrToppings: ['pepperoni', 'sausage'], intQuantity: 1 }],
    arrDrinks: [], intTipPercent: 0 };
  return { objDatabase, objService, objInput };
}
function check(fnWork) { const objFixture = fixture(); try { fnWork(objFixture); } finally { objFixture.objDatabase.close(); } }
test('approved menu examples use database prices and integer cents', () => check(({ objInput, objService }) => {
  for (const [strSize, centsExpected] of [['small', 700], ['medium', 1100], ['large', 1500]]) {
    objInput.arrPizzas[0].strSize = strSize; assert.equal(objService.priceOrder(objInput).centsSubtotal, centsExpected);
  }
  objInput.arrDrinks = [{ strBeverage: 'coca-cola', strSize: 'medium', intQuantity: 1 }];
  assert.equal(objService.priceOrder(objInput).centsSubtotal, 1700);
}));
test('TN invoice half-up tax excludes optional after-tax tips', () => check(({ objInput, objService }) => {
  objInput.arrPizzas[0] = { strSize: 'small', strCrust: 'new-york', arrToppings: [], intQuantity: 2 };
  objInput.intTipPercent = 10;
  const objPrice = objService.priceOrder(objInput);
  assert.deepEqual([objPrice.centsSubtotal, objPrice.centsTax, objPrice.centsTip, objPrice.centsTotal], [1000, 98, 110, 1208]);
  objInput.arrPizzas[0].intQuantity = 1; objInput.intTipPercent = 0;
  assert.equal(objService.priceOrder(objInput).centsTax, 49);
}));
test('aggregate six-pizza and ten-drink limits include multiple lines', () => check(({ objInput, objService }) => {
  objInput.arrPizzas[0].intQuantity = 6;
  objInput.arrDrinks = [{ strBeverage: 'sprite', strSize: 'large', intQuantity: 10 }];
  assert.ok(objService.priceOrder(objInput));
  objInput.arrPizzas.push({ ...objInput.arrPizzas[0], intQuantity: 1 }); assert.throws(() => objService.priceOrder(objInput), /six/);
  objInput.arrPizzas.pop(); objInput.arrDrinks.push({ strBeverage: 'sprite', strSize: 'small', intQuantity: 1 });
  assert.throws(() => objService.priceOrder(objInput), /ten/);
}));
test('rejects forged prices, extra fields, invalid counts, duplicated/unknown toppings and crusts', () => check(({ objInput, objService }) => {
  for (const objBad of [{ ...objInput, centsTotal: 1 }, { ...objInput, intTipPercent: -1 }, { ...objInput, intTipPercent: .5 }, { ...objInput, arrPizzas: [] }]) assert.throws(() => objService.priceOrder(objBad));
  for (const intQuantity of [0, -1, .1, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => objService.priceOrder({ ...objInput, arrPizzas: [{ ...objInput.arrPizzas[0], intQuantity }] }));
  }
  for (const objPizza of [{ ...objInput.arrPizzas[0], strCrust: 'stuffed' }, { ...objInput.arrPizzas[0], arrToppings: ['pepperoni', 'pepperoni'] }, { ...objInput.arrPizzas[0], arrToppings: ['gold'] }]) assert.throws(() => objService.priceOrder({ ...objInput, arrPizzas: [objPizza] }));
}));
test('catalog/availability changes invalidate the fingerprint and current unavailable ingredients fail closed', () => check(({ objInput, objService, objDatabase }) => {
  objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='pepperoni'");
  assert.throws(() => objService.priceOrder(objInput), (objError) => objError.strCode === 'menu_changed' && objError.intStatus === 409);
  objInput.strCatalogFingerprint = objService.readCatalog().strFingerprint;
  assert.throws(() => objService.priceOrder(objInput), /unavailable/);
  objInput.arrPizzas[0].arrToppings = []; assert.ok(objService.priceOrder(objInput));
  objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='cheese'");
  objInput.strCatalogFingerprint = objService.readCatalog().strFingerprint;
  assert.throws(() => objService.priceOrder(objInput), /unavailable/);
}));
test('inactive sizes, crusts, beverages and drink sizes cannot be purchased', () => check(({ objInput, objService, objDatabase }) => {
  for (const [strTable, strCode] of [['pizza_sizes', 'large'], ['crust_options', 'regular'], ['beverages', 'sprite'], ['drink_sizes', 'small']]) {
    objDatabase.prepare(`UPDATE ${strTable} SET is_active=0 WHERE code=?`).run(strCode);
    objInput.arrDrinks = [{ strBeverage: 'sprite', strSize: 'small', intQuantity: 1 }];
    objInput.strCatalogFingerprint = objService.readCatalog().strFingerprint;
    assert.throws(() => objService.priceOrder(objInput), /unavailable/);
    objDatabase.prepare(`UPDATE ${strTable} SET is_active=1 WHERE code=?`).run(strCode);
  }
}));
test('read-only previews preserve records, reject overflow and observe current prices without seed resets', () => check(({ objInput, objService, objDatabase }) => {
  const intChanges = objDatabase.prepare('SELECT total_changes() AS intCount').get().intCount;
  objService.priceOrder(objInput);
  assert.equal(objDatabase.prepare('SELECT total_changes() AS intCount').get().intCount, intChanges);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=1234 WHERE code='large'");
  seedMenu(objDatabase); objInput.strCatalogFingerprint = objService.readCatalog().strFingerprint;
  assert.equal(objService.priceOrder(objInput).centsSubtotal, 1834);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=9007199254740991 WHERE code='large'");
  objInput.strCatalogFingerprint = objService.readCatalog().strFingerprint;
  assert.throws(() => objService.priceOrder(objInput), /large/);
}));
test('unpublished future catalogs stay private and missing baseline fails safely', () => check(({ objService, objDatabase }) => {
  objDatabase.exec("INSERT INTO catalog_versions(id,revision) VALUES ('private-draft',2)");
  assert.equal(objService.readCatalog().strCatalogVersionId, 'luigis:menu:v1');
  objDatabase.exec("UPDATE catalog_versions SET published_at='2026-10-21T00:00:00.000Z' WHERE id='private-draft'");
  assert.throws(() => objService.readCatalog(), /unavailable/);
}));
