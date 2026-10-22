import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as httpsServer,request} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
function get(intPort,strPath,objHeaders={},objBody){return new Promise((fnResolve,fnReject)=>{
  const objRequest=request({hostname:'127.0.0.1',port:intPort,path:strPath,method:objBody?'POST':'GET',rejectUnauthorized:false,headers:{Host:'localhost:3444',...objHeaders}},(objResponse)=>{let strBody='';objResponse.setEncoding('utf8');objResponse.on('data',(strChunk)=>{strBody+=strChunk;});objResponse.on('end',()=>fnResolve({intStatus:objResponse.statusCode,objHeaders:objResponse.headers,strBody}));});objRequest.on('error',fnReject);objRequest.end(objBody?JSON.stringify(objBody):undefined);
});}
test('HTTPS queue endpoints require actual staff cookies, pin origin, escape names and exclude sensitive fields',async()=>{
  const objFixture=createOrdersFixture('https://localhost:3444');const strDirectory=mkdtempSync(join(tmpdir(),'luigis-orders-http-'));let objServer;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key'),'-out',join(strDirectory,'cert'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
    objServer=httpsServer({key:readFileSync(join(strDirectory,'key')),cert:readFileSync(join(strDirectory,'cert'))},objFixture.objApp);await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));const intPort=objServer.address().port;
    assert.equal((await get(intPort,'/api/staff/orders')).intStatus,401);assert.equal((await get(intPort,'/staff/orders')).intStatus,303);
    assert.equal((await get(intPort,'/api/staff/orders',{Host:'other.invalid'})).intStatus,403);assert.equal((await get(intPort,'/api/staff/orders',{Origin:'https://other.invalid'})).intStatus,403);
    assert.equal((await get(intPort,'/api/staff/orders',{'Sec-Fetch-Site':'cross-site'})).intStatus,403);
    const strToken='5'.repeat(64);objFixture.objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,expires_at) VALUES (?,?,?,?,?,?)').run('http-fixture','employee',createHash('sha256').update(strToken).digest('hex'),'2026-10-21T18:00:30.000Z','2026-10-21T18:00:30.000Z','2026-10-22T02:00:30.000Z');
    const objHeaders={Cookie:`__Host-luigis-session=${strToken}`};const objQueue=await get(intPort,'/api/staff/orders',objHeaders);assert.equal(objQueue.intStatus,200);assert.equal(objQueue.objHeaders['cache-control'],'no-store');assert.match(objQueue.objHeaders['x-robots-tag'],/noindex/);assert.doesNotMatch(objQueue.strBody,/202555|unused@example|password|ciphertext|nonce_hex|cents|strRole/);
    objFixture.objDatabase.prepare('UPDATE order_contacts SET customer_name=? WHERE order_id=?').run('<img src=x onerror=alert(1)>',objFixture.arrOrders[0].strOrderId);
    const objHtml=await get(intPort,'/staff/orders',objHeaders);assert.equal(objHtml.intStatus,200);assert.match(objHtml.strBody,/&lt;img/);assert.doesNotMatch(objHtml.strBody,/<img src=x/);
    const objDetail=await get(intPort,`/api/staff/orders/${objFixture.arrOrders[0].strReference}`,objHeaders);assert.equal(objDetail.intStatus,200);assert.match(objDetail.strBody,/2025550100/);assert.doesNotMatch(objDetail.strBody,/unused@example|cents|ciphertext/);
    const strReference=objFixture.arrOrders[1].strReference;const strProgress=`/api/staff/orders/${strReference}/progress`;
    const objCurrent=JSON.parse((await get(intPort,`/api/staff/orders/${strReference}`,objHeaders)).strBody);
    const objBody={intRevision:objCurrent.intRevision,strStatus:'Preparing'};
    assert.equal((await get(intPort,strProgress,{...objHeaders,Origin:'https://localhost:3444','Content-Type':'application/json'},objBody)).intStatus,403);
    const objCsrf=await get(intPort,'/api/staff/orders/csrf',objHeaders);
    const strCsrfCookie=objCsrf.objHeaders['set-cookie'][0].split(';')[0];
    const objWriteHeaders={Cookie:objHeaders.Cookie+'; '+strCsrfCookie,Origin:'https://localhost:3444','Content-Type':'application/json','X-CSRF-Token':JSON.parse(objCsrf.strBody).strCsrfToken};
    assert.equal((await get(intPort,strProgress,{...objWriteHeaders,Origin:'https://other.invalid'},objBody)).intStatus,403);
    assert.equal((await get(intPort,strProgress,objWriteHeaders,objBody)).intStatus,200);
    assert.equal((await get(intPort,strProgress,objWriteHeaders,objBody)).intStatus,409);
    assert.equal((await get(intPort,`/api/staff/orders/${strReference}/exception`,objWriteHeaders,{intRevision:objCurrent.intRevision+1,strAction:'cancel'})).intStatus,403);
    assert.equal((await get(intPort,`/api/staff/orders/${strReference}/tracking-replacement`,objWriteHeaders,{bReviewed:true})).intStatus,403);
    assert.equal((await get(intPort,`/api/staff/orders/${strReference}/refund`,objWriteHeaders,{intRevision:objCurrent.intRevision+1,strRequestId:'00000000-0000-4000-8000-000000000009'})).intStatus,403);
    const strCancelToken=objFixture.arrTrackingPaths[2].split('#')[1];const objGuestHeaders={Origin:'https://localhost:3444','Content-Type':'application/json'};
    assert.equal((await get(intPort,'/api/tracking/cancellation',{...objGuestHeaders,Origin:'https://other.invalid'},{strToken:strCancelToken})).intStatus,403);
    assert.equal((await get(intPort,'/api/tracking/cancellation',objGuestHeaders,{strToken:'public-order-reference'})).intStatus,404);
    assert.equal((await get(intPort,'/api/tracking/cancellation',objGuestHeaders,{strToken:strCancelToken})).intStatus,200);
    assert.equal(JSON.parse((await get(intPort,'/api/tracking/cancellation',objGuestHeaders,{strToken:strCancelToken})).strBody).bReplayed,true);
    const strTrackingToken=objFixture.arrTrackingPaths[1].split('#')[1];
    const objTrackingShell=await get(intPort,'/track');assert.equal(objTrackingShell.intStatus,200);assert.equal(objTrackingShell.objHeaders['cache-control'],'no-store');assert.doesNotMatch(objTrackingShell.strBody,new RegExp(strTrackingToken));
    const objPublic=await get(intPort,'/api/tracking',{Origin:'https://localhost:3444','Content-Type':'application/json'},{strToken:strTrackingToken});
    assert.equal(objPublic.intStatus,200);assert.doesNotMatch(objPublic.strBody,/202555|Guest|cents|ciphertext|token_digest/);
    assert.equal((await get(intPort,'/api/tracking',{Origin:'https://other.invalid','Content-Type':'application/json'},{strToken:strTrackingToken})).intStatus,403);

    assert.equal((await get(intPort,'/api/staff/orders?role=admin',objHeaders)).intStatus,400);
    assert.equal((await get(intPort,'/api/staff/orders',{Cookie:`__Host-luigis-session=${strToken}; __Host-luigis-session=${strToken}`})).intStatus,400);
  }finally{if(objServer)await new Promise((fnResolve)=>objServer.close(fnResolve));objFixture.close();rmSync(strDirectory,{recursive:true,force:true});}
});
test('plaintext and forwarded-protocol claims cannot expose the queue; public pages remain public',async()=>{
  const objFixture=createOrdersFixture('https://localhost:3444');const objServer=httpServer(objFixture.objApp);await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));const strOrigin=`http://127.0.0.1:${objServer.address().port}`;
  try{assert.equal((await fetch(`${strOrigin}/api/staff/orders`,{headers:{Host:'localhost:3444','X-Forwarded-Proto':'https'}})).status,403);assert.equal((await fetch(`${strOrigin}/`)).status,200);}finally{await new Promise((fnResolve)=>objServer.close(fnResolve));objFixture.close();}
});
