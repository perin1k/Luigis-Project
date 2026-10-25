import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';

async function fixture(fnWork) {
  const objFixture=createOrdersFixture('https://localhost:3444');
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-sec-'));let objServer;
  try {
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key'),'-out',join(strDirectory,'cert'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
    objServer=createServer({key:readFileSync(join(strDirectory,'key')),cert:readFileSync(join(strDirectory,'cert'))},objFixture.objApp);
    await new Promise(fnResolve=>objServer.listen(0,'127.0.0.1',fnResolve));
    function session(strUser) {
      const strToken=createHash('sha256').update(strUser).digest('hex');const dtNow='2026-10-21T18:00:30.000Z';
      objFixture.objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)')
        .run(strUser+'-sec',strUser,createHash('sha256').update(strToken).digest('hex'),dtNow,dtNow,strUser==='employee'?null:dtNow,'2026-10-22T02:00:30.000Z');
      return `__Host-luigis-session=${strToken}`;
    }
    function send(strPath,{strCookie='',strMethod='GET',objBody,strRawBody,objHeaders={}}={}) {
      const strBody=strRawBody??(objBody===undefined?undefined:JSON.stringify(objBody));
      return new Promise((fnResolve,fnReject)=>{
        const objRequest=request({hostname:'127.0.0.1',port:objServer.address().port,path:strPath,method:strMethod,rejectUnauthorized:false,
          headers:{Host:'localhost:3444',Cookie:strCookie,...(strBody===undefined?{}:{Origin:'https://localhost:3444','Content-Type':'application/json'}),...objHeaders}},objResponse=>{
          let strText='';objResponse.setEncoding('utf8');objResponse.on('data',strChunk=>{strText+=strChunk;});objResponse.on('end',()=>fnResolve({intStatus:objResponse.statusCode,objHeaders:objResponse.headers,strText}));
        });objRequest.on('error',fnReject);objRequest.end(strBody);
      });
    }
    await fnWork({...objFixture,send,session});
  } finally {if(objServer)await new Promise(fnResolve=>objServer.close(fnResolve));objFixture.close();rmSync(strDirectory,{recursive:true,force:true});}
}

test('configured HTTPS privacy workflow denies forged authority, enforces CSRF/body bounds, escapes contacts and clears revoked access',async()=>fixture(async({send,session,arrOrders,objDatabase})=>{
  const strReference=arrOrders[1].strReference;const strPage=`/staff/privacy/${strReference}`;const strApi=`/api/staff/privacy/${strReference}`;
  const strEmployee=session('employee');const strAdmin=session('admin');const strOwner=session('owner');
  for(const strCookie of ['',strEmployee,'__Host-luigis-session='+'f'.repeat(64)]) {
    assert.equal((await send(strPage,{strCookie})).intStatus,403);
    assert.equal((await send(strApi+'/csrf',{strCookie})).intStatus,403);
    for(const strAction of ['correct','copy'])assert.equal((await send(strApi+'/'+strAction,{strCookie,strMethod:'POST',objBody:{bReviewed:true,strRole:'owner'}})).intStatus,403);
  }
  for(const objHeaders of [{Host:'evil.invalid'},{Origin:'https://evil.invalid'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await send(strPage,{strCookie:strAdmin,objHeaders})).intStatus,403);
  const objPage=await send(strPage,{strCookie:strAdmin});assert.equal(objPage.intStatus,200);assert.equal(objPage.objHeaders['cache-control'],'no-store');assert.equal(objPage.objHeaders['referrer-policy'],'no-referrer');
  assert.equal((await send(strPage,{strCookie:strOwner})).intStatus,200);
  const objCsrf=await send(strApi+'/csrf',{strCookie:strAdmin});assert.equal(objCsrf.intStatus,200);
  const strCookie=strAdmin+'; '+objCsrf.objHeaders['set-cookie'][0].split(';')[0];
  const objHeaders={'X-CSRF-Token':JSON.parse(objCsrf.strText).strCsrfToken};
  const intRevision=objDatabase.prepare('SELECT revision FROM orders WHERE public_reference=?').get(strReference).revision;
  const objBody={intRevision,bReviewed:true,objContact:{strName:'<svg onload=alert(1)> Synthetic',strPhone:'2025550199',strEmail:'synthetic@example.invalid'}};
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody})).intStatus,403);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody,objHeaders:{...objHeaders,Origin:'https://evil.invalid'}})).intStatus,403);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',strRawBody:'x'.repeat(1100),objHeaders})).intStatus,413);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',strRawBody:'{private broken',objHeaders})).intStatus,400);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody,objHeaders:{...objHeaders,'Content-Encoding':'gzip'}})).intStatus,415);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody:{...objBody,strRole:'owner'},objHeaders})).intStatus,400);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody,objHeaders})).intStatus,200);
  assert.equal((await send(strApi+'/correct',{strCookie,strMethod:'POST',objBody,objHeaders})).intStatus,409);
  const strHtml=(await send(strPage,{strCookie})).strText;assert.match(strHtml,/&lt;svg/);assert.doesNotMatch(strHtml,/<svg onload=/);
  const objCopy=await send(strApi+'/copy',{strCookie,strMethod:'POST',objBody:{intRevision:intRevision+1,bReviewed:true},objHeaders});assert.equal(objCopy.intStatus,200);
  assert.doesNotMatch(objCopy.strText,/ciphertext|nonce|token_digest|password_hash|strTrackingPath/);
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM privacy_actions').get().n,2);
  objDatabase.prepare("UPDATE staff_users SET state='disabled',disabled_at='2026-10-21T18:00:30.000Z' WHERE id='admin'").run();
  assert.equal((await send(strApi+'/copy',{strCookie,strMethod:'POST',objBody:{intRevision:intRevision+1,bReviewed:true},objHeaders})).intStatus,403);
}));

test('configured HTTPS cross-route review rejects forged writes and isolates guest capabilities from staff/source/audit access',async()=>fixture(async({send,session,arrOrders,arrTrackingPaths,objDatabase})=>{
  const strReference=arrOrders[1].strReference;const strEmployee=session('employee');
  const intEvents=objDatabase.prepare('SELECT count(*) AS n FROM order_events').get().n;
  const arrWrites=[['/auth/staff/update',{strRole:'owner'}],['/api/staff/menu/availability',{}],['/api/staff/menu/prices',{}],['/api/staff/menu/hours',{}],
    ...['progress','exception','refund','tracking-replacement','notifications/retry'].map(strAction=>[`/api/staff/orders/${strReference}/${strAction}`,{}]),
    [`/api/staff/privacy/${strReference}/correct`,{}],[`/api/staff/privacy/${strReference}/copy`,{}]];
  for(const [strPath,objBody] of arrWrites)for(const objHeaders of [{},{Origin:'https://evil.invalid'},{'Sec-Fetch-Site':'cross-site'}]) {
    const objResult=await send(strPath,{strCookie:strEmployee,strMethod:'POST',objBody,objHeaders});
    assert.equal(objResult.intStatus,403,strPath);assert.equal(objResult.objHeaders['cache-control'],'no-store',strPath);
    assert.doesNotMatch(objResult.strText,/202555|Synthetic Guest|ciphertext|password_hash/,strPath);
  }
  const strGuest=arrTrackingPaths[1].split('#')[1];
  for(const objBody of [{strToken:strGuest,strReference:arrOrders[0].strReference},{strToken:arrOrders[0].strReference},{strToken:"' OR 1=1 --"}])assert.equal((await send('/api/tracking',{strMethod:'POST',objBody})).intStatus,404);
  const objGuest=await send('/api/tracking',{strMethod:'POST',objBody:{strToken:strGuest}});assert.equal(objGuest.intStatus,200);assert.equal(JSON.parse(objGuest.strText).strReference,strReference);assert.doesNotMatch(objGuest.strText,/202555|Synthetic Guest|ciphertext|password/);
  assert.equal((await send('/api/staff/orders',{strCookie:`__Host-luigis-session=${strGuest}`})).intStatus,401);
  for(const strPath of ['/__test/code','/__test/reset','/api/audit','/api/staff/audit','/src/server.js','/.env','/.git/config','/data/luigis.sqlite','/src/data/migrations/015-privacy-actions.sql']) {
    const objResult=await send(strPath,{strCookie:strEmployee});assert.equal(objResult.intStatus,404,strPath);assert.doesNotMatch(objResult.strText,/CREATE TABLE|PRIVATE KEY|password_hash|202555/,strPath);
  }
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM order_events').get().n,intEvents);
}));
