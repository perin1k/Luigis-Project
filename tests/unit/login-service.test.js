import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { hashPassword } from '../../src/auth/password-service.js';
import { createLoginService } from '../../src/auth/login-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createSessionService } from '../../src/auth/session-service.js';

const PASSWORD = 'Synthetic test passphrase only';
const STR_HASH = await hashPassword(PASSWORD);
function fixture() {
  const objDb = openDatabase(':memory:');
  applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:00:00.000Z');
  const fnNow = () => new Date(numNow);
  objDb.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES
    ('employee', 'synthetic-employee', 'employee', '2026-10-20T12:00:00.000Z'),
    ('admin', 'synthetic-admin', 'admin', '2026-10-20T12:00:00.000Z')`);
  for (const strUser of ['employee', 'admin']) objDb.prepare(`INSERT INTO staff_credentials
    (user_id, username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?)`)
    .run(strUser, strUser, STR_HASH, fnNow().toISOString(), fnNow().toISOString());
  const objMfa = createMfaService(objDb, { strEncryptionKeyHex: 'ab'.repeat(32), fnNow });
  const objEnrollment = objMfa.beginEnrollment('admin');
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  assert.ok(objMfa.confirmEnrollment('admin', objEnrollment.strEnrollmentId, objTotp.generate({ timestamp: numNow })));
  numNow += 30000;
  return { objDb, objMfa, objLogin: createLoginService(objDb, { objMfaService: objMfa, fnNow }),
    objSessions: createSessionService(objDb, { fnNow }),
    code: () => objTotp.generate({ timestamp: numNow }), advance: (intMs) => { numNow += intMs; },
    close: () => { objMfa.destroy(); objDb.close(); } };
}

test('employee credentials issue a usable opaque session with no raw token persisted', async () => {
  const obj = fixture();
  try {
    const objResult = await obj.objLogin.beginSignIn('EMPLOYEE', PASSWORD, 'source-a');
    assert.equal(obj.objSessions.validateSession(objResult.strSessionToken).strUserId, 'employee');
    const objRow = obj.objDb.prepare('SELECT * FROM staff_sessions').get();
    assert.notEqual(objRow.session_token_digest, objResult.strSessionToken);
    assert.equal(objRow.mfa_verified_at, null);
  } finally { obj.close(); }
});
test('unknown, incorrect and disabled accounts fail with the same result', async () => {
  const obj = fixture();
  try {
    assert.equal(await obj.objLogin.beginSignIn('unknown', PASSWORD, 'a'), null);
    assert.equal(await obj.objLogin.beginSignIn('employee', 'incorrect', 'a'), null);
    obj.objDb.exec("UPDATE staff_users SET state='disabled', disabled_at='2026-10-21T12:00:30.000Z' WHERE id='employee'");
    assert.equal(await obj.objLogin.beginSignIn('employee', PASSWORD, 'a'), null);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
  } finally { obj.close(); }
});
test('credential revision changes during async hashing deny issuance', async () => {
  const obj = fixture();
  try {
    const pLogin = obj.objLogin.beginSignIn('employee', PASSWORD, 'a');
    obj.objDb.exec("UPDATE staff_credentials SET revision=revision+1 WHERE user_id='employee'");
    assert.equal(await pLogin, null);
  } finally { obj.close(); }
});
test('persistent account throttle survives a fresh factory and expires at boundary', async () => {
  const obj = fixture();
  try {
    for (let intIndex = 0; intIndex < 5; intIndex++) assert.equal(await obj.objLogin.beginSignIn('employee', 'wrong', 'a'), null);
    const objOther = createLoginService(obj.objDb, { objMfaService: obj.objMfa, fnNow: () => new Date('2026-10-21T12:00:30.000Z') });
    assert.equal(await objOther.beginSignIn('employee', PASSWORD, 'b'), null);
    obj.advance(900000);
    assert.ok(await obj.objLogin.beginSignIn('employee', PASSWORD, 'b'));
  } finally { obj.close(); }
});
test('admin requires source-bound MFA, issues only after code, and rejects challenge/code replay', async () => {
  const obj = fixture();
  try {
    const objResult = await obj.objLogin.beginSignIn('admin', PASSWORD, 'a');
    assert.ok(objResult.strMfaChallenge);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
    assert.equal(obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'b'), null);
    assert.equal(obj.objLogin.completeMfa(objResult.strMfaChallenge, 'bad', 'a'), null);
    const objSession = obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a');
    assert.equal(obj.objSessions.validateSession(objSession.strSessionToken).strRole, 'admin');
    assert.equal(obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a'), null);
    const objSecond = await obj.objLogin.beginSignIn('admin', PASSWORD, 'a');
    assert.equal(obj.objLogin.completeMfa(objSecond.strMfaChallenge, obj.code(), 'a'), null);
  } finally { obj.close(); }
});
test('expired or revision-invalidated admin challenges never issue sessions', async () => {
  const obj = fixture();
  try {
    const objResult = await obj.objLogin.beginSignIn('admin', PASSWORD, 'a');
    obj.objDb.exec("UPDATE staff_credentials SET revision=revision+1 WHERE user_id='admin'");
    assert.equal(obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a'), null);
    const objNext = await obj.objLogin.beginSignIn('admin', PASSWORD, 'a');
    obj.advance(300000);
    assert.equal(obj.objLogin.completeMfa(objNext.strMfaChallenge, obj.code(), 'a'), null);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
  } finally { obj.close(); }
});
test('process-wide hash cap rejects excess work without queuing', async () => {
  const obj = fixture();
  try {
    const pFirst = obj.objLogin.beginSignIn('employee', PASSWORD, 'a');
    const pSecond = obj.objLogin.beginSignIn('employee', PASSWORD, 'b');
    assert.equal(await obj.objLogin.beginSignIn('employee', PASSWORD, 'c'), null);
    assert.ok(await pFirst); assert.ok(await pSecond);
  } finally { obj.close(); }
});

test('disable then re-enable during hashing still invalidates the attempt', async () => {
  const obj = fixture();
  try {
    const pLogin = obj.objLogin.beginSignIn('employee', PASSWORD, 'a');
    obj.objDb.exec(`UPDATE staff_users SET state='disabled', disabled_at='2026-10-21T12:00:30.000Z' WHERE id='employee';
      UPDATE staff_users SET state='active', disabled_at=NULL WHERE id='employee'`);
    assert.equal(await pLogin, null);
  } finally { obj.close(); }
});
test('source ceiling and backward clocks fail closed without password work', async () => {
  const obj = fixture();
  try {
    await obj.objLogin.beginSignIn('employee', 'wrong', 'a');
    obj.objDb.exec('UPDATE login_limits SET attempts=30');
    assert.equal(await obj.objLogin.beginSignIn('other-account', PASSWORD, 'a'), null);
    obj.advance(-1);
    assert.equal(await obj.objLogin.beginSignIn('employee', PASSWORD, 'b'), null);
  } finally { obj.close(); }
});
test('issuance failure rolls back challenge consumption and cannot grant partial sessions', async () => {
  const obj = fixture();
  try {
    const objResult = await obj.objLogin.beginSignIn('admin', PASSWORD, 'a');
    obj.objDb.exec("CREATE TRIGGER synthetic_issue_failure BEFORE INSERT ON staff_sessions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    assert.throws(() => obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a'), /synthetic failure/);
    assert.equal(obj.objDb.prepare('SELECT consumed FROM login_challenges').get().consumed, 0);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
    obj.objDb.exec('DROP TRIGGER synthetic_issue_failure');
    assert.equal(obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a'), null);
    obj.advance(30000);
    assert.ok(obj.objLogin.completeMfa(objResult.strMfaChallenge, obj.code(), 'a'));
  } finally { obj.close(); }
});
