import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createApp} from '../../src/app.js';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {createSyntheticVault} from '../../src/payments/synthetic-vault.js';
let objDatabase;let objApp;let bApprove;let dtNow;
function reset(){objDatabase?.close();objDatabase=openDatabase(':memory:');applyMigrations(objDatabase);seedMenu(objDatabase);bApprove=true;dtNow='2026-10-21T15:00:00.000Z';
  const objCatalogService=createCatalogService(objDatabase);const objSchedulingService=createSchedulingService(objDatabase,{fnNow:()=>dtNow});
  const objTrackingService=createTrackingService(objDatabase,undefined,{fnNow:()=>new Date(dtNow)});
  const objPaymentService=createDemoPaymentService(objDatabase,{objTrackingService,objCatalogService,objSchedulingService,fnProcess:()=>bApprove,objVault:createSyntheticVault({strActiveKeyId:'fixture',mapKeys:{fixture:randomBytes(32).toString('hex')}})});
  objApp=createApp({objTrackingService,objCatalogService,objSchedulingService,objPaymentService,objOrderService:createOrderService(objDatabase,objCatalogService,objSchedulingService)});
}
reset();const objServer=createServer((objRequest,objResponse)=>{
  if(objRequest.url==='/__test/reset'){reset();return objResponse.end('reset');}
  if(objRequest.url==='/__test/decline'){bApprove=false;return objResponse.end('decline');}
  if(objRequest.url==='/__test/near-close'){dtNow='2026-10-22T03:25:00.000Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/after-cutoff'){dtNow='2026-10-22T03:30:00.001Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/expire'){dtNow='2026-10-21T15:31:00.000Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/count')return objResponse.end(JSON.stringify({intPayments:objDatabase.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n,intConfirmed:objDatabase.prepare("SELECT count(*) AS n FROM orders WHERE fulfillment_status='Received'").get().n}));
  return objApp(objRequest,objResponse);
});objServer.listen(3008,'127.0.0.1');
for(const strSignal of ['SIGINT','SIGTERM'])process.once(strSignal,()=>objServer.close(()=>objDatabase.close()));
