import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
const objCatalogService = createCatalogService(objDatabase);
const objApp = createApp({ objCatalogService, objOrderService: createOrderService(objDatabase, objCatalogService) });
const objServer = createServer((objRequest, objResponse) => {
  if (objRequest.url === '/__test/count') return objResponse.end(JSON.stringify(objDatabase.prepare('SELECT count(*) AS intCount FROM orders').get()));
  if (objRequest.url === '/__test/reset') return objResponse.end('reset');
  return objApp(objRequest, objResponse);
});
objServer.listen(3006, '127.0.0.1');
for (const strSignal of ['SIGINT', 'SIGTERM']) process.once(strSignal, () => objServer.close(() => objDatabase.close()));
