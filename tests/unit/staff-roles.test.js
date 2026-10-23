import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createStaffAccountService} from '../../src/auth/staff-account-service.js';
import {canPerformAction} from '../../src/auth/permissions.js';
import * as OTPAuth from 'otpauth';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {hashPassword} from '../../src/auth/password-service.js';
import {createRecoveryService} from '../../src/auth/recovery-service.js';
import {createMfaService} from '../../src/auth/mfa-service.js';
import {createLoginService} from '../../src/auth/login-service.js';
import {createStaffEnrollmentService} from '../../src/auth/staff-enrollment-service.js';
import {designateOwner} from '../../src/auth/owner-designation.js';

const TIME='2026-10-22T12:00:00.000Z';
function setup(bOwner=true){
  const objDb=openDatabase(':memory:');applyMigrations(objDb);
  for(const [strId,strRole] of [['owner','admin'],['manager','admin'],['employee','employee']]){
    objDb.prepare('INSERT INTO staff_users(id,identity_subject,role,created_at) VALUES(?,?,?,?)').run(strId,strId,strRole,TIME);
  }
  if(bOwner)objDb.prepare('INSERT INTO staff_ownership(singleton,user_id,designated_at) VALUES(1,?,?)').run('owner',TIME);
  const objSessions=createSessionService(objDb,{fnNow:()=>new Date(TIME)});
  function session(strId){const strToken=createHash('sha256').update(strId).digest('hex');objDb.prepare(`INSERT INTO staff_sessions(id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES(?,?,?,?,?,?,?)`).run(strId,strId,createHash('sha256').update(strToken).digest('hex'),TIME,TIME,strId==='employee'?null:TIME,'2026-10-22T20:00:00.000Z');return strToken;}
  return {objDb,objSessions,objService:createStaffAccountService(objDb,{fnNow:()=>new Date(TIME)}),strOwner:session('owner'),strManager:session('manager'),strEmployee:session('employee')};
}
test('three-tier permission matrix keeps business controls owner-only',()=>{
  for(const strAction of ['menu.edit','hours.manage','analytics.read','staff.roles.change']){
    assert.equal(canPerformAction('owner',strAction),true);assert.equal(canPerformAction('admin',strAction),false);assert.equal(canPerformAction('employee',strAction),false);
  }
  assert.equal(canPerformAction('admin','employees.manage'),true);
  assert.equal(canPerformAction('admin','refund.approve'),true);
});
test('owner resolution, role boundaries and stale edit rejection',()=>{
 const objFixture=setup();try{
  assert.equal(objFixture.objSessions.validateSession(objFixture.strOwner).strRole,'owner');
  assert.equal(objFixture.objService.updateStaff(objFixture.strManager,'employee',1,'role','admin'),null);
  assert.ok(objFixture.objService.updateStaff(objFixture.strOwner,'employee',1,'role','admin'));
  assert.equal(objFixture.objSessions.validateSession(objFixture.strEmployee),null);
  assert.equal(objFixture.objService.updateStaff(objFixture.strOwner,'employee',1,'role','employee'),null);
  assert.equal(objFixture.objService.updateStaff(objFixture.strOwner,'owner',1,'state','disabled'),null);
  assert.equal(objFixture.objService.updateStaff(objFixture.strManager,'manager',1,'state','disabled'),null);
 }finally{objFixture.objDb.close();}
});
test('reactivation never revives sessions and managers cannot manage admins',()=>{
 const objFixture=setup();try{
  assert.ok(objFixture.objService.updateStaff(objFixture.strManager,'employee',1,'state','disabled'));
  assert.ok(objFixture.objService.updateStaff(objFixture.strManager,'employee',2,'state','active'));
  assert.equal(objFixture.objSessions.validateSession(objFixture.strEmployee),null);
  assert.equal(objFixture.objService.updateStaff(objFixture.strManager,'owner',1,'state','disabled'),null);
  assert.equal(objFixture.objService.updateStaff(objFixture.strManager,'manager',1,'role','employee'),null);
  assert.throws(()=>objFixture.objDb.prepare("UPDATE staff_users SET role='employee',revision=revision+1 WHERE id='owner'").run());
  assert.throws(()=>objFixture.objDb.prepare('DELETE FROM staff_ownership').run());
 }finally{objFixture.objDb.close();}
});
test('audit failure rolls back role changes and session revocation',()=>{
 const objFixture=setup();try{
  objFixture.objDb.exec("CREATE TRIGGER reject_role_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.throws(()=>objFixture.objService.updateStaff(objFixture.strOwner,'employee',1,'role','admin'));
  assert.equal(objFixture.objDb.prepare("SELECT role FROM staff_users WHERE id='employee'").get().role,'employee');
  assert.ok(objFixture.objSessions.validateSession(objFixture.strEmployee));
 }finally{objFixture.objDb.close();}
});
test('v14 upgrade preserves identities and does not guess an owner',()=>{
 const objDb=openDatabase(':memory:');try{
  const objDir=new URL('../../src/data/migrations/',import.meta.url);
  const arrOld=readdirSync(objDir).filter(strName=>/^\d{3}-.*\.sql$/.test(strName)&&Number(strName.slice(0,3))<14).sort().map(strName=>({intVersion:Number(strName.slice(0,3)),strName:strName.slice(4,-4),strSql:readFileSync(new URL(strName,objDir),'utf8')}));
  applyMigrations(objDb,arrOld);objDb.prepare('INSERT INTO staff_users(id,identity_subject,role,created_at) VALUES(?,?,?,?)').run('legacy','legacy','admin',TIME);
  const objBefore={...objDb.prepare('SELECT * FROM staff_users').get()};
  assert.throws(()=>applyMigrations(objDb,[...arrOld,{intVersion:14,strName:'staff-roles',strSql:readFileSync(new URL('014-staff-roles.sql',objDir),'utf8')+'\nINVALID SQL;'}]));
  assert.equal(objDb.prepare("SELECT name FROM sqlite_master WHERE name='staff_ownership'").get(),undefined);
  assert.equal(objDb.prepare('SELECT max(version) AS n FROM schema_migrations').get().n,13);
  applyMigrations(objDb);applyMigrations(objDb);
  assert.deepEqual({...objDb.prepare('SELECT * FROM staff_users').get()},objBefore);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM staff_ownership').get().n,0);
  assert.equal(objDb.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{objDb.close();}
});
test('one-time private owner designation revokes sessions and cannot repeat',()=>{
 const objFixture=setup(false);try{
  assert.equal(designateOwner(objFixture.objDb,objFixture.strEmployee,{fnNow:()=>new Date(TIME)}),null);
  assert.ok(designateOwner(objFixture.objDb,objFixture.strOwner,{fnNow:()=>new Date(TIME)}));
  assert.equal(objFixture.objSessions.validateSession(objFixture.strOwner),null);
  assert.equal(designateOwner(objFixture.objDb,objFixture.strManager,{fnNow:()=>new Date(TIME)}),null);
 }finally{objFixture.objDb.close();}
});
test('promoted employee must prove password and enroll MFA before admin sign-in',async()=>{
 const objFixture=setup();let objRecovery;let objMfa;let numNow=Date.parse(TIME);const fnNow=()=>new Date(numNow);
 const strPassword='Synthetic promotion passphrase only';try{
  objFixture.objDb.prepare('INSERT INTO staff_credentials(user_id,username,password_hash,created_at,password_changed_at) VALUES(?,?,?,?,?)').run('employee','employee',await hashPassword(strPassword),TIME,TIME);
  assert.ok(objFixture.objService.updateStaff(objFixture.strOwner,'employee',1,'role','admin'));
  objRecovery=createRecoveryService(objFixture.objDb,{strEncryptionKeyHex:'ab'.repeat(32),fnNow});
  objMfa=createMfaService(objFixture.objDb,{strEncryptionKeyHex:'ab'.repeat(32),fnNow});const objLogin=createLoginService(objFixture.objDb,{objMfaService:objMfa,fnNow});
  assert.equal(await objLogin.beginSignIn('employee',strPassword,'fixture'),null);
  assert.equal(await objRecovery.beginPromotionEnrollment('employee','incorrect password','fixture'),null);
  const objPending=await objRecovery.beginPromotionEnrollment('employee',strPassword,'fixture');assert.ok(objPending);
  assert.equal(objFixture.objDb.prepare("SELECT purpose FROM recovery_requests WHERE user_id='employee'").get().purpose,'first_mfa');
  const objTotp=OTPAuth.URI.parse(objPending.strProvisioningUri);
  assert.equal(objRecovery.confirmRecovery(objPending.strRecoveryToken,'bad'),null);
  const objResult=objRecovery.confirmRecovery(objPending.strRecoveryToken,objTotp.generate({timestamp:numNow}));assert.equal(objResult.arrRecoveryCodes.length,10);
  numNow+=30000;const objChallenge=await objLogin.beginSignIn('employee',strPassword,'fixture');assert.ok(objChallenge.strMfaChallenge);
  const objSession=objLogin.completeMfa(objChallenge.strMfaChallenge,objTotp.generate({timestamp:numNow}),'fixture');assert.ok(objSession);
  assert.equal(createSessionService(objFixture.objDb,{fnNow}).validateSession(objSession.strSessionToken).strRole,'admin');
  assert.equal(await objRecovery.beginPromotionEnrollment('employee',strPassword,'fixture'),null);
  const intRevision=objFixture.objDb.prepare("SELECT revision FROM staff_users WHERE id='employee'").get().revision;
  assert.ok(createStaffAccountService(objFixture.objDb,{fnNow}).updateStaff(objFixture.strOwner,'employee',intRevision,'role','employee'));
  assert.equal(createSessionService(objFixture.objDb,{fnNow}).validateSession(objSession.strSessionToken),null);
  assert.equal(objFixture.objDb.prepare("SELECT count(*) AS n FROM recovery_codes WHERE user_id='employee' AND state='active'").get().n,0);
  const objEmployeeSession=await objLogin.beginSignIn('employee',strPassword,'fixture');assert.ok(objEmployeeSession.strSessionToken);
  assert.equal(createSessionService(objFixture.objDb,{fnNow}).validateSession(objEmployeeSession.strSessionToken).strRole,'employee');
 }finally{objRecovery?.destroy();objMfa?.destroy();objFixture.objDb.close();}
});
test('only owner can issue or revoke admin invitations; acceptance requires first MFA',async()=>{
 const objFixture=setup();try{
  const objService=createStaffEnrollmentService(objFixture.objDb,{fnNow:()=>new Date(TIME)});
  assert.equal(objService.issueInvitation(objFixture.strManager,'new.manager','admin'),null);
  const objInvite=objService.issueInvitation(objFixture.strOwner,'new.manager','admin');assert.ok(objInvite);
  assert.equal(objService.listInvitations(objFixture.strManager).arrInvitations.length,0);
  assert.equal(objService.revokeInvitation(objFixture.strManager,objInvite.strInvitationId),null);
  assert.ok(await objService.acceptInvitation(objInvite.strInvitationToken,'Synthetic invitation passphrase only','fixture'));
  const objUser=objFixture.objDb.prepare("SELECT u.* FROM staff_users u JOIN staff_credentials c ON c.user_id=u.id WHERE c.username='new.manager'").get();assert.equal(objUser.role,'admin');
  assert.ok(objFixture.objDb.prepare('SELECT * FROM staff_mfa_enrollments WHERE user_id=?').get(objUser.id));
 }finally{objFixture.objDb.close();}
});
test('reactivating a manager never creates password-only MFA-reset authority',()=>{
 const objFixture=setup();try{
  assert.ok(objFixture.objService.updateStaff(objFixture.strOwner,'manager',1,'state','disabled'));
  assert.ok(objFixture.objService.updateStaff(objFixture.strOwner,'manager',2,'state','active'));
  assert.equal(objFixture.objDb.prepare("SELECT user_id FROM staff_mfa_enrollments WHERE user_id='manager'").get(),undefined);
  assert.equal(objFixture.objSessions.validateSession(objFixture.strManager),null);
 }finally{objFixture.objDb.close();}
});
test('owner designation command refuses noninteractive proof without echoing it',()=>{
 const strSyntheticInput='synthetic private input must not be echoed';
 const objResult=spawnSync(process.execPath,['scripts/designate-owner.js'],{input:strSyntheticInput,encoding:'utf8'});
 assert.equal(objResult.status,1);assert.ok(!`${objResult.stdout}${objResult.stderr}`.includes(strSyntheticInput));
});
