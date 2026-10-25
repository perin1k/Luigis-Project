import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {createServer as createTcpServer} from 'node:net';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir,userInfo} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
import {PASSWORD} from '../fixtures/staff-app.js';
import {renderNginxConfig} from '../../scripts/nginx-config.js';
import {runHostedInt02} from '../../scripts/hosted-int02.js';

if(process.platform!=='linux')throw new Error('Actual Linux Nginx rehearsal required.');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('node_modules/.cache/ms-playwright');
const {chromium,request,expect}=await import('@playwright/test');
const strDirectory=mkdtempSync(join(tmpdir(),'luigis-nginx-'));
let objFixture;let objNginx;let objBrowser;let objBackend;let objRequest;
try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key.pem'),'-out',join(strDirectory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const objReserve=createTcpServer();await new Promise(fnDone=>objReserve.listen(0,'127.0.0.1',fnDone));
  const intPublicPort=objReserve.address().port;await new Promise(fnDone=>objReserve.close(fnDone));
  const strOrigin=`https://localhost:${intPublicPort}`;const strSecret=randomBytes(32).toString('hex');
  objFixture=createOrdersFixture(strOrigin,{bCustomerCheckout:true,objProxyConfig:{strOrigin,strSecret}});
  objBackend=createServer({key:readFileSync(join(strDirectory,'key.pem')),cert:readFileSync(join(strDirectory,'cert.pem'))},objFixture.objApp);
  await new Promise(fnDone=>objBackend.listen(0,'127.0.0.1',fnDone));const intBackendPort=objBackend.address().port;
  const strConfig=join(strDirectory,'nginx.conf');
  writeFileSync(strConfig,renderNginxConfig({strHostname:'localhost',intPublicPort,intBackendPort,strSecret,bLoopbackOnly:true,
    strCertificatePath:join(strDirectory,'cert.pem'),strKeyPath:join(strDirectory,'key.pem'),strTrustedCaPath:join(strDirectory,'cert.pem'),
    strPidPath:join(strDirectory,'nginx.pid'),strLogPath:join(strDirectory,'access.log'),strWorkerUser:userInfo().username}),{mode:0o600});
  execFileSync('nginx',['-t','-q','-p',strDirectory+'/', '-c',strConfig],{stdio:'ignore'});
  objNginx=spawn('nginx',['-p',strDirectory+'/', '-c',strConfig,'-g','daemon off;'],{stdio:'ignore'});
  objRequest=await request.newContext({ignoreHTTPSErrors:true});
  let bReady=false;
  for(let intAttempt=0;intAttempt<30;intAttempt++){
    // This fixture does not run production health workers. Probe an actual account
    // route rather than interpreting its intentionally unavailable readiness check.
    try{const objResult=await objRequest.get(strOrigin+'/account/register');if(objResult.status()===200){bReady=true;break;}}catch{}
    await new Promise(fnDone=>setTimeout(fnDone,100));
  }
  assert.equal(bReady,true,'Nginx readiness');
  const objSpoof=await objRequest.get(strOrigin+'/account/register',{headers:{'X-Forwarded-For':'1.2.3.4, 9.8.7.6','X-Forwarded-Proto':'http','X-Forwarded-Host':'outside.example','X-Luigis-Proxy-Token':'0'.repeat(64)}});
  assert.equal(objSpoof.status(),200,'Edge overwrites caller forwarding/proof');
  const objDirect=await objRequest.get(`https://localhost:${intBackendPort}/health/ready`,{headers:{Host:`localhost:${intPublicPort}`}});
  assert.equal(objDirect.status(),403,'Unidentified direct backend access');
  objBrowser=await chromium.launch({headless:true});
  const objContext=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:true});
  try{
    const objPage=await objContext.newPage();await objPage.goto('/account/register');
    await objPage.getByLabel('Username',{exact:true}).fill('proxy.customer');await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);
    await objPage.getByRole('button',{name:'Create customer account',exact:true}).click();
    await expect(objPage.getByRole('heading',{name:'Your customer account',exact:true})).toBeVisible();
    const objCookie=(await objContext.cookies()).find(objItem=>objItem.name==='__Host-luigis-customer');
    assert.equal(objCookie.secure,true);assert.equal(objCookie.httpOnly,true);assert.equal(objCookie.sameSite,'Strict');
    await objPage.getByLabel('Current password to confirm deletion').fill(PASSWORD);
    await objPage.getByRole('button',{name:'Delete account permanently'}).click();await expect(objPage.getByRole('status')).toContainText('deleted');
  }finally{await objContext.close();}
  const objResult=await runHostedInt02({objBrowser,strOrigin,strUsername:'owner',strPassword:PASSWORD,
    fnOwnerCode:async()=>objFixture.code('owner'),fnAdminCode:async strSecret=>objFixture.code(strSecret)});
  assert.equal(objResult.bPassed,true,'Full authenticated cross-role Nginx journey');
  const strLog=readFileSync(join(strDirectory,'access.log'),'utf8');
  for(const strPrivate of [strSecret,PASSWORD,'proxy.customer','/account','/api/','127.0.0.1'])assert.ok(!strLog.includes(strPrivate),'Status-only proxy log');
  console.log(JSON.stringify({strTask:'OPS-08',bActualNginx:true,bVerifiedUpstreamTls:true,bOverwriteSpoofing:true,bBackendDenied:true,bCustomerAccount:true,bCrossRoleJourney:true,bPrivateLogs:true}));
}finally{
  await objBrowser?.close();await objRequest?.dispose();
  if(objNginx&&objNginx.exitCode===null){objNginx.kill('SIGQUIT');await new Promise(fnDone=>objNginx.once('exit',fnDone));}
  if(objBackend)await new Promise(fnDone=>objBackend.close(fnDone));objFixture?.close();
  rmSync(strDirectory,{recursive:true,force:true});
}
