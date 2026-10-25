import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
import {PASSWORD} from '../fixtures/staff-app.js';
import {runHostedInt02} from '../../scripts/hosted-int02.js';

process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('node_modules/.cache/ms-playwright');
const {chromium}=await import('@playwright/test');
const strTemp=mkdtempSync(join(tmpdir(),'luigis-int02-'));
let objBrowser;
try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strTemp,'key.pem'),'-out',join(strTemp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  objBrowser=await chromium.launch({headless:true});
  for(const bInterrupt of [false,true]){
    let objFixture;
    const objServer=createServer({key:readFileSync(join(strTemp,'key.pem')),cert:readFileSync(join(strTemp,'cert.pem'))},(objRequest,objResponse)=>objFixture.objApp(objRequest,objResponse));
    await new Promise(fnDone=>objServer.listen(0,'127.0.0.1',fnDone));
    const strOrigin=`https://localhost:${objServer.address().port}`;
    objFixture=createOrdersFixture(strOrigin,{bCustomerCheckout:true});
    try{
      const objResult=await runHostedInt02({objBrowser,strOrigin,strUsername:'owner',strPassword:PASSWORD,
        fnOwnerCode:async()=>objFixture.code('owner'),fnAdminCode:async strSecret=>objFixture.code(strSecret),
        fnProgress:strStage=>{process.stdout.write(`Rehearsal ${bInterrupt?'interrupted':'success'}: ${strStage}\n`);if(bInterrupt&&strStage==='customer-order')throw new Error('Synthetic interruption');}});
      console.log(JSON.stringify(objResult));
      assert.equal(objResult.bAccountsCleaned,true);
      assert.equal(objResult.bPassed,!bInterrupt);
      if(bInterrupt)assert.equal(objResult.strFailureStage,'customer-order');
      const arrTemporary=objFixture.objDatabase.prepare("SELECT u.state FROM staff_users u JOIN staff_credentials c ON c.user_id=u.id WHERE c.username LIKE 'int02.%'").all();
      assert.equal(arrTemporary.length,2);assert.ok(arrTemporary.every(objRow=>objRow.state==='disabled'));
      assert.equal(objFixture.objDatabase.prepare("SELECT count(*) AS intCount FROM staff_users WHERE id IN ('owner','admin','employee') AND state='active'").get().intCount,3);
    }finally{await new Promise(fnDone=>objServer.close(fnDone));objFixture.close();}
  }
}finally{await objBrowser?.close();rmSync(strTemp,{recursive:true,force:true});}
