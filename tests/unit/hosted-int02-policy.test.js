import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {verificationOrigin,temporaryUsername,cleanupTemporaryStaff,sanitizedHostedResult,HOSTED_STAGES} from '../../scripts/hosted-int02-policy.js';

test('hosted verifier permits only pinned HTTPS or isolated HTTPS loopback targets',()=>{
  assert.equal(verificationOrigin('https://luigispizzeria.duckdns.org').bFixture,false);
  assert.equal(verificationOrigin('https://localhost:3444').bFixture,true);
  for(const strOrigin of ['http://luigispizzeria.duckdns.org','https://evil.example','https://localhost:3444/path','https://user:secret@localhost:3444'])assert.throws(()=>verificationOrigin(strOrigin));
});
test('cleanup deactivates exact run accounts, revokes pending invitations and preserves unrelated people',async()=>{
  const strRunId='abcdef123456';const strUser=temporaryUsername('employee',strRunId);
  const arrStaff=[{strUsername:strUser,strRole:'employee',strState:'active',intRevision:2},{strUsername:'teammate',strRole:'employee',strState:'active',intRevision:1}];
  let intRevoked=0;
  const objApi={fnListStaff:async()=>arrStaff,fnListInvitations:async()=>[{strUsername:strUser,strState:'pending'}],fnDisable:async objRow=>{objRow.strState='disabled';},fnRevoke:async()=>{intRevoked++;}};
  assert.equal(await cleanupTemporaryStaff([{strUsername:strUser,strRole:'employee'}],strRunId,objApi),true);
  assert.equal(arrStaff[1].strState,'active');assert.equal(intRevoked,1);
  await assert.rejects(cleanupTemporaryStaff([{strUsername:'teammate',strRole:'employee'}],strRunId,objApi),/scope/);
  arrStaff[0].strRole='owner';assert.equal(await cleanupTemporaryStaff([{strUsername:strUser,strRole:'employee'}],strRunId,objApi),false);
});
test('acceptance summary allows only safe stages and cannot copy supplied private fields',()=>{
  const objResult=sanitizedHostedResult({strRunId:'abcdef123456',strOrigin:'https://luigispizzeria.duckdns.org',strFailureStage:null,arrPassed:['owner-sign-in'],bAccountsCleaned:true,bOrderResolved:true,strPassword:'PRIVATE',strTrackingPath:'/PRIVATE'});
  assert.equal(objResult.bPassed,false);assert.equal(JSON.stringify(objResult).includes('PRIVATE'),false);
  assert.equal(sanitizedHostedResult({...objResult,arrPassed:HOSTED_STAGES}).bPassed,true);
  assert.throws(()=>sanitizedHostedResult({...objResult,strFailureStage:'PRIVATE'}));
});
test('private verifier rejects noninteractive invocation and secret arguments without echo',()=>{
 for(const strScript of ['verify-hosted-int02','verify-hosted-completion','verify-hosted-audits','verify-hosted-dashboard']){
  const objResult=spawnSync(process.execPath,[`scripts/${strScript}.js`,'PRIVATE-ARGUMENT-MARKER'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(objResult.status,1);assert.equal((objResult.stdout+objResult.stderr).includes('PRIVATE-ARGUMENT-MARKER'),false);
 }
});
