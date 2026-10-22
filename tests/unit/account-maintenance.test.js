import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { hashPassword, verifyPassword } from '../../src/auth/password-service.js';
import { createStaffAccountService } from '../../src/auth/staff-account-service.js';
import { createStaffEnrollmentService } from '../../src/auth/staff-enrollment-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createSessionService } from '../../src/auth/session-service.js';
import { canPerformAction } from '../../src/auth/permissions.js';

const PASSWORD = 'Synthetic current basil lantern';
const NEW_PASSWORD = 'Synthetic replacement olive orchard';
const STR_HASH = await hashPassword(PASSWORD);
const ADMIN_TOKEN = 'a'.repeat(64); const EMPLOYEE_TOKEN = 'b'.repeat(64);
function fixture() {
  const objDb = openDatabase(':memory:'); applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:00:00.000Z');
  const fnNow = () => new Date(numNow);
  for (const [strId, strRole, strToken] of [['admin', 'admin', ADMIN_TOKEN], ['employee', 'employee', EMPLOYEE_TOKEN], ['other', 'employee', 'c'.repeat(64)]]) {
    objDb.prepare('INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES (?, ?, ?, ?)').run(strId, `synthetic:${strId}`, strRole, fnNow().toISOString());
    objDb.prepare('INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?)')
      .run(strId, strId, STR_HASH, fnNow().toISOString(), fnNow().toISOString());
    objDb.prepare(`INSERT INTO staff_sessions (id, user_id, session_token_digest, authenticated_at, last_activity_at, mfa_verified_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, '2026-10-21T20:00:00.000Z')`).run(`${strId}-session`, strId, createHash('sha256').update(strToken).digest('hex'),
      fnNow().toISOString(), fnNow().toISOString(), strRole === 'admin' ? fnNow().toISOString() : null);
  }
  const objMfa = createMfaService(objDb, { strEncryptionKeyHex: 'bc'.repeat(32), fnNow });
  const objEnrollment = objMfa.beginEnrollment('admin');
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  objMfa.confirmEnrollment('admin', objEnrollment.strEnrollmentId, objTotp.generate({ timestamp: numNow }));
  numNow += 30000;
  return { objDb, fnNow, objService: createStaffAccountService(objDb, { fnNow, objMfaService: objMfa }),
    objInvites: createStaffEnrollmentService(objDb, { fnNow }), code: () => objTotp.generate({ timestamp: numNow }),
    advance: (intMs) => { numNow += intMs; }, close: () => { objMfa.destroy(); objDb.close(); } };
}

test('only admin can page employee/invitation lists and no secret field is serialized', () => {
  const obj = fixture();
  try {
    const objInvite = obj.objInvites.issueInvitation(ADMIN_TOKEN, 'new.employee');
    obj.objInvites.issueInvitation(ADMIN_TOKEN, 'second.employee');
    assert.equal(obj.objService.listEmployees(EMPLOYEE_TOKEN), null);
    assert.equal(obj.objInvites.listInvitations(EMPLOYEE_TOKEN), null);
    const objFirst = obj.objService.listEmployees(ADMIN_TOKEN, 0, 1);
    const objSecond = obj.objService.listEmployees(ADMIN_TOKEN, 1, 1);
    assert.equal(objFirst.arrEmployees.length, 1); assert.ok(objFirst.bHasMore);
    assert.notEqual(objFirst.arrEmployees[0].strUserId, objSecond.arrEmployees[0].strUserId);
    assert.equal(objSecond.bHasMore, false);
    assert.deepEqual(obj.objService.listEmployees(ADMIN_TOKEN, 100, 10).arrEmployees, []);
    const objInvites = obj.objInvites.listInvitations(ADMIN_TOKEN);
    assert.ok(objInvites.arrInvitations.some((objRow) => objRow.strInvitationId === objInvite.strInvitationId));
    assert.equal(obj.objInvites.listInvitations(ADMIN_TOKEN, 0, 1).bHasMore, true);
    assert.equal(obj.objInvites.listInvitations(ADMIN_TOKEN, 1, 1).bHasMore, false);
    const strSerialized = JSON.stringify([objFirst, objSecond, objInvites]);
    for (const strSecret of [objInvite.strInvitationToken, ADMIN_TOKEN, STR_HASH, 'password_hash', 'token_digest', 'issuer_epoch']) assert.ok(!strSerialized.includes(strSecret));
    for (const [intOffset, intLimit] of [[-1, 10], [0, 0], [0, 101], [1.5, 10], ['0', 10], [1000001, 10]]) {
      assert.equal(obj.objService.listEmployees(ADMIN_TOKEN, intOffset, intLimit), null);
      assert.equal(obj.objInvites.listInvitations(ADMIN_TOKEN, intOffset, intLimit), null);
    }
  } finally { obj.close(); }
});

test('employee changes only own credential, revokes sessions and audits atomically', async () => {
  const obj = fixture();
  try {
    assert.ok(canPerformAction('employee', 'account.password.change'));
    assert.ok(canPerformAction('admin', 'account.password.change'));
    assert.equal(canPerformAction('unknown', 'account.password.change'), false);
    assert.deepEqual(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'source'), { strState: 'password_changed' });
    const objCredential = obj.objDb.prepare("SELECT * FROM staff_credentials WHERE user_id='employee'").get();
    assert.equal(objCredential.revision, 2); assert.ok(await verifyPassword(NEW_PASSWORD, objCredential.password_hash));
    assert.equal(await verifyPassword(PASSWORD, objCredential.password_hash), false);
    assert.equal(obj.objDb.prepare("SELECT password_hash FROM staff_credentials WHERE user_id='other'").get().password_hash, STR_HASH);
    assert.equal(createSessionService(obj.objDb, { fnNow: obj.fnNow }).validateSession(EMPLOYEE_TOKEN), null);
    assert.equal(obj.objDb.prepare("SELECT actor_id FROM audit_events WHERE action='staff_change'").get().actor_id, 'employee');
  } finally { obj.close(); }
});

test('wrong current password, weak/same replacement and missing sessions never change credentials', async () => {
  const obj = fixture();
  try {
    assert.equal(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, 'wrong', NEW_PASSWORD, '', 'source'), null);
    assert.equal(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, 'weak', '', 'source'), null);
    assert.equal(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, PASSWORD, '', 'source'), null);
    assert.equal(await obj.objService.changeOwnPassword(undefined, PASSWORD, NEW_PASSWORD, '', 'source'), null);
    assert.equal(obj.objDb.prepare("SELECT password_hash FROM staff_credentials WHERE user_id='employee'").get().password_hash, STR_HASH);
  } finally { obj.close(); }
});

test('admin must supply a fresh MFA code; password change invalidates issued invitations', async () => {
  const obj = fixture();
  try {
    const objInvite = obj.objInvites.issueInvitation(ADMIN_TOKEN, 'new.employee');
    assert.equal(await obj.objService.changeOwnPassword(ADMIN_TOKEN, PASSWORD, NEW_PASSWORD, '', 'source'), null);
    assert.ok(await obj.objService.changeOwnPassword(ADMIN_TOKEN, PASSWORD, NEW_PASSWORD, obj.code(), 'source'));
    assert.equal(await obj.objInvites.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), null);
  } finally { obj.close(); }
});

test('concurrent password changes commit once and stale/deactivated sessions cannot complete', async () => {
  const obj = fixture();
  try {
    const arrResults = await Promise.all([
      obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'a'),
      obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, 'Another synthetic olive passphrase', '', 'b'),
    ]);
    assert.equal(arrResults.filter(Boolean).length, 1);
    assert.equal(obj.objDb.prepare("SELECT revision FROM staff_credentials WHERE user_id='employee'").get().revision, 2);
    const pChange = obj.objService.changeOwnPassword('c'.repeat(64), PASSWORD, NEW_PASSWORD, '', 'source');
    obj.objService.deactivateEmployee(ADMIN_TOKEN, 'other');
    assert.equal(await pChange, null);
  } finally { obj.close(); }
});

test('audit failure rolls back password, revocations and epoch; admitted throttle attempts remain', async () => {
  const obj = fixture();
  try {
    obj.objDb.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit_events WHEN NEW.action='staff_change' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    await assert.rejects(obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'source'), /synthetic failure/);
    assert.equal(obj.objDb.prepare("SELECT revision FROM staff_credentials WHERE user_id='employee'").get().revision, 1);
    assert.equal(obj.objDb.prepare("SELECT epoch FROM login_identity_versions WHERE user_id='employee'").get().epoch, 1);
    assert.equal(obj.objDb.prepare("SELECT revoked_at FROM staff_sessions WHERE id='employee-session'").get().revoked_at, null);
    obj.objDb.exec('DROP TRIGGER synthetic_failure');
    assert.ok(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'source'));
  } finally { obj.close(); }
});

test('persistent account throttling and session expiry prevent further password work', async () => {
  const obj = fixture();
  try {
    for (let intIndex = 0; intIndex < 5; intIndex++) assert.equal(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, 'wrong', NEW_PASSWORD, '', 'source'), null);
    const objOtherFactory = createStaffAccountService(obj.objDb, { fnNow: obj.fnNow });
    assert.equal(await objOtherFactory.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'different-source'), null);
    obj.advance(1800000);
    assert.equal(await obj.objService.changeOwnPassword(ADMIN_TOKEN, PASSWORD, NEW_PASSWORD, obj.code(), 'source'), null);
  } finally { obj.close(); }
});

test('source throttling and the process concurrency cap reject excess password work', async () => {
  const obj = fixture();
  try {
    const strBucket = createHash('sha256').update('password-change-source:blocked-source').digest('hex');
    obj.objDb.prepare('INSERT INTO login_limits VALUES (?, ?, 30)').run(strBucket, obj.fnNow().getTime());
    assert.equal(await obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'blocked-source'), null);
    const pFirst = obj.objService.changeOwnPassword(EMPLOYEE_TOKEN, PASSWORD, NEW_PASSWORD, '', 'a');
    const pSecond = obj.objService.changeOwnPassword('c'.repeat(64), PASSWORD, NEW_PASSWORD, '', 'b');
    assert.equal(await obj.objService.changeOwnPassword(ADMIN_TOKEN, PASSWORD, NEW_PASSWORD, obj.code(), 'c'), null);
    assert.ok(await pFirst); assert.ok(await pSecond);
  } finally { obj.close(); }
});
