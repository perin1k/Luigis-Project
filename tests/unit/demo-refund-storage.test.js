import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
test('migration 12 backfills pre-existing confirmed demo components without changing payment history and is repeatable',()=>{
  const objDatabase=openDatabase(':memory:');
  try{
    const objDirectory=new URL('../../src/data/migrations/',import.meta.url);
    const arrOld=readdirSync(objDirectory).filter((strFile)=>Number(strFile.slice(0,3))<=11).sort().map((strFile)=>({intVersion:Number(strFile.slice(0,3)),strName:strFile.slice(4,-4),strSql:readFileSync(new URL(strFile,objDirectory),'utf8')}));
    applyMigrations(objDatabase,arrOld);seedMenu(objDatabase);
    const objCatalog=createCatalogService(objDatabase);const objScheduling=createSchedulingService(objDatabase,{fnNow:()=> '2026-10-21T15:00:00.000Z'});const objOrders=createOrderService(objDatabase,objCatalog,objScheduling);const strId=randomUUID();
    objOrders.submitOrder({strRequestId:strId,strService:'carry-out',objContact:{strName:'Synthetic legacy guest',strPhone:'2025550100',strEmail:''},objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:20},objPickup:{strServiceDate:'2026-10-21',intRevision:1,strSelectionType:'scheduled',dtPromisedAt:'2026-10-21T16:00:00.000Z'}});
    const objQuote=objDatabase.prepare('SELECT * FROM order_quotes WHERE order_id=?').get(strId);
    objDatabase.prepare("UPDATE capacity_holds SET state='confirmed',confirmed_at='2026-10-21T15:00:00.000Z' WHERE booking_id IN (SELECT id FROM fulfillment_bookings WHERE order_id=?)").run(strId);
    objDatabase.prepare("INSERT INTO demo_payment_attempts (id,order_id,quote_id,adapter,method,state,amount_cents,currency,evidence_id,synthetic_last_four,created_at,paid_at) VALUES ('legacy-payment',?,?,'luigis-demo-v1','card','succeeded',?,'USD','legacy-demo-evidence','0000','2026-10-21T15:00:00.000Z','2026-10-21T15:00:00.000Z')").run(strId,objQuote.id,objQuote.total_cents);
    const strBefore=JSON.stringify(objDatabase.prepare('SELECT * FROM demo_payment_attempts').all());applyMigrations(objDatabase);applyMigrations(objDatabase);
    assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM demo_payment_attempts').all()),strBefore);
    const arrRows=objDatabase.prepare('SELECT * FROM demo_financial_allocations').all();assert.equal(arrRows.length,3);assert.equal(arrRows.reduce((centsTotal,objRow)=>centsTotal+objRow.signed_cents,0),objQuote.total_cents);assert.ok(arrRows.every((objRow)=>objRow.effective_at==='2026-10-21T15:00:00.000Z'&&objRow.refund_id===null));
    assert.throws(()=>objDatabase.exec('UPDATE demo_financial_allocations SET signed_cents=0'),/append-only/);assert.throws(()=>objDatabase.exec('DELETE FROM demo_financial_allocations'),/Preserve/);assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{objDatabase.close();}
});
