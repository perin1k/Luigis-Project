import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
import {PASSWORD} from '../fixtures/staff-app.js';
import {runHostedInt02} from '../../scripts/hosted-int02.js';
import {runHostedCompletion} from '../../scripts/hosted-completion.js';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('node_modules/.cache/ms-playwright');
const {chromium}=await import('@playwright/test');
const strTemp=mkdtempSync(join(tmpdir(),'luigis-completion-'));
let objBrowser;let objServer;let objFixture;
try {
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strTemp,'key.pem'),'-out',join(strTemp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 objBrowser=await chromium.launch({headless:true});
 objServer=createServer({key:readFileSync(join(strTemp,'key.pem')),cert:readFileSync(join(strTemp,'cert.pem'))},(objRequest,objResponse)=>objFixture.objApp(objRequest,objResponse));
 await new Promise(fnDone=>objServer.listen(0,'127.0.0.1',fnDone));
 const strOrigin=`https://localhost:${objServer.address().port}`;
 objFixture=createOrdersFixture(strOrigin,{bCustomerCheckout:true});let objCompletion;
 const objResult=await runHostedInt02({objBrowser,strOrigin,strUsername:'owner',strPassword:PASSWORD,
   fnOwnerCode:async()=>objFixture.code('owner'),fnAdminCode:async strSecret=>objFixture.code(strSecret),
   fnProgress:strStage=>console.log('Rehearsal: '+strStage),
   fnAdditionalAcceptance:async objInput=>{objCompletion=await runHostedCompletion(objInput);}});
 console.log(JSON.stringify({objResult,objCompletion}));
 assert.equal(objResult.bPassed,true);assert.equal(objCompletion.bPassed,true);assert.equal(objCompletion.bCleanupPassed,true);
 assert.equal(objFixture.objDatabase.prepare("SELECT count(*) AS n FROM customer_accounts").get().n,0);
 const arrStaff=objFixture.objDatabase.prepare("SELECT state FROM staff_users WHERE id NOT IN ('owner','admin','employee')").all();
 assert.equal(arrStaff.length,3);assert.ok(arrStaff.every(objRow=>objRow.state==='disabled'));
}finally{await objBrowser?.close();if(objServer)await new Promise(fnDone=>objServer.close(fnDone));objFixture?.close();rmSync(strTemp,{recursive:true,force:true});}
