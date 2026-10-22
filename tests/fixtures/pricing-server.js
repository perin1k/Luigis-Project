import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
const objApp = createApp({ objCatalogService: createCatalogService(objDatabase) });
// Deterministic controls belong only to this disposable test server.
const objServer = createServer((objRequest, objResponse) => {
  if (objRequest.url === '/__test/reset') {
    objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=CASE code WHEN 'small' THEN 500 WHEN 'medium' THEN 700 ELSE 900 END; UPDATE ingredients SET is_available=1");
    return objResponse.end('reset');
  }
  if (objRequest.url === '/__test/price') { objDatabase.exec("UPDATE pizza_sizes SET base_price_cents=base_price_cents+100 WHERE code='large'"); return objResponse.end('changed'); }
  if (objRequest.url === '/__test/topping') { objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='pepperoni'"); return objResponse.end('changed'); }
  if (objRequest.url === '/__test/unavailable') { objDatabase.exec("UPDATE ingredients SET is_available=0 WHERE code='cheese'"); return objResponse.end('changed'); }
  return objApp(objRequest, objResponse);
});
objServer.listen(3004, '127.0.0.1');
for (const strSignal of ['SIGINT', 'SIGTERM']) process.once(strSignal, () => objServer.close(() => objDatabase.close()));
