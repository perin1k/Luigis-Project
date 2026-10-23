import {createWorkerMonitor} from './operations/worker-monitor.js';
import {createMenuService} from './staff/menu-service.js';
import {createAnalyticsService} from './staff/analytics-service.js';
import {createRetentionService} from './data/retention-service.js';
import {createNotificationService} from './notifications/notification-service.js';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import {createDemoRefundService} from './payments/demo-refund-service.js';
import {createTrackingService} from './tracking/tracking-service.js';
import { createApp } from './app.js';
import { createSchedulingService } from './ordering/scheduling-service.js';
import { createOrderService } from './ordering/order-service.js';
import { createCatalogService } from './ordering/catalog-service.js';
import { openDatabase } from './data/database.js';
import { applyMigrations } from './data/migrations.js';
import { createDemoPaymentService } from './payments/demo-payment-service.js';
import { loadPaymentVault } from './payments/payment-config.js';
import {createOrderExceptionService} from './staff/order-exception-service.js';
import { createOrderProgressService } from './staff/order-progress-service.js';
import { createStaffOrdersService } from './staff/orders-service.js';
import { createAuthRuntime } from './auth/auth-runtime.js';

const intPort = Number(process.env.PORT ?? 3000);
const strHost = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(intPort) || intPort < 1 || intPort > 65535) throw new Error('Invalid PORT.');
const arrAuthSettings = ['AUTH_ORIGIN', 'TLS_KEY_PATH', 'TLS_CERT_PATH', 'DATABASE_PATH', 'MFA_ENCRYPTION_KEY_HEX'];
const bAuthEnabled = arrAuthSettings.filter((strName) => strName !== 'DATABASE_PATH').some((strName) => process.env[strName] !== undefined);
let objDatabase;
let objRuntime;
let objServer;
let bClosed = false;
let intNotificationTimer;
let intRetentionTimer;
function application(objAuthRuntime) {
  const objRetentionService=createRetentionService(objDatabase);
  const objRetentionMonitor=createWorkerMonitor('retention',()=>objRetentionService.cleanup());
  const fnCleanup=()=>objRetentionMonitor.run();
  fnCleanup();intRetentionTimer=setInterval(fnCleanup,60000);intRetentionTimer.unref();
  const objCatalogService = createCatalogService(objDatabase);
  const objSchedulingService = createSchedulingService(objDatabase);
  const objTrackingService=createTrackingService(objDatabase,objAuthRuntime?.objSessionService);
  const objVault=loadPaymentVault(process.env.DEMO_PAYMENT_KEYS_PATH);
  const objPaymentService = createDemoPaymentService(objDatabase, { objTrackingService, objVault, objCatalogService, objSchedulingService });
  const objNotificationService=createNotificationService(objDatabase,objAuthRuntime?.objSessionService);
  const objPreviewMonitor=createWorkerMonitor('previews',()=>objNotificationService.processPending());
  const fnProcessPreviews=()=>objPreviewMonitor.run();
  fnProcessPreviews();intNotificationTimer=setInterval(fnProcessPreviews,1000);intNotificationTimer.unref();
  return createApp({ fnReadiness:()=>Boolean(objAuthRuntime&&objVault&&objRetentionMonitor.isHealthy()&&objPreviewMonitor.isHealthy()&&objCatalogService.readCatalog().strFingerprint), objMenuService:objAuthRuntime?createMenuService(objDatabase,objAuthRuntime.objSessionService):undefined, objAnalyticsService:objAuthRuntime?createAnalyticsService(objDatabase,objAuthRuntime.objSessionService):undefined, objNotificationService:objAuthRuntime?objNotificationService:undefined, objDemoRefundService:objAuthRuntime?createDemoRefundService(objDatabase,objAuthRuntime.objSessionService):undefined, objOrderExceptionService:objAuthRuntime?createOrderExceptionService(objDatabase,objAuthRuntime.objSessionService):undefined, objTrackingService, objAuthRuntime, objCatalogService, objSchedulingService, objPaymentService,
    objOrderProgressService: objAuthRuntime ? createOrderProgressService(objDatabase, objAuthRuntime.objSessionService) : undefined,
    objStaffOrdersService: objAuthRuntime ? createStaffOrdersService(objDatabase, objAuthRuntime.objSessionService) : undefined,
    objOrderService: createOrderService(objDatabase, objCatalogService, objSchedulingService) });
}
function closeResources() {
  if (bClosed) return;
  bClosed = true; clearInterval(intRetentionTimer); clearInterval(intNotificationTimer); objRuntime?.destroy(); objDatabase?.close();
}
try {
  if (bAuthEnabled) {
    if (!arrAuthSettings.every((strName) => process.env[strName])) throw new Error('Complete HTTPS authentication configuration is required.');
    const objOrigin = new URL(process.env.AUTH_ORIGIN);
    if (objOrigin.protocol !== 'https:' || objOrigin.origin !== process.env.AUTH_ORIGIN
      || Number(objOrigin.port || 443) !== intPort) throw new Error('AUTH_ORIGIN must match the HTTPS listening port.');
    if (!existsSync(process.env.DATABASE_PATH)) throw new Error('An existing database is required.');
    const objTls = { key: readFileSync(process.env.TLS_KEY_PATH), cert: readFileSync(process.env.TLS_CERT_PATH), minVersion: 'TLSv1.2' };
    objDatabase = openDatabase(process.env.DATABASE_PATH);
    applyMigrations(objDatabase);
    objRuntime = createAuthRuntime(objDatabase, { strOrigin: process.env.AUTH_ORIGIN,
      strEncryptionKeyHex: process.env.MFA_ENCRYPTION_KEY_HEX });
    objServer = createHttpsServer(objTls, application(objRuntime));
  } else if (process.env.DATABASE_PATH !== undefined) {
    if (!process.env.DATABASE_PATH || !existsSync(process.env.DATABASE_PATH)) throw new Error('Existing catalog database required.');
    objDatabase = openDatabase(process.env.DATABASE_PATH); applyMigrations(objDatabase);
    objServer = createHttpServer(application());
  } else {
    // Preserve the existing view-only HTTP fixture and availability injection seam.
    const { default: objApp } = await import('./app.js');
    objServer = createHttpServer(objApp);
  }
  objServer.listen(intPort, strHost, () => console.log(`Luigi’s Pizza: ${bAuthEnabled ? 'https' : 'http'}://${strHost}:${intPort}`));
  objServer.on('close', closeResources);
  objServer.on('error', () => { console.error('Unable to start the configured server.'); closeResources(); process.exitCode = 1; });
  for (const strSignal of ['SIGINT', 'SIGTERM']) process.once(strSignal, () => objServer.close());
} catch {
  closeResources();
  console.error('Unable to start: check the private database, key and HTTPS configuration.');
  process.exitCode = 1;
}
