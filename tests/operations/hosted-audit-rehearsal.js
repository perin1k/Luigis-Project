/** Exercises grant-loaded tracking through the actual auditor. TLS bypass is confined
 * to this disposable localhost certificate; hosted CLI never uses this flag. */
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
import {runHostedAudits} from '../../scripts/hosted-audits.js';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('node_modules/.cache/ms-playwright');
const {chromium,expect}=await import('@playwright/test');
const strTemp=mkdtempSync(join(tmpdir(),'luigis-audit-'));
let objBrowser;let objServer;let objFixture;
try {
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strTemp,'key.pem'),'-out',join(strTemp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 objServer=createServer({key:readFileSync(join(strTemp,'key.pem')),cert:readFileSync(join(strTemp,'cert.pem'))},(objRequest,objResponse)=>objFixture.objApp(objRequest,objResponse));
 await new Promise(fnDone=>objServer.listen(0,'127.0.0.1',fnDone));const strOrigin=`https://localhost:${objServer.address().port}`;
 objFixture=createOrdersFixture(strOrigin,{bCustomerCheckout:true});
 objBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=9239','--remote-debugging-address=127.0.0.1','--ignore-certificate-errors']});
 async function actor(){const objContext=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:true});return objContext.newPage();}
 const objCustomer=await actor();await objCustomer.goto(objFixture.arrTrackingPaths[0]);await expect(objCustomer.locator('#tracking-content')).toContainText('Received');
 const objResult=await runHostedAudits({objOwner:objCustomer,objCustomer,objReceipt:{strReference:'unused-audit-fixture'},fnActor:actor,strOrigin,arrPageLabels:['private-tracking']});
 console.log(JSON.stringify({strTask:'Local auditor tracking rehearsal',strFailureStage:objResult.strFailureStage,strFailurePhase:objResult.strFailurePhase,intResults:objResult.arrResults.length,bAccountDeleted:objResult.bTemporaryAccountDeleted}));
 assert.equal(objResult.strFailureStage,null);assert.equal(objResult.arrResults.length,2);assert.equal(objResult.bTemporaryAccountDeleted,true);assert.equal(objResult.bPassed,false,'Partial fixture is never whole-host acceptance');
 assert.equal(objFixture.objDatabase.prepare('SELECT count(*) AS n FROM customer_accounts').get().n,0);
}finally{await objBrowser?.close();if(objServer)await new Promise(fnDone=>objServer.close(fnDone));objFixture?.close();rmSync(strTemp,{recursive:true,force:true});}

