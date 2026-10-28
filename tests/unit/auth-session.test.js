import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { createSessionService } from '../../src/auth/session-service.js';
import { canPerformAction } from '../../src/auth/permissions.js';

const EMPLOYEE_TOKEN = '1'.repeat(64); // Synthetic, never issued outside isolated tests.
const ADMIN_TOKEN = '2'.repeat(64);

function withSessions(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  let dtNow = new Date('2026-10-21T12:10:00.000Z');
  try {
    applyMigrations(objDatabase);
    objDatabase.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at)
      VALUES ('employee', 'synthetic-employee', 'employee', '2026-10-21T10:00:00.000Z'),
        ('admin', 'synthetic-admin', 'admin', '2026-10-21T10:00:00.000Z')`);
    const objInsert = objDatabase.prepare(`INSERT INTO staff_sessions
      (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at, mfa_verified_at)
      VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z', '2026-10-21T20:00:00.000Z', ?)`);
    objInsert.run('employee-session', 'employee', createHash('sha256').update(EMPLOYEE_TOKEN).digest('hex'), null);
    objInsert.run('admin-session', 'admin', createHash('sha256').update(ADMIN_TOKEN).digest('hex'), '2026-10-21T12:00:00.000Z');
    const objService = createSessionService(objDatabase, { fnNow: () => new Date(dtNow) });
    fnCheck(objDatabase, objService, (strTime) => { dtNow = new Date(strTime); });
  } finally { objDatabase.close(); }
}

test('session validation returns persisted identity and touches activity without exposing secrets', () => withSessions((objDatabase, objService) => {
  assert.deepEqual(objService.validateSession(EMPLOYEE_TOKEN), {
    strSessionId: 'employee-session', strUserId: 'employee', strRole: 'employee',
  });
  const objRow = objDatabase.prepare("SELECT last_activity_at, expires_at FROM staff_sessions WHERE id = 'employee-session'").get();
  assert.equal(objRow.last_activity_at, '2026-10-21T12:10:00.000Z');
  assert.equal(objRow.expires_at, '2026-10-21T20:00:00.000Z');
}));

test('idle timeout accepts just before the boundary and revokes exactly at 30 minutes', () => withSessions((objDatabase, objService, fnSetTime) => {
  fnSetTime('2026-10-21T12:29:59.999Z');
  assert.ok(objService.validateSession(EMPLOYEE_TOKEN));
  fnSetTime('2026-10-21T12:30:00.000Z');
  assert.equal(objService.validateSession(ADMIN_TOKEN), null);
  assert.equal(objDatabase.prepare("SELECT revoked_at FROM staff_sessions WHERE id = 'admin-session'").get().revoked_at, '2026-10-21T12:30:00.000Z');
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM audit_events').get().total, 1);
  assert.equal(objService.validateSession(ADMIN_TOKEN), null);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM audit_events').get().total, 1);
}));

test('absolute expiry is enforced even with recent activity', () => withSessions((objDatabase, objService, fnSetTime) => {
  objDatabase.prepare(`INSERT INTO staff_sessions
    (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at)
    VALUES ('old', 'employee', ?, '2026-10-21T04:00:00.000Z', '2026-10-21T04:00:00.000Z', '2026-10-21T12:00:00.000Z')`)
    .run(createHash('sha256').update('3'.repeat(64)).digest('hex'));
  // Advance through valid activity gaps without changing the absolute deadline.
  for (let intMinute = 20; intMinute < 480; intMinute += 20) {
    objDatabase.prepare("UPDATE staff_sessions SET last_activity_at = ? WHERE id = 'old'")
      .run(new Date(Date.parse('2026-10-21T04:00:00.000Z') + intMinute * 60000).toISOString());
  }
  fnSetTime('2026-10-21T11:59:59.999Z');
  assert.ok(objService.validateSession('3'.repeat(64)));
  fnSetTime('2026-10-21T12:00:00.000Z');
  assert.equal(objService.validateSession('3'.repeat(64)), null);
}));

test('permission checks deny unknown actions and employee access to admin capabilities', () => withSessions((objDatabase, objService) => {
  assert.equal(objService.authorizeSession(EMPLOYEE_TOKEN, 'menu.edit'), null);
  assert.equal(objService.authorizeSession(EMPLOYEE_TOKEN, 'refund.approve'), null);
  assert.equal(objService.authorizeSession(EMPLOYEE_TOKEN, 'analytics.read'), null);
  assert.ok(objService.authorizeSession(EMPLOYEE_TOKEN, 'orders.prepare'));
  assert.ok(objService.authorizeSession(ADMIN_TOKEN, 'employees.manage'));
  assert.equal(objService.authorizeSession(ADMIN_TOKEN, 'admins.create'), null);
  assert.equal(objService.authorizeSession(ADMIN_TOKEN, '__proto__'), null);
  assert.equal(canPerformAction('owner', 'menu.edit'), true);
  assert.equal(canPerformAction('admin', 'unknown'), false);
  assert.equal(objDatabase.prepare("SELECT last_activity_at FROM staff_sessions WHERE id = 'admin-session'").get().last_activity_at, '2026-10-21T12:10:00.000Z');
}));

test('invalid and unknown bearer values fail without refreshing any session', () => withSessions((objDatabase, objService) => {
  for (const objToken of [null, {}, '', 'bad', "' OR 1=1 --", 'f'.repeat(64), '1'.repeat(10000)]) {
    assert.equal(objService.validateSession(objToken), null);
  }
  assert.equal(objService.authorizeSession(EMPLOYEE_TOKEN, 'unknown'), null);
  assert.equal(objDatabase.prepare("SELECT last_activity_at FROM staff_sessions WHERE id = 'employee-session'").get().last_activity_at, '2026-10-21T12:00:00.000Z');
}));

test('the complete staff permission matrix separates owner business controls', () => {
  for (const strAction of ['orders.read', 'orders.prepare', 'availability.update']) {
    assert.equal(canPerformAction('employee', strAction), true);
    assert.equal(canPerformAction('admin', strAction), true);
  }
  for (const strAction of ['employees.manage', 'cancellation.decide', 'refund.approve', 'analytics.read']) {
    assert.equal(canPerformAction('employee', strAction), false);
    assert.equal(canPerformAction('admin', strAction), true);
  }
  for(const strAction of ['menu.edit','hours.manage','staff.roles.change']) {
    assert.equal(canPerformAction('owner',strAction),true);
    assert.equal(canPerformAction('admin',strAction),false);
    assert.equal(canPerformAction('employee',strAction),false);
  }
  assert.equal(canPerformAction('admin', 'admins.create'), false);
  assert.equal(canPerformAction(null, 'orders.read'), false);
});

test('disabled users, revoked sessions and admin sessions missing MFA are denied', () => withSessions((objDatabase, objService) => {
  objDatabase.exec("UPDATE staff_users SET state = 'disabled', disabled_at = '2026-10-21T12:05:00.000Z' WHERE id = 'employee'");
  assert.equal(objService.validateSession(EMPLOYEE_TOKEN), null);
  // Remove only this isolated fixture's insert guard to exercise the service's
  // independent rejection of active legacy records missing MFA evidence.
  objDatabase.exec('DROP TRIGGER session_validate_insert');
  objDatabase.prepare(`INSERT INTO staff_sessions
    (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at, revoked_at)
    VALUES ('legacy', 'admin', ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z', '2026-10-21T20:00:00.000Z', NULL)`)
    .run(createHash('sha256').update('4'.repeat(64)).digest('hex'));
  assert.equal(objService.validateSession('4'.repeat(64)), null);
  assert.equal(objService.revokeSession(ADMIN_TOKEN), true);
  assert.equal(objService.validateSession(ADMIN_TOKEN), null);
  assert.equal(objService.revokeSession(ADMIN_TOKEN), false);
}));

test('revocation and its audit record commit together or both roll back', () => withSessions((objDatabase, objService) => {
  objDatabase.exec(`CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON audit_events
    BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`);
  assert.throws(() => objService.revokeSession(EMPLOYEE_TOKEN), /synthetic audit failure/);
  assert.equal(objDatabase.prepare("SELECT revoked_at FROM staff_sessions WHERE id = 'employee-session'").get().revoked_at, null);
  objDatabase.exec('DROP TRIGGER fixture_audit_failure');
  assert.equal(objService.revokeSession(EMPLOYEE_TOKEN), true);
  assert.equal(objService.revokeSession(EMPLOYEE_TOKEN), false);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM audit_events').get().total, 1);
}));

test('invalid or backward server clocks fail closed without changing activity', () => withSessions((objDatabase, objService, fnSetTime) => {
  fnSetTime('2026-10-21T11:59:00.000Z');
  assert.equal(objService.validateSession(EMPLOYEE_TOKEN), null);
  fnSetTime('invalid');
  assert.throws(() => objService.validateSession(EMPLOYEE_TOKEN), /clock/i);
  assert.equal(objDatabase.prepare("SELECT last_activity_at FROM staff_sessions WHERE id = 'employee-session'").get().last_activity_at, '2026-10-21T12:00:00.000Z');
}));
