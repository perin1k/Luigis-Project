import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createApp} from '../../src/app.js';
import {createStaffOrdersService} from '../../src/staff/orders-service.js';
import {createStaffFixture} from './staff-app.js';
import {seedStaffOrders} from './staff-orders-data.js';
export function createOrdersFixture(strOrigin){
  let arrOrders=[];
  const objFixture=createStaffFixture(strOrigin,{fnCreateApp(objOptions,objDatabase,{fnNow}){
    // The authentication fixture clock begins at 13:00 Chicago plus 30 seconds.
    // Align order seed promises to the existing 20-minute grid without changing auth time.
    arrOrders=seedStaffOrders(objDatabase,{intCount:3,strName:'Synthetic Guest',bStableIds:true,fnNow:()=>new Date('2026-10-21T18:00:00.000Z')});
    objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code) VALUES ('fixture-cancel',?,'customer','fixture')").run(arrOrders[0].strOrderId);
    return createApp({...objOptions,objOrderProgressService:createOrderProgressService(objDatabase,objOptions.objAuthRuntime.objSessionService),objStaffOrdersService:createStaffOrdersService(objDatabase,objOptions.objAuthRuntime.objSessionService)});
  }});
  return {...objFixture,arrOrders};
}
