import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createPrivacyService} from '../../src/staff/privacy-service.js';

function fixture(fnWork) {
  const objFixture=createOrdersFixture('https://localhost:3444');
  let dtNow=new Date('2026-10-21T18:00:30.000Z');
  const objDatabase=objFixture.objDatabase;
  function session(strUser,bMfa=true) {
    const strToken=createHash('sha256').update(`${strUser}-${bMfa}-${dtNow.toISOString()}`).digest('hex');
    const dtValue=dtNow.toISOString();
    objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(strToken,strUser,createHash('sha256').update(strToken).digest('hex'),dtValue,dtValue,bMfa&&strUser!=='employee'?dtValue:null,new Date(dtNow.getTime()+8*3600000).toISOString());
    return strToken;
  }
  const objPrivacy=createPrivacyService(objDatabase,createSessionService(objDatabase,{fnNow:()=>dtNow}));
  try {fnWork({...objFixture,objPrivacy,session,setNow(dtValue){dtNow=new Date(dtValue);}});} finally {objFixture.close();}
}

test('privacy actions require an active MFA Admin/Owner, reviewed request and exact validated inputs',()=>fixture(({objPrivacy,session,arrOrders,objDatabase})=>{
  const strRef=arrOrders[1].strReference;
  assert.throws(()=>session('admin',false),/MFA/);
  for(const strToken of [undefined,'forged',session('employee'),'c'.repeat(64)]) {
    assert.equal(objPrivacy.read(strToken,strRef),null);
    assert.equal(objPrivacy.correct(strToken,strRef,{}),null);
    assert.equal(objPrivacy.copy(strToken,strRef,{}),null);
  }
  const strAdmin=session('admin');const objCurrent=objPrivacy.read(strAdmin,strRef);
  const objInput={intRevision:objCurrent.intRevision,bReviewed:true,objContact:{strName:'Updated Synthetic Guest',strPhone:'2025550199',strEmail:'synthetic@example.invalid'}};
  for(const objBad of [{...objInput,bReviewed:false},{...objInput,strRole:'owner'},{...objInput,intRevision:0},{...objInput,objContact:{...objInput.objContact,strPhone:'invalid'}},{...objInput,objContact:{...objInput.objContact,strEmail:'x\nprivate'}}])assert.throws(()=>objPrivacy.correct(strAdmin,strRef,objBad));
  assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM privacy_actions').get().n,0);
  assert.ok(objPrivacy.read(session('owner'),strRef));
}));

test('contact correction is atomic, revision checked and leaves purchased snapshots, grants and retention unchanged',()=>fixture(({objPrivacy,session,arrOrders,objDatabase})=>{
  const strRef=arrOrders[1].strReference;const strAdmin=session('admin');
  const objBefore=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=?').get(strRef);
  const strQuotes=JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all());
  const strGrants=JSON.stringify(objDatabase.prepare('SELECT * FROM tracking_grants').all());
  const objInput={intRevision:objBefore.revision,bReviewed:true,objContact:{strName:"Synthetic O'Brien <img src=x>",strPhone:'2025550199',strEmail:'synthetic@example.invalid'}};
  assert.equal(objPrivacy.correct(strAdmin,strRef,objInput).intRevision,objBefore.revision+1);
  assert.equal(objPrivacy.read(strAdmin,strRef).objContact.strName,objInput.objContact.strName);
  assert.throws(()=>objPrivacy.correct(strAdmin,strRef,objInput),objError=>objError.intStatus===409);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM order_quotes').all()),strQuotes);
  assert.equal(JSON.stringify(objDatabase.prepare('SELECT * FROM tracking_grants').all()),strGrants);
  const objAfter=objDatabase.prepare('SELECT * FROM orders WHERE public_reference=?').get(strRef);
  assert.deepEqual({...objAfter,revision:objBefore.revision},{...objBefore});
  const objAudit=objDatabase.prepare('SELECT * FROM privacy_actions').get();
  assert.equal(objAudit.actor_id,'admin');assert.equal(objAudit.action,'contact_corrected');
  assert.doesNotMatch(JSON.stringify(objAudit),/202555|Synthetic|example|<img/);
  for(const strSql of ['UPDATE privacy_actions SET action=action','DELETE FROM privacy_actions'])assert.throws(()=>objDatabase.exec(strSql),/append-only/);
  assert.throws(()=>objDatabase.prepare('INSERT OR REPLACE INTO privacy_actions SELECT * FROM privacy_actions').run(),/append-only/);
}));

test('limited copy excludes security/payment internals, audits review and refuses expired/redacted or unknown contacts',()=>fixture(({objPrivacy,session,arrOrders,objDatabase,setNow})=>{
  const strRef=arrOrders[1].strReference;const strAdmin=session('admin');const intRevision=objPrivacy.read(strAdmin,strRef).intRevision;
  assert.throws(()=>objPrivacy.copy(strAdmin,strRef,{intRevision,bReviewed:false}));
  const objCopy=objPrivacy.copy(strAdmin,strRef,{intRevision,bReviewed:true});
  assert.deepEqual(Object.keys(objCopy).sort(),['arrItems','objContact','strReference','strService','strStatus']);
  assert.doesNotMatch(JSON.stringify(objCopy),/ciphertext|nonce|token|digest|password|actor_id|strOrderId|strTrackingPath/);
  assert.equal(objDatabase.prepare("SELECT count(*) AS n FROM privacy_actions WHERE action='copy_reviewed'").get().n,1);
  assert.throws(()=>objPrivacy.read(strAdmin,"' OR 1=1 --"),objError=>objError.intStatus===404);
  objDatabase.prepare("UPDATE orders SET fulfillment_status='Completed',completed_at='2026-10-21T18:00:30.000Z' WHERE public_reference=?").run(strRef);
  setNow('2026-10-28T18:00:30.000Z');const strFresh=session('admin');
  assert.throws(()=>objPrivacy.read(strFresh,strRef),objError=>objError.intStatus===410);
  assert.throws(()=>objPrivacy.copy(strFresh,strRef,{intRevision,bReviewed:true}),objError=>objError.intStatus===410);
  assert.throws(()=>objPrivacy.correct(strFresh,strRef,{intRevision,bReviewed:true,objContact:{strName:'Synthetic',strPhone:'2025550100',strEmail:''}}),objError=>objError.intStatus===410);
}));

test('audit write failure rolls back correction and copy fails closed without returning private data',()=>fixture(({objPrivacy,session,arrOrders,objDatabase})=>{
  const strRef=arrOrders[1].strReference;const strAdmin=session('admin');const objBefore=objPrivacy.read(strAdmin,strRef);
  objDatabase.exec("CREATE TRIGGER privacy_fixture_failure BEFORE INSERT ON privacy_actions BEGIN SELECT RAISE(ABORT,'Synthetic audit unavailable'); END");
  assert.throws(()=>objPrivacy.correct(strAdmin,strRef,{intRevision:objBefore.intRevision,bReviewed:true,objContact:{strName:'Changed Synthetic',strPhone:'2025550199',strEmail:''}}),/audit unavailable/);
  assert.deepEqual(objPrivacy.read(strAdmin,strRef),objBefore);
  assert.throws(()=>objPrivacy.copy(strAdmin,strRef,{intRevision:objBefore.intRevision,bReviewed:true}),/audit unavailable/);
}));
