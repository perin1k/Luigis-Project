import {createMenuService} from '../../src/staff/menu-service.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createAnalyticsService} from '../../src/staff/analytics-service.js';
import {createNotificationService} from '../../src/notifications/notification-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {runTransaction} from '../../src/data/database.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createApp} from '../../src/app.js';
import {createStaffOrdersService} from '../../src/staff/orders-service.js';
import {createStaffFixture} from './staff-app.js';
import {seedStaffOrders} from './staff-orders-data.js';
export function createOrdersFixture(strOrigin){
  let bRefundApproved=true;let arrOrders=[];let arrTrackingPaths=[];let objNotices;let fnFailPreviews;
  const objFixture=createStaffFixture(strOrigin,{fnCreateApp(objOptions,objDatabase,{fnNow}){
    // The authentication fixture clock begins at 13:00 Chicago plus 30 seconds.
    // Align order seed promises to the existing 20-minute grid without changing auth time.
    arrOrders=seedStaffOrders(objDatabase,{intCount:3,strName:'Synthetic Guest',bStableIds:true,fnNow:()=>new Date('2026-10-21T18:00:00.000Z')});
    objDatabase.prepare("INSERT INTO cancellation_requests (id,order_id,source,reason_code,requested_at) VALUES ('fixture-cancel',?,'customer','fixture','2026-10-21T18:00:00.000Z')").run(arrOrders[0].strOrderId);
    const objTrackingService=createTrackingService(objDatabase,objOptions.objAuthRuntime.objSessionService,{fnNow});arrTrackingPaths=runTransaction(objDatabase,()=>arrOrders.map((objOrder)=>objTrackingService.issueForPayment(objOrder.strOrderId,fnNow().toISOString())));
    objNotices=createNotificationService(objDatabase,objOptions.objAuthRuntime.objSessionService,{fnNow});
    fnFailPreviews=()=>createNotificationService(objDatabase,objOptions.objAuthRuntime.objSessionService,{fnNow,fnRender(){throw new Error('fixture render failure');}}).processPending();
    return createApp({...objOptions,objCatalogService:createCatalogService(objDatabase),objMenuService:createMenuService(objDatabase,objOptions.objAuthRuntime.objSessionService),objAnalyticsService:createAnalyticsService(objDatabase,objOptions.objAuthRuntime.objSessionService),objNotificationService:objNotices,objDemoRefundService:createDemoRefundService(objDatabase,objOptions.objAuthRuntime.objSessionService,{fnProcess:()=>bRefundApproved}),objTrackingService,objOrderExceptionService:createOrderExceptionService(objDatabase,objOptions.objAuthRuntime.objSessionService),objOrderProgressService:createOrderProgressService(objDatabase,objOptions.objAuthRuntime.objSessionService),objStaffOrdersService:createStaffOrdersService(objDatabase,objOptions.objAuthRuntime.objSessionService)});
  }});
  return {...objFixture,arrOrders,arrTrackingPaths,processPreviews(){objNotices.processPending();},failPreviews(){fnFailPreviews();},declineRefund(){bRefundApproved=false;},approveRefund(){bRefundApproved=true;}};
}
