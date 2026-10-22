import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
import { createSchedulingService } from '../../src/ordering/scheduling-service.js';
let objDatabase; let objApp; let dtNow;
function reset() {
  objDatabase?.close(); objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase); seedMenu(objDatabase);
  dtNow='2026-10-21T15:00:00.000Z';
  const objCatalogService=createCatalogService(objDatabase);
  const objSchedulingService=createSchedulingService(objDatabase,{fnNow:()=>dtNow});
  objApp=createApp({objCatalogService,objSchedulingService,objOrderService:createOrderService(objDatabase,objCatalogService,objSchedulingService)});
}
reset();
const objServer=createServer((objRequest,objResponse)=>{
  if(objRequest.url==='/__test/reset'){reset();return objResponse.end('reset');}
  if(objRequest.url==='/__test/expire'){dtNow='2026-10-21T15:31:00.000Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/count')return objResponse.end(JSON.stringify(objDatabase.prepare("SELECT count(*) AS intCount FROM capacity_holds WHERE state='active'").get()));
  return objApp(objRequest,objResponse);
});
objServer.listen(3007,'127.0.0.1');
for(const strSignal of ['SIGINT','SIGTERM'])process.once(strSignal,()=>objServer.close(()=>objDatabase.close()));
