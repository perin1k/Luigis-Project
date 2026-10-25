import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { createBootstrapService } from '../../src/auth/bootstrap-service.js';
import { validateNewPassword } from '../../src/auth/password-policy.js';
import { createLoginService } from '../../src/auth/login-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createSessionService } from '../../src/auth/session-service.js';

const PASSWORD = 'Synthetic basil lantern orchestra';
const KEY = 'ef'.repeat(32);
function fixture(strPath = ':memory:') {
  const objDb = openDatabase(strPath); applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:00:00.000Z');
  const fnNow = () => new Date(numNow);
  const objSetup = createBootstrapService(objDb, { strEncryptionKeyHex: KEY, fnNow });
  return { objDb, objSetup, fnNow, advance: (intMs) => { numNow += intMs; },
    close: () => { objSetup.cancel(); objDb.close(); } };
}
function code(objEnrollment, objFixture) {
  return OTPAuth.URI.parse(objEnrollment.strProvisioningUri).generate({ timestamp: objFixture.fnNow().getTime() });
}

test('enrollment policy accepts exact long Unicode passphrases and rejects weak/invalid boundaries', () => {
  assert.ok(validateNewPassword(PASSWORD, 'alice'));
  assert.ok(validateNewPassword('🍕'.repeat(14) + 'a', 'alice'));
  assert.equal(validateNewPassword('🍕'.repeat(14), 'alice'), false);
  assert.ok(validateNewPassword('A' + '🍕'.repeat(255) + 'xyz', 'alice')); // 1024 UTF-8 bytes.
  for (const strValue of ['', 'short', 'a'.repeat(15), 'ALICEALICEALICE123', 'password123456789',
    'Luigis-Pizza-123456', '🍕'.repeat(257), 'long invalid\u0000 password', '\ud800'.repeat(15)]) {
    assert.equal(validateNewPassword(strValue, 'alice'), false);
  }
  const arrCommon = readFileSync(new URL('../../src/auth/blocklists/common-passwords.txt', import.meta.url), 'utf8').split(/\r?\n/);
  const strLongCommon = arrCommon.find((strValue) => [...strValue].length >= 15 && !/^(.)\1+$/.test(strValue));
  assert.ok(strLongCommon); assert.equal(validateNewPassword(strLongCommon.toUpperCase(), 'alice'), false);
});

test('first-admin setup persists nothing until MFA confirmation and then supports real sign-in', async () => {
  const obj = fixture(); let objMfa;
  try {
    const objEnrollment = await obj.objSetup.beginSetup('Alice.Admin', PASSWORD);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 0);
    assert.equal(obj.objSetup.confirmSetup('invalid'), false);
    const objConfirmed = obj.objSetup.confirmSetup(code(objEnrollment, obj));
    assert.equal(objConfirmed.arrRecoveryCodes.length, 10);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM recovery_codes WHERE state='active'").get().total, 10);
    const objUser = obj.objDb.prepare('SELECT * FROM staff_users').get();
    assert.equal(objUser.role, 'admin'); assert.ok(objUser.identity_subject.startsWith('local-bootstrap:'));
    assert.equal(obj.objDb.prepare('SELECT username FROM staff_credentials').get().username, 'alice.admin');
    assert.equal(obj.objDb.prepare('SELECT state FROM mfa_secrets').get().state, 'active');
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM audit_events').get().total, 2);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
    obj.advance(30000);
    objMfa = createMfaService(obj.objDb, { strEncryptionKeyHex: KEY, fnNow: obj.fnNow });
    const objLogin = createLoginService(obj.objDb, { objMfaService: objMfa, fnNow: obj.fnNow });
    const objChallenge = await objLogin.beginSignIn('alice.admin', PASSWORD, 'synthetic-source');
    const objSession = objLogin.completeMfa(objChallenge.strMfaChallenge, code(objEnrollment, obj), 'synthetic-source');
    assert.equal(createSessionService(obj.objDb, { fnNow: obj.fnNow }).validateSession(objSession.strSessionToken).strRole, 'owner');
    await assert.rejects(obj.objSetup.beginSetup('second.admin', PASSWORD), /unavailable/);
  } finally { objMfa?.destroy(); obj.close(); }
});

test('cancel, expiry, exhausted codes and backward clocks leave no partial account', async () => {
  for (const strScenario of ['cancel', 'expiry', 'attempts', 'clock']) {
    const obj = fixture();
    try {
      const objEnrollment = await obj.objSetup.beginSetup('alice.admin', PASSWORD);
      if (strScenario === 'cancel') obj.objSetup.cancel();
      if (strScenario === 'expiry') obj.advance(600000);
      if (strScenario === 'clock') obj.advance(-1);
      if (strScenario === 'attempts') for (let intIndex = 0; intIndex < 5; intIndex++) assert.equal(obj.objSetup.confirmSetup('bad'), false);
      assert.equal(obj.objSetup.confirmSetup(code(objEnrollment, obj)), false);
      for (const strTable of ['staff_users', 'staff_credentials', 'mfa_secrets', 'audit_events']) {
        assert.equal(obj.objDb.prepare(`SELECT count(*) AS total FROM ${strTable}`).get().total, 0);
      }
    } finally { obj.close(); }
  }
});

test('audit failure rolls back the complete account and requires a fresh code for retry', async () => {
  const obj = fixture();
  try {
    const objEnrollment = await obj.objSetup.beginSetup('alice.admin', PASSWORD);
    obj.objDb.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    assert.throws(() => obj.objSetup.confirmSetup(code(objEnrollment, obj)), /synthetic failure/);
    for (const strTable of ['staff_users', 'staff_credentials', 'mfa_secrets', 'mfa_references', 'audit_events', 'login_identity_versions']) {
      assert.equal(obj.objDb.prepare(`SELECT count(*) AS total FROM ${strTable}`).get().total, 0);
    }
    obj.objDb.exec('DROP TRIGGER synthetic_failure');
    assert.equal(obj.objSetup.confirmSetup(code(objEnrollment, obj)), false);
    obj.advance(30000); assert.ok(obj.objSetup.confirmSetup(code(objEnrollment, obj)));
  } finally { obj.close(); }
});

test('separate connections cannot commit two first admins and owner cannot be demoted and bootstrap stays closed', async () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-bootstrap-'));
  const obj = fixture(join(strDirectory, 'test.sqlite'));
  const objOther = fixture(join(strDirectory, 'test.sqlite'));
  try {
    const objFirst = await obj.objSetup.beginSetup('alice.admin', PASSWORD);
    const objSecond = await objOther.objSetup.beginSetup('other.admin', PASSWORD);
    assert.ok(obj.objSetup.confirmSetup(code(objFirst, obj)));
    assert.throws(() => objOther.objSetup.confirmSetup(code(objSecond, objOther)), /unavailable/);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 1);
    assert.throws(()=>obj.objDb.exec("UPDATE staff_users SET role='employee' WHERE role='admin'"),/Owner/);
    const objThird = createBootstrapService(obj.objDb, { strEncryptionKeyHex: KEY, fnNow: obj.fnNow });
    try { await assert.rejects(objThird.beginSetup('third.admin', PASSWORD), /unavailable/); }
    finally { objThird.cancel(); }
  } finally { objOther.close(); obj.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});

test('invalid inputs, missing encryption key, repeated begin and cancellation during hashing do not write', async () => {
  const obj = fixture();
  try {
    await assert.rejects(obj.objSetup.beginSetup('x', PASSWORD), /input/);
    await assert.rejects(obj.objSetup.beginSetup('alice.admin', 'weak'), /policy/);
    const objMissing = createBootstrapService(obj.objDb, { strEncryptionKeyHex: 'invalid', fnNow: obj.fnNow });
    try { await assert.rejects(objMissing.beginSetup('alice.admin', PASSWORD), /key/); }
    finally { objMissing.cancel(); }
    const pPending = obj.objSetup.beginSetup('alice.admin', PASSWORD);
    await assert.rejects(obj.objSetup.beginSetup('alice.admin', PASSWORD), /unavailable/);
    obj.objSetup.cancel(); await assert.rejects(pPending, /unavailable/);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 0);
  } finally { obj.close(); }
});

test('setup command rejects piped/noninteractive input without echoing secrets', () => {
  const objResult = spawnSync(process.execPath, ['scripts/setup-admin.js'], { input: 'SYNTHETIC_PRIVATE_INPUT\n', encoding: 'utf8' });
  assert.equal(objResult.status, 1);
  assert.ok(!objResult.stdout.includes('SYNTHETIC_PRIVATE_INPUT'));
  assert.ok(!objResult.stderr.includes('SYNTHETIC_PRIVATE_INPUT'));
  assert.ok(objResult.stderr.includes('did not complete'));
});
