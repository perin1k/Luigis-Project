import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { hashPassword, verifyPassword } from '../../src/auth/password-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createSessionService } from '../../src/auth/session-service.js';
import { createLoginService } from '../../src/auth/login-service.js';
import { createRecoveryService, LOCAL_RECOVERY_ACKNOWLEDGEMENT } from '../../src/auth/recovery-service.js';
import { issueRecoveryCodes } from '../../src/auth/recovery-records.js';

const PASSWORD = 'Synthetic recovery basil lantern';
const NEW_PASSWORD = 'Synthetic replacement olive orchard';
const STR_HASH = await hashPassword(PASSWORD);
const KEY = 'de'.repeat(32); const ADMIN_TOKEN = 'a'.repeat(64); const EMPLOYEE_TOKEN = 'b'.repeat(64);
function fixture(strPath = ':memory:') {
  const objDb = openDatabase(strPath); applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:00:00.000Z');
  const fnNow = () => new Date(numNow);
  for (const [strUser, strRole, strToken] of [['admin', 'admin', ADMIN_TOKEN], ['employee', 'employee', EMPLOYEE_TOKEN]]) {
    objDb.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strUser,`synthetic:${strUser}`,strRole,fnNow().toISOString());
    objDb.prepare('INSERT INTO staff_credentials (user_id,username,password_hash,created_at,password_changed_at) VALUES (?,?,?,?,?)')
      .run(strUser,strUser,STR_HASH,fnNow().toISOString(),fnNow().toISOString());
    objDb.prepare(`INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at)
      VALUES (?,?,?,?,?,?,'2026-10-21T20:00:00.000Z')`).run(`${strUser}-session`,strUser,createHash('sha256').update(strToken).digest('hex'),
      fnNow().toISOString(),fnNow().toISOString(),strRole === 'admin' ? fnNow().toISOString() : null);
  }
  const objMfa = createMfaService(objDb, { strEncryptionKeyHex: KEY, fnNow });
  const objEnrollment = objMfa.beginEnrollment('admin'); const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  objMfa.confirmEnrollment('admin',objEnrollment.strEnrollmentId,objTotp.generate({ timestamp: numNow }));
  const arrCodes = runTransaction(objDb, () => issueRecoveryCodes(objDb,'admin',fnNow()));
  numNow += 30000;
  return { objDb,fnNow,objMfa,arrCodes, objRecovery: createRecoveryService(objDb, { strEncryptionKeyHex: KEY,fnNow }),
    code: () => objTotp.generate({ timestamp: numNow }), advance: (intMs) => { numNow += intMs; },
    close: () => { objMfa.destroy(); objDb.close(); } };
}
function replacementCode(objPending,objFixture) {
  return OTPAuth.URI.parse(objPending.strProvisioningUri).generate({ timestamp: objFixture.fnNow().getTime() });
}

test('recovery-code regeneration requires password and fresh admin MFA, revokes old codes and stores only digests', async () => {
  const obj = fixture();
  try {
    assert.equal(await obj.objRecovery.regenerateCodes(EMPLOYEE_TOKEN,PASSWORD,obj.code(),'source'),null);
    assert.equal(await obj.objRecovery.regenerateCodes(ADMIN_TOKEN,'wrong',obj.code(),'source'),null);
    const objResult = await obj.objRecovery.regenerateCodes(ADMIN_TOKEN,PASSWORD,obj.code(),'source');
    assert.equal(objResult.arrRecoveryCodes.length,10);
    assert.equal(new Set(objResult.arrRecoveryCodes).size,10);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM recovery_codes WHERE state='revoked'").get().total,10);
    const strStored = JSON.stringify(obj.objDb.prepare('SELECT * FROM recovery_codes').all());
    for (const strCode of [...obj.arrCodes,...objResult.arrRecoveryCodes]) assert.ok(!strStored.includes(strCode));
    assert.equal(await obj.objRecovery.regenerateCodes(ADMIN_TOKEN,PASSWORD,obj.code(),'source'),null);
    assert.throws(() => obj.objDb.exec("DELETE FROM recovery_codes"), /history/);
  } finally { obj.objRecovery.destroy(); obj.close(); }
});

test('password plus one recovery code revokes access until new MFA confirms and then permits real sign-in', async () => {
  const obj = fixture();
  try {
    assert.equal(await obj.objRecovery.beginRecovery('admin','wrong',obj.arrCodes[0],'source'),null);
    const objPending = await obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'source');
    assert.ok(objPending.strProvisioningUri);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM recovery_codes WHERE state='used'").get().total,1);
    assert.equal(createSessionService(obj.objDb,{ fnNow: obj.fnNow }).validateSession(ADMIN_TOKEN),null);
    const objLogin = createLoginService(obj.objDb,{ objMfaService: obj.objMfa,fnNow: obj.fnNow });
    assert.equal(await objLogin.beginSignIn('admin',PASSWORD,'source'),null);
    assert.equal(await obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'source'),null);
    assert.equal(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,'wrong'),null);
    const objResult = obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj));
    assert.equal(objResult.strState,'recovered'); assert.equal(objResult.arrRecoveryCodes.length,10);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM recovery_locks').get().total,0);
    assert.equal(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)),null);
    obj.advance(30000);
    const objChallenge = await objLogin.beginSignIn('admin',PASSWORD,'source');
    assert.ok(objLogin.completeMfa(objChallenge.strMfaChallenge,replacementCode(objPending,obj),'source'));
  } finally { obj.objRecovery.destroy(); obj.close(); }
});

test('expiry, attempt exhaustion and restart preserve access lock; another valid proof can restart enrollment', async () => {
  for (const strScenario of ['expiry','attempts','restart']) {
    const obj = fixture(); let objNext;
    try {
      const objPending = await obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'source');
      if (strScenario === 'expiry') obj.advance(600000);
      if (strScenario === 'attempts') for (let intIndex=0;intIndex<5;intIndex++) assert.equal(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,'wrong'),null);
      if (strScenario !== 'restart') assert.equal(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)),null);
      if (strScenario === 'restart') obj.objRecovery.destroy();
      objNext = createRecoveryService(obj.objDb,{ strEncryptionKeyHex: KEY,fnNow: obj.fnNow });
      assert.equal(objNext.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)),null);
      assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM recovery_locks').get().total,1);
      const objRestarted = await objNext.beginRecovery('admin',PASSWORD,obj.arrCodes[1],'other-source');
      assert.ok(objRestarted); assert.ok(objNext.confirmRecovery(objRestarted.strRecoveryToken,replacementCode(objRestarted,obj)));
    } finally { objNext?.destroy(); if (strScenario!=='restart') obj.objRecovery.destroy(); obj.close(); }
  }
});

test('start audit failure rolls back consumed code, revoked factor, sessions and access lock', async () => {
  const obj = fixture();
  try {
    obj.objDb.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit_events WHEN NEW.action='staff_change' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    await assert.rejects(obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'source'),/synthetic failure/);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM recovery_codes WHERE state='used'").get().total,0);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM recovery_locks').get().total,0);
    assert.equal(obj.objDb.prepare("SELECT state FROM mfa_secrets").get().state,'active');
    assert.equal(obj.objDb.prepare("SELECT revoked_at FROM staff_sessions WHERE id='admin-session'").get().revoked_at,null);
  } finally { obj.objRecovery.destroy(); obj.close(); }
});

test('completion audit failure leaves old access revoked, keeps lock and can retry with a fresh code', async () => {
  const obj = fixture();
  try {
    const objPending = await obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'source');
    obj.objDb.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit_events WHEN NEW.action='staff_change' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    assert.throws(() => obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)),/synthetic failure/);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM mfa_secrets WHERE state='active'").get().total,0);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM recovery_locks').get().total,1);
    obj.objDb.exec('DROP TRIGGER synthetic_failure');
    assert.equal(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)),null);
    obj.advance(30000); assert.ok(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,replacementCode(objPending,obj)));
  } finally { obj.objRecovery.destroy(); obj.close(); }
});

test('two connections cannot consume one code twice; superseded challenges cannot complete', async () => {
  const strDir = mkdtempSync(join(tmpdir(),'luigis-recovery-')); const strPath=join(strDir,'test.sqlite');
  const obj=fixture(strPath); const objOtherDb=openDatabase(strPath);
  const objOther=createRecoveryService(objOtherDb,{ strEncryptionKeyHex:KEY,fnNow:obj.fnNow });
  try {
    const arrResults=await Promise.all([obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'a'),objOther.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'b')]);
    assert.equal(arrResults.filter(Boolean).length,1);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM recovery_codes WHERE state='used'").get().total,1);
    const objNew=await objOther.beginRecovery('admin',PASSWORD,obj.arrCodes[1],'b');
    assert.ok(objNew); assert.ok(objOther.confirmRecovery(objNew.strRecoveryToken,replacementCode(objNew,obj)));
  } finally { objOther.destroy();objOtherDb.close();obj.objRecovery.destroy();obj.close();rmSync(strDir,{ recursive:true,force:true }); }
});

test('local recovery requires explicit in-person acknowledgement, preserves role and replaces password', async () => {
  const obj=fixture();
  try {
    assert.equal(await obj.objRecovery.beginLocalRecovery('employee',NEW_PASSWORD,'unverified'),null);
    const objPending=await obj.objRecovery.beginLocalRecovery('employee',NEW_PASSWORD,LOCAL_RECOVERY_ACKNOWLEDGEMENT);
    assert.equal(objPending.strProvisioningUri,null);
    assert.ok(obj.objRecovery.confirmRecovery(objPending.strRecoveryToken,''));
    const objCredential=obj.objDb.prepare("SELECT password_hash FROM staff_credentials WHERE user_id='employee'").get();
    assert.ok(await verifyPassword(NEW_PASSWORD,objCredential.password_hash));
    assert.equal(obj.objDb.prepare("SELECT role FROM staff_users WHERE id='employee'").get().role,'employee');
    assert.equal(obj.objDb.prepare('SELECT method FROM recovery_requests').get().method,'brody_in_person');
  } finally { obj.objRecovery.destroy();obj.close(); }
});

test('recovery throttles expensive work and local command rejects noninteractive input', async () => {
  const obj=fixture();
  try {
    for(let intIndex=0;intIndex<5;intIndex++) assert.equal(await obj.objRecovery.beginRecovery('admin','wrong',obj.arrCodes[0],'source'),null);
    assert.equal(await obj.objRecovery.beginRecovery('admin',PASSWORD,obj.arrCodes[0],'other'),null);
    const objResult=spawnSync(process.execPath,['scripts/recover-account.js'],{ input:'synthetic-private-input\n',encoding:'utf8' });
    assert.equal(objResult.status,1);assert.ok(!objResult.stdout.includes('synthetic-private-input'));
    assert.ok(!objResult.stderr.includes('synthetic-private-input'));
  } finally { obj.objRecovery.destroy();obj.close(); }
});

test('failed recovery migration rolls back schema and upgrade preserves existing rows', () => {
  const arrFiles=['001-catalog.sql','002-orders.sql','003-payments.sql','004-scheduling.sql','005-access-and-audit.sql','006-auth-credentials.sql','007-mfa-secrets.sql','008-login-controls.sql','009-staff-invitations.sql','010-account-recovery.sql'];
  const arrNames=['catalog','orders','payments','scheduling','access-and-audit','auth-credentials','mfa-secrets','login-controls','staff-invitations','account-recovery'];
  const arrMigrations=arrFiles.map((strFile,intIndex)=>({ intVersion:intIndex+1,strName:arrNames[intIndex],strSql:readFileSync(new URL(`../../src/data/migrations/${strFile}`,import.meta.url),'utf8') }));
  const objDb=openDatabase(':memory:');
  try {
    applyMigrations(objDb,arrMigrations.slice(0,9));
    objDb.exec("INSERT INTO staff_users (id,identity_subject,role) VALUES ('existing','synthetic-existing','employee')");
    assert.throws(()=>applyMigrations(objDb,[...arrMigrations.slice(0,9),{...arrMigrations[9],strSql:arrMigrations[9].strSql+'\nINVALID SQL;'}]));
    assert.equal(objDb.prepare("SELECT name FROM sqlite_master WHERE name='recovery_codes'").get(),undefined);
    applyMigrations(objDb);assert.equal(objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total,1);
  } finally { objDb.close(); }
});
