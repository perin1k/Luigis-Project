import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
test('menu HTTPS transport requires role, pinned origin, CSRF, bounded JSON and revisions before persistence',async()=>{
  const objFixture=createOrdersFixture('https://localhost:3444');const strDirectory=mkdtempSync(join(tmpdir(),'luigis-menu-http-'));let objServer;
  function send(strPath,objHeaders={},objBody){return new Promise((fnResolve,fnReject)=>{const objRequest=request({hostname:'127.0.0.1',port:objServer.address().port,path:strPath,method:objBody===undefined?'GET':'POST',rejectUnauthorized:false,headers:{Host:'localhost:3444',...objHeaders}},(objResponse)=>{let strBody='';objResponse.setEncoding('utf8');objResponse.on('data',(strChunk)=>strBody+=strChunk);objResponse.on('end',()=>fnResolve({intStatus:objResponse.statusCode,objHeaders:objResponse.headers,strBody}));});objRequest.on('error',fnReject);objRequest.end(objBody===undefined?undefined:typeof objBody==='string'?objBody:JSON.stringify(objBody));});}
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key'),'-out',join(strDirectory,'cert'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
    objServer=createServer({key:readFileSync(join(strDirectory,'key')),cert:readFileSync(join(strDirectory,'cert'))},objFixture.objApp);await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));
    assert.equal((await send('/staff/menu')).intStatus,303);assert.equal((await send('/staff/menu',{Host:'hostile.invalid'})).intStatus,403);
    for(const [strRole,strToken] of [['employee','5'.repeat(64)],['owner','a'.repeat(64)],['admin','b'.repeat(64)]]){
      objFixture.objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(`menu-${strRole}`,strRole,createHash('sha256').update(strToken).digest('hex'),'2026-10-21T18:00:30.000Z','2026-10-21T18:00:30.000Z',strRole!=='employee'?'2026-10-21T18:00:30.000Z':null,'2026-10-22T02:00:30.000Z');
      const strCookie=`__Host-luigis-session=${strToken}`;const objPage=await send('/staff/menu',{Cookie:strCookie});assert.equal(objPage.intStatus,200);assert.match(objPage.objHeaders['x-robots-tag'],/noindex/);assert.equal(objPage.objHeaders['cache-control'],'no-store');if(strRole!=='owner')assert.doesNotMatch(objPage.strBody,/id="prices-heading"|id="hours-heading"/);
      const objCsrf=await send('/api/staff/menu/csrf',{Cookie:strCookie});const strCsrfCookie=objCsrf.objHeaders['set-cookie'][0].split(';')[0];const objHeaders={Cookie:`${strCookie}; ${strCsrfCookie}`,Origin:'https://localhost:3444','Content-Type':'application/json','X-CSRF-Token':JSON.parse(objCsrf.strBody).strCsrfToken};
      assert.equal((await send('/api/staff/menu/prices',objHeaders,{})).intStatus,strRole==='owner'?422:403);
      const objIngredient=objFixture.objDatabase.prepare("SELECT * FROM ingredients WHERE code='pepperoni'").get();const objInput={strId:objIngredient.id,intRevision:objIngredient.revision,bAvailable:false};
      assert.equal((await send('/api/staff/menu/availability',{...objHeaders,'X-CSRF-Token':'forged'},objInput)).intStatus,403);
      assert.equal((await send('/api/staff/menu/availability',{...objHeaders,Origin:'https://hostile.invalid'},objInput)).intStatus,403);
      assert.equal((await send('/api/staff/menu/availability',objHeaders,'{')).intStatus,400);
      assert.equal((await send('/api/staff/menu/availability',objHeaders,'x'.repeat(9000))).intStatus,413);
      assert.equal((await send('/api/staff/menu/availability',{...objHeaders,'Content-Encoding':'gzip'},objInput)).intStatus,415);
      const objSaved=await send('/api/staff/menu/availability',objHeaders,objInput);assert.equal(objSaved.intStatus,200);assert.equal(objFixture.objDatabase.prepare('SELECT is_available FROM ingredients WHERE id=?').get(objIngredient.id).is_available,0);
      if(objIngredient.is_available)assert.equal((await send('/api/staff/menu/availability',objHeaders,objInput)).intStatus,409);
      assert.equal((await send('/api/staff/menu/hours?date=2026-10-21',{Cookie:strCookie})).intStatus,strRole==='owner'?200:403);
    }
  }finally{if(objServer)await new Promise((fnResolve)=>objServer.close(fnResolve));objFixture.close();rmSync(strDirectory,{recursive:true,force:true});}
});
