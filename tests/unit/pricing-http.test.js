import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
async function fixture(fnWork) {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
  const objServer = createServer(createApp({ objCatalogService: createCatalogService(objDatabase) }));
  await new Promise((fnResolve) => objServer.listen(0,'127.0.0.1',fnResolve));
  const strOrigin = `http://127.0.0.1:${objServer.address().port}`;
  try { await fnWork({ objDatabase, strOrigin }); }
  finally { await new Promise((fnResolve) => objServer.close(fnResolve)); objDatabase.close(); }
}
test('mounted public pricing uses persisted catalog without enabling staff access or accepting prices', async () => fixture(async ({ strOrigin, objDatabase }) => {
  const objCatalogResponse = await fetch(`${strOrigin}/api/pricing/catalog`);
  assert.equal(objCatalogResponse.status,200); assert.equal(objCatalogResponse.headers.get('cache-control'),'no-store');
  const objCatalog = await objCatalogResponse.json();
  const objInput = { strCatalogFingerprint: objCatalog.strFingerprint, arrPizzas: [{ strSize:'large',strCrust:'regular',arrToppings:['pepperoni','sausage'],intQuantity:1 }], arrDrinks:[], intTipPercent:0 };
  const fnPost = (objBody, objHeaders = {}) => fetch(`${strOrigin}/api/pricing/preview`, {method:'POST',headers:{'Content-Type':'application/json',...objHeaders},body:JSON.stringify(objBody)});
  assert.equal((await fnPost({...objInput,centsSubtotal:1})).status,422);
  assert.equal((await (await fnPost(objInput)).json()).centsTotal,1646);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=1000 WHERE code='large'");
  const objChanged = await fnPost(objInput); assert.equal(objChanged.status,409);
  assert.ok((await objChanged.json()).objCatalog.strFingerprint);
  assert.equal((await fetch(`${strOrigin}/auth/session`)).status,404);
  assert.equal(objDatabase.prepare('SELECT count(*) AS intCount FROM orders').get().intCount,0);
  const strHtml = await (await fetch(`${strOrigin}/order`)).text();
  assert.match(strHtml,/data-catalog=/); assert.match(strHtml,/Optional tip percentage/); assert.doesNotMatch(strHtml,/password_hash|PRIVATE_/);
}));
test('pricing transport rejects oversized, malformed, compressed and cross-site JSON safely', async () => fixture(async ({ strOrigin }) => {
  async function post(strBody, objHeaders = {}) { return fetch(`${strOrigin}/api/pricing/preview`, {method:'POST',headers:{'Content-Type':'application/json',...objHeaders},body:strBody}); }
  assert.equal((await post('{')).status,400);
  assert.equal((await post('x'.repeat(9000))).status,413);
  assert.equal((await post('{}', {'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('{}', {'Content-Encoding':'gzip'})).status,415);
  assert.equal((await post('{}', {'Sec-Fetch-Site':'cross-site'})).status,415);
  const objResponse = await post('{}'); assert.equal(objResponse.status,422);
  assert.doesNotMatch(await objResponse.text(),/SQLITE|SELECT|stack|password_hash/);
}));
