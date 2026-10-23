import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOrdersFixture} from './staff-orders-app.js';
const strDirectory=mkdtempSync(join(tmpdir(),'luigis-queue-https-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key.pem'),'-out',join(strDirectory,'cert.pem'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
let objFixture=createOrdersFixture('https://localhost:3444');
const objServer=createServer({key:readFileSync(join(strDirectory,'key.pem')),cert:readFileSync(join(strDirectory,'cert.pem'))},(objRequest,objResponse)=>{
  if(objRequest.url==='/__test/reset'){objFixture.close();objFixture=createOrdersFixture('https://localhost:3444');return objResponse.end('reset');}
  if(objRequest.url==='/__test/expire'){objFixture.expire();return objResponse.end('expired');}
  if(objRequest.url==='/__test/tracking')return objResponse.setHeader('Content-Type','application/json').end(JSON.stringify(objFixture.arrTrackingPaths));
  if(objRequest.url==='/__test/refund-decline'){objFixture.declineRefund();return objResponse.end('decline');}
  if(objRequest.url==='/__test/refund-approve'){objFixture.approveRefund();return objResponse.end('approve');}
  if(objRequest.url==='/__test/preview-failure'){objFixture.failPreviews();return objResponse.end('failed');}
  if(objRequest.url==='/__test/preview-process'){objFixture.processPreviews();return objResponse.end('processed');}
  if(objRequest.url.startsWith('/__test/code')){const objUrl=new URL(objRequest.url,'https://localhost:3444');if(objUrl.pathname==='/__test/code')return objResponse.end(objFixture.code(objUrl.searchParams.get('secret')));}
  return objFixture.objApp(objRequest,objResponse);
});objServer.listen(3444,'127.0.0.1');
for(const strSignal of ['SIGINT','SIGTERM'])process.once(strSignal,()=>objServer.close(()=>{objFixture.close();rmSync(strDirectory,{recursive:true,force:true});}));
