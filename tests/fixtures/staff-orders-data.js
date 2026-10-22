import {randomBytes,randomUUID} from 'node:crypto';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {createSyntheticVault} from '../../src/payments/synthetic-vault.js';
/** Real application writes with invented contacts in a disposable database. */
export function seedStaffOrders(objDatabase,{intCount=3,strName='Synthetic Guest',bStableIds=false,fnNow=()=>new Date('2026-10-21T15:00:00.000Z')}={}){
  seedMenu(objDatabase);const objCatalog=createCatalogService(objDatabase);const objScheduling=createSchedulingService(objDatabase,{fnNow:()=>fnNow().toISOString()});
  const objOrders=createOrderService(objDatabase,objCatalog,objScheduling);const objPayments=createDemoPaymentService(objDatabase,{objCatalogService:objCatalog,objSchedulingService:objScheduling,objVault:createSyntheticVault({strActiveKeyId:'fixture',mapKeys:{fixture:randomBytes(32).toString('hex')}})});
  const arrOrders=[];
  const numBase=Date.parse(fnNow().toISOString())+60*60000;
  // Anchor to the normal Chicago scheduled grid on this fixed fixture date.
  for(let intIndex=0;intIndex<intCount;intIndex++){
    const strOrderId=bStableIds?`00000000-0000-4000-8000-${String(intIndex+1).padStart(12,'0')}`:randomUUID();const objPickup={strServiceDate:'2026-10-21',intRevision:1,strSelectionType:'scheduled',dtPromisedAt:new Date(numBase+Math.floor(intIndex/6)*20*60000).toISOString()};
    const objSaved=objOrders.submitOrder({strRequestId:strOrderId,strService:intIndex%2?'dine-in':'carry-out',objContact:{strName:`${strName} ${intIndex+1}`,strPhone:'2025550100',strEmail:'unused@example.invalid'},
      objPricing:{strCatalogFingerprint:objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup});
    objPayments.pay({strOrderId,strRequestId:randomUUID(),strMethod:'card'});arrOrders.push({strOrderId,strReference:objSaved.strReference});
  }
  return arrOrders;
}
