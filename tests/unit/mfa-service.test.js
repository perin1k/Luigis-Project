import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { createMfaService } from '../../src/auth/mfa-service.js';

const SYNTHETIC_KEY = '11'.repeat(32);
const INITIAL_TIME = '2026-10-21T12:00:00.000Z';

function seedStaff(objDatabase) {
  objDatabase.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at)
    VALUES ('admin1', 'synthetic-admin-1', 'admin', '2026-10-21T10:00:00.000Z'),
      ('admin2', 'synthetic-admin-2', 'admin', '2026-10-21T10:00:00.000Z'),
      ('employee', 'synthetic-employee', 'employee', '2026-10-21T10:00:00.000Z')`);
}

function withMfa(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  let dtNow = new Date(INITIAL_TIME);
  let objService;
  try {
    applyMigrations(objDatabase); seedStaff(objDatabase);
    objService = createMfaService(objDatabase, { strEncryptionKeyHex: SYNTHETIC_KEY, fnNow: () => new Date(dtNow) });
    fnCheck(objDatabase, objService, (strTime) => { dtNow = new Date(strTime); });
  } finally { objService?.destroy(); objDatabase.close(); }
}

function enrollmentCode(objEnrollment, strTime = INITIAL_TIME) {
  return OTPAuth.URI.parse(objEnrollment.strProvisioningUri).generate({ timestamp: Date.parse(strTime) });
}

function incorrectCode(objEnrollment, strTime = INITIAL_TIME) {
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  const setValid = new Set([-30000, 0, 30000].map((numOffset) => objTotp.generate({ timestamp: Date.parse(strTime) + numOffset })));
  for (let intCandidate = 0; intCandidate < 1000000; intCandidate += 1) {
    const strCode = String(intCandidate).padStart(6, '0');
    if (!setValid.has(strCode)) return strCode;
  }
  throw new Error('Synthetic invalid code unavailable');
}

test('enrollment stores authenticated ciphertext, activates only after correct code and creates no session', () => withMfa((objDatabase, objService) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  const objRow = objDatabase.prepare('SELECT * FROM mfa_secrets').get();
  assert.equal(objRow.state, 'pending');
  assert.equal(Buffer.from(objRow.ciphertext).includes(Buffer.from(objTotp.secret.base32)), false);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM mfa_references').get().total, 0);
  assert.equal(objService.confirmEnrollment('admin2', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), false);
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, '123'), false);
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, incorrectCode(objEnrollment)), false);
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), true);
  assert.equal(objDatabase.prepare('SELECT state FROM mfa_secrets').get().state, 'active');
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
  assert.throws(() => objService.beginEnrollment('admin1'), /unavailable/i);
}));

test('confirmation and later verification consume counters atomically and reject reuse', () => withMfa((objDatabase, objService, fnSetTime) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  const strFirst = enrollmentCode(objEnrollment);
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, strFirst), true);
  assert.equal(objService.verifyCode('admin1', strFirst), false);
  fnSetTime('2026-10-21T12:00:30.000Z');
  const strNext = enrollmentCode(objEnrollment, '2026-10-21T12:00:30.000Z');
  assert.equal(objService.verifyCode('admin1', strNext), true);
  assert.equal(objService.verifyCode('admin1', strNext), false);
  assert.equal(objService.verifyCode('employee', strNext), false);
  assert.equal(objService.verifyCode('admin1', '1234567'), false);
  assert.equal(objService.verifyCode('admin1', {}), false);
  assert.equal(objService.verifyCode('admin1', `${strNext}\n`), false);
  assert.equal(objService.verifyCode('admin1', incorrectCode(objEnrollment, '2026-10-21T12:00:30.000Z')), false);
}));

test('expired pending enrollment is erased and replaced without activating a factor', () => withMfa((objDatabase, objService, fnSetTime) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  assert.throws(() => objService.beginEnrollment('admin1'), /unavailable/i);
  fnSetTime('2026-10-21T12:10:00.000Z');
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId,
    enrollmentCode(objEnrollment, '2026-10-21T12:10:00.000Z')), false);
  assert.equal(objDatabase.prepare('SELECT ciphertext FROM mfa_secrets').get().ciphertext, null);
  const objReplacement = objService.beginEnrollment('admin1');
  assert.notEqual(objReplacement.strEnrollmentId, objEnrollment.strEnrollmentId);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM mfa_references').get().total, 0);
}));

test('verification rejects out-of-window, disabled and revoked factors', () => withMfa((objDatabase, objService, fnSetTime) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment));
  fnSetTime('2026-10-21T12:02:00.000Z');
  assert.equal(objService.verifyCode('admin1', enrollmentCode(objEnrollment)), false);
  objDatabase.exec("UPDATE staff_users SET state = 'disabled', disabled_at = '2026-10-21T12:02:00.000Z' WHERE id = 'admin1'");
  assert.equal(objService.verifyCode('admin1', enrollmentCode(objEnrollment, '2026-10-21T12:02:00.000Z')), false);
  objDatabase.exec("UPDATE mfa_references SET state = 'revoked', revoked_at = '2026-10-21T12:02:00.000Z'");
  assert.equal(objDatabase.prepare('SELECT state, ciphertext FROM mfa_secrets').get().state, 'revoked');
  assert.equal(objDatabase.prepare('SELECT ciphertext FROM mfa_secrets').get().ciphertext, null);
}));

test('missing, wrong and destroyed encryption keys never authenticate', () => withMfa((objDatabase, objService) => {
  assert.throws(() => createMfaService(objDatabase, { strEncryptionKeyHex: '' }), /key/i);
  const objEnrollment = objService.beginEnrollment('admin1');
  const objWrong = createMfaService(objDatabase, { strEncryptionKeyHex: '22'.repeat(32), fnNow: () => new Date(INITIAL_TIME) });
  try {
    assert.throws(() => objWrong.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), /decrypt/i);
    assert.equal(objDatabase.prepare('SELECT state FROM mfa_secrets').get().state, 'pending');
  } finally { objWrong.destroy(); }
  objService.destroy();
  assert.throws(() => objService.beginEnrollment('admin2'), /destroyed/i);
}));

test('one-step clock drift is accepted once; larger drift and backward time are rejected', () => withMfa((objDatabase, objService, fnSetTime) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), true);
  fnSetTime('2026-10-21T12:01:00.000Z');
  assert.equal(objService.verifyCode('admin1', enrollmentCode(objEnrollment, '2026-10-21T12:01:30.000Z')), true);
  assert.equal(objService.verifyCode('admin1', enrollmentCode(objEnrollment, '2026-10-21T12:01:30.000Z')), false);
  fnSetTime('2026-10-21T12:00:30.000Z');
  assert.equal(objService.verifyCode('admin1', enrollmentCode(objEnrollment, '2026-10-21T12:01:00.000Z')), false);
  fnSetTime('invalid');
  assert.throws(() => objService.verifyCode('admin1', '123456'), /clock/i);
}));

test('authenticated encryption rejects copied ciphertext from another factor', () => withMfa((objDatabase, objService) => {
  const objFirst = objService.beginEnrollment('admin1');
  const objSecond = objService.beginEnrollment('admin2');
  const objPayload = objDatabase.prepare('SELECT ciphertext, iv, auth_tag FROM mfa_secrets WHERE id = ?').get(objFirst.strEnrollmentId);
  // This isolated fixture bypasses the write guard to simulate database tampering.
  objDatabase.exec('DROP TRIGGER mfa_secret_payload_fixed; DROP TRIGGER mfa_secret_progress');
  objDatabase.prepare('UPDATE mfa_secrets SET ciphertext = ?, iv = ?, auth_tag = ? WHERE id = ?')
    .run(objPayload.ciphertext, objPayload.iv, objPayload.auth_tag, objSecond.strEnrollmentId);
  assert.throws(() => objService.confirmEnrollment('admin2', objSecond.strEnrollmentId, enrollmentCode(objFirst)), /decrypt/i);
}));

test('confirmation audit failure rolls back activation and counter consumption', () => withMfa((objDatabase, objService) => {
  const objEnrollment = objService.beginEnrollment('admin1');
  objDatabase.exec("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
  assert.throws(() => objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), /synthetic audit failure/);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM mfa_references').get().total, 0);
  assert.equal(objDatabase.prepare('SELECT last_counter FROM mfa_secrets').get().last_counter, null);
  objDatabase.exec('DROP TRIGGER fixture_audit_failure');
  assert.equal(objService.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, enrollmentCode(objEnrollment)), true);
}));

test('MFA migration upgrades without factors and failed upgrade rolls back', () => {
  const objDatabase = openDatabase(':memory:');
  const arrHistorical = ['catalog', 'orders', 'payments', 'scheduling', 'access-and-audit', 'auth-credentials'].map((strName, intIndex) => ({
    intVersion: intIndex + 1, strName,
    strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
  }));
  try {
    applyMigrations(objDatabase, arrHistorical); seedStaff(objDatabase);
    assert.throws(() => applyMigrations(objDatabase, [...arrHistorical, {
      intVersion: 7, strName: 'mfa-secrets',
      strSql: readFileSync(new URL('../../src/data/migrations/007-mfa-secrets.sql', import.meta.url), 'utf8') + '\nINVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 6);
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'mfa_secrets'").get(), undefined);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM mfa_secrets').get().total, 0);
  } finally { objDatabase.close(); }
});

test('two connections cannot consume the same authenticator code twice', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-mfa-'));
  const strPath = join(strDirectory, 'test.sqlite');
  const objFirst = openDatabase(strPath);
  let objSecond, objServiceA, objServiceB;
  try {
    applyMigrations(objFirst); seedStaff(objFirst);
    objSecond = openDatabase(strPath);
    const objOptions = { strEncryptionKeyHex: SYNTHETIC_KEY, fnNow: () => new Date(INITIAL_TIME) };
    objServiceA = createMfaService(objFirst, objOptions); objServiceB = createMfaService(objSecond, objOptions);
    const objEnrollment = objServiceA.beginEnrollment('admin1');
    const strCode = enrollmentCode(objEnrollment);
    assert.equal(objServiceA.confirmEnrollment('admin1', objEnrollment.strEnrollmentId, strCode), true);
    assert.equal(objServiceB.verifyCode('admin1', strCode), false);
  } finally {
    objServiceA?.destroy(); objServiceB?.destroy(); objSecond?.close(); objFirst.close();
    rmSync(strDirectory, { recursive: true, force: true });
  }
});
