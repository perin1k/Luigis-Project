import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { createSessionService } from '../../src/auth/session-service.js';
import { createStaffAccountService } from '../../src/auth/staff-account-service.js';
import { createLoginService } from '../../src/auth/login-service.js';
import { hashPassword } from '../../src/auth/password-service.js';

const ADMIN_TOKEN = 'a'.repeat(64);
const EMPLOYEE_TOKEN = 'b'.repeat(64);
function fixture() {
  const objDb = openDatabase(':memory:');
  applyMigrations(objDb);
  let strNow = '2026-10-21T12:10:00.000Z';
  const fnNow = () => new Date(strNow);
  objDb.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES
    ('admin', 'synthetic-admin', 'admin', '2026-10-21T10:00:00.000Z'),
    ('other-admin', 'synthetic-other-admin', 'admin', '2026-10-21T10:00:00.000Z'),
    ('employee', 'synthetic-employee', 'employee', '2026-10-21T10:00:00.000Z')`);
  const objInsert = objDb.prepare(`INSERT INTO staff_sessions
    (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at, mfa_verified_at)
    VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z', '2026-10-21T20:00:00.000Z', ?)`);
  for (const [strId, strUser, strToken] of [['admin-session', 'admin', ADMIN_TOKEN],
    ['employee-session', 'employee', EMPLOYEE_TOKEN], ['employee-second', 'employee', 'c'.repeat(64)]]) {
    objInsert.run(strId, strUser, createHash('sha256').update(strToken).digest('hex'), strUser === 'admin' ? '2026-10-21T12:00:00.000Z' : null);
  }
  // Simulate a stale challenge retained by older/internal code: deactivation must erase it too.
  objDb.exec(`INSERT INTO mfa_references (id, user_id, provider_reference, enrolled_at)
    VALUES ('synthetic-factor', 'employee', 'synthetic-reference', '2026-10-21T12:00:00.000Z')`);
  objDb.prepare(`INSERT INTO login_challenges
    (token_digest, user_id, credential_revision, user_revision, factor_id, source_digest, created_ms, expires_ms)
    VALUES (?, 'employee', 1, 1, 'synthetic-factor', ?, ?, ?)`)
    .run('e'.repeat(64), 'f'.repeat(64), Date.parse(strNow), Date.parse(strNow) + 300000);
  return { objDb, fnNow, objService: createStaffAccountService(objDb, { fnNow }),
    setTime: (strValue) => { strNow = strValue; }, close: () => objDb.close() };
}

test('admin deactivation revokes every employee session and writes one attributed audit', () => {
  const obj = fixture();
  try {
    assert.deepEqual(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), { strState: 'disabled' });
    const objUser = obj.objDb.prepare("SELECT * FROM staff_users WHERE id='employee'").get();
    assert.equal(objUser.state, 'disabled'); assert.equal(objUser.revision, 2);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM staff_sessions WHERE user_id='employee' AND revoked_at IS NULL").get().total, 0);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM login_challenges').get().total, 0);
    assert.equal(createSessionService(obj.objDb, { fnNow: obj.fnNow }).validateSession(EMPLOYEE_TOKEN), null);
    const objAudit = obj.objDb.prepare("SELECT * FROM audit_events WHERE action='staff_change'").get();
    assert.equal(objAudit.actor_id, 'admin'); assert.equal(objAudit.entity_id, 'employee');
    assert.equal(objAudit.safe_change_summary, 'Staff account changed');
    assert.ok(!JSON.stringify(objAudit).includes(ADMIN_TOKEN));
    assert.ok(createSessionService(obj.objDb, { fnNow: obj.fnNow }).validateSession(ADMIN_TOKEN));
  } finally { obj.close(); }
});

test('employee, missing, forged, expired and revoked sessions cannot deactivate', () => {
  const obj = fixture();
  try {
    for (const strToken of [EMPLOYEE_TOKEN, undefined, 'admin', 'd'.repeat(64)]) assert.equal(obj.objService.deactivateEmployee(strToken, 'employee'), null);
    obj.setTime('2026-10-21T12:30:00.000Z');
    assert.equal(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), null);
    assert.equal(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), null);
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM audit_events WHERE action='staff_change'").get().total, 0);
  } finally { obj.close(); }
});

test('self, other admin, unknown and invalid targets are protected', () => {
  const obj = fixture();
  try {
    for (const strTarget of ['admin', 'other-admin', 'unknown', '', null, {}, 'x'.repeat(129)]) {
      assert.equal(obj.objService.deactivateEmployee(ADMIN_TOKEN, strTarget), null);
    }
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM staff_users WHERE state='disabled'").get().total, 0);
  } finally { obj.close(); }
});

test('repeated requests are idempotent without duplicate audits or revision changes', () => {
  const obj = fixture();
  try {
    obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee');
    obj.setTime('2026-10-21T12:11:00.000Z');
    assert.deepEqual(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), { strState: 'already_disabled' });
    assert.equal(obj.objDb.prepare("SELECT revision FROM staff_users WHERE id='employee'").get().revision, 2);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM audit_events WHERE action='staff_change'").get().total, 1);
  } finally { obj.close(); }
});

test('audit failure rolls back deactivation, sessions, login epoch and admin activity together', () => {
  const obj = fixture();
  try {
    obj.objDb.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    assert.throws(() => obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), /synthetic failure/);
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
    assert.equal(obj.objDb.prepare("SELECT epoch FROM login_identity_versions WHERE user_id='employee'").get().epoch, 1);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM login_challenges').get().total, 1);
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM staff_sessions WHERE revoked_at IS NOT NULL").get().total, 0);
    assert.equal(obj.objDb.prepare("SELECT last_activity_at FROM staff_sessions WHERE id='admin-session'").get().last_activity_at, '2026-10-21T12:00:00.000Z');
  } finally { obj.close(); }
});

test('future activity and exhausted revisions fail without mutating target', () => {
  const obj = fixture();
  try {
    obj.objDb.exec("UPDATE staff_sessions SET last_activity_at='2026-10-21T12:11:00.000Z' WHERE id='employee-session'");
    assert.equal(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), null);
    obj.setTime('2026-10-21T12:12:00.000Z');
    obj.objDb.exec("UPDATE staff_users SET revision=9007199254740991 WHERE id='employee'");
    assert.equal(obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee'), null);
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
  } finally { obj.close(); }
});

test('deactivation during asynchronous password verification prevents a new session', async () => {
  const obj = fixture();
  try {
    const strHash = await hashPassword('Synthetic lifecycle password');
    obj.objDb.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
      VALUES ('employee', 'employee', ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z')`).run(strHash);
    const objLogin = createLoginService(obj.objDb, { objMfaService: { verifyCode: () => false }, fnNow: obj.fnNow });
    const pAttempt = objLogin.beginSignIn('employee', 'Synthetic lifecycle password', 'test-source');
    obj.objService.deactivateEmployee(ADMIN_TOKEN, 'employee');
    assert.equal(await pAttempt, null);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 3);
  } finally { obj.close(); }
});

test('authorized transaction helper rejects async callbacks and rolls back thenable results', () => {
  const obj = fixture();
  try {
    const objSessions = createSessionService(obj.objDb, { fnNow: obj.fnNow });
    assert.throws(() => objSessions.executeAuthorized(ADMIN_TOKEN, 'employees.manage', async () => true), /synchronous/);
    assert.throws(() => objSessions.executeAuthorized(ADMIN_TOKEN, 'employees.manage', () => Promise.resolve(true)), /synchronous/);
    assert.equal(obj.objDb.prepare("SELECT last_activity_at FROM staff_sessions WHERE id='admin-session'").get().last_activity_at, '2026-10-21T12:00:00.000Z');
  } finally { obj.close(); }
});
