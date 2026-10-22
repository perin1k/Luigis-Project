import { createServer } from 'node:http';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';
import { createCatalogService } from '../../src/ordering/catalog-service.js';
import { createOrderService } from '../../src/ordering/order-service.js';
import { createSchedulingService } from '../../src/ordering/scheduling-service.js';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
const arrStatusExamples = [
  { strLabel: 'Awaiting review', bInventoryIssue: true, strCancellationState: 'pending', strRefundState: 'none' },
  { strLabel: 'Approved', bInventoryIssue: true, strCancellationState: 'approved', strRefundState: 'none' },
  { strLabel: 'Denied', strCancellationState: 'denied', strRefundState: 'none' },
  { strLabel: 'Refund pending', strCancellationState: 'approved', strRefundState: 'pending' },
  { strLabel: 'Refund failed', strCancellationState: 'approved', strRefundState: 'failed' },
  { strLabel: 'Refund completed', strCancellationState: 'approved', strRefundState: 'succeeded', strProcessingMode: 'demo' },
  { strLabel: 'Unknown', strCancellationState: 'unrecognized', strRefundState: 'unrecognized' },
  { strLabel: 'Missing' },
  { strLabel: 'Unsupported keys', strCancellationState: '__proto__', strRefundState: 'toString' },
  { strLabel: 'Conflicting', strCancellationState: 'denied', strRefundState: 'succeeded', strProcessingMode: 'demo' },
  { strLabel: 'Unverified mode', strCancellationState: 'approved', strRefundState: 'succeeded' },
  { strLabel: 'Escaped detail', bInventoryIssue: true, strCancellationState: 'pending', strRefundState: 'none', strIssueDescription: '<img src=x onerror="window.bInjected=true">' },
];
const strStatusGallery = `<!doctype html><html lang="en"><head>
<%- include('../../src/views/partials/head', { bPricingPage: true }) %>
<meta name="robots" content="noindex"></head><body>
<%- include('../../src/views/partials/header') %>
<main id="main-content" class="container order-page" tabindex="-1"><h1>Scheduled order status examples</h1>
<p>Isolated test fixture. These examples are not actual orders or refunds.</p>
<div id="status-examples"><% for (const objExample of arrStatusExamples) { %>
<article aria-label="<%= objExample.strLabel %>"><%- include('../../src/views/partials/ordering/scheduled-order-status', { objScheduledStatus: objExample }) %></article>
<% } %></div></main><%- include('../../src/views/partials/footer') %></body></html>`;
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
  if (objRequest.url === '/__test/scheduled-status') {
    objResponse.setHeader('Cache-Control', 'no-store');
    objResponse.setHeader('Content-Type', 'text/html; charset=utf-8');
    try {
      return objResponse.end(ejs.render(strStatusGallery, { arrStatusExamples,
        strTitle: 'Scheduled order status | Luigi’s Pizza', strDescription: 'Isolated scheduling status examples.' },
        { filename: fileURLToPath(import.meta.url) }));
    } catch { objResponse.statusCode = 500; return objResponse.end('Status fixture could not be rendered.'); }
  }
  if(objRequest.url==='/__test/reset'){reset();return objResponse.end('reset');}
  if(objRequest.url==='/__test/expire'){dtNow='2026-10-21T15:31:00.000Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/after-cutoff'){dtNow='2026-10-22T03:31:00.000Z';return objResponse.end('advanced');}
  if(objRequest.url==='/__test/count')return objResponse.end(JSON.stringify(objDatabase.prepare("SELECT count(*) AS intCount FROM capacity_holds WHERE state='active'").get()));
  return objApp(objRequest,objResponse);
});
objServer.listen(3007,'127.0.0.1');
for(const strSignal of ['SIGINT','SIGTERM'])process.once(strSignal,()=>objServer.close(()=>objDatabase.close()));
