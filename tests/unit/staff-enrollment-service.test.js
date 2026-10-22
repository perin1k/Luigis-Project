import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { createStaffEnrollmentService } from '../../src/auth/staff-enrollment-service.js';
import { createLoginService } from '../../src/auth/login-service.js';

const ADMIN_TOKEN = 'a'.repeat(64);
const EMPLOYEE_TOKEN = 'b'.repeat(64);
const PASSWORD = 'Synthetic enrollment lantern basil';
function fixture(strPath = ':memory:') {
  const objDb = openDatabase(strPath); applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:10:00.000Z');
  const fnNow = () => new Date(numNow);
  if (!objDb.prepare('SELECT id FROM staff_users LIMIT 1').get()) {
    objDb.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES
      ('admin', 'synthetic-admin', 'admin', '2026-10-21T12:00:00.000Z'),
      ('employee', 'synthetic-employee', 'employee', '2026-10-21T12:00:00.000Z')`);
    for (const [strId, strToken] of [['admin', ADMIN_TOKEN], ['employee', EMPLOYEE_TOKEN]]) {
      objDb.prepare(`INSERT INTO staff_sessions
        (id, user_id, session_token_digest, authenticated_at, last_activity_at, mfa_verified_at, expires_at)
        VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z', ?, '2026-10-21T20:00:00.000Z')`)
        .run(`${strId}-session`, strId, createHash('sha256').update(strToken).digest('hex'), strId === 'admin' ? '2026-10-21T12:00:00.000Z' : null);
    }
  }
  return { objDb, fnNow, objService: createStaffEnrollmentService(objDb, { fnNow }),
    advance: (intMs) => { numNow += intMs; }, close: () => objDb.close() };
}

test('admin issues digest-only 24-hour invitation; acceptance creates only employee and supports password sign-in', async () => {
  const obj = fixture();
  try {
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'New.Employee');
    const objStored = obj.objDb.prepare('SELECT * FROM staff_invitations').get();
    assert.notEqual(objStored.token_digest, objInvite.strInvitationToken);
    assert.equal(objStored.issued_by, 'admin');
    assert.equal(Date.parse(objStored.expires_at) - Date.parse(objStored.created_at), 86400000);
    assert.deepEqual(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), { strState: 'enrolled' });
    const objUser = obj.objDb.prepare("SELECT u.* FROM staff_users u JOIN staff_credentials c ON c.user_id=u.id WHERE c.username='new.employee'").get();
    assert.equal(objUser.role, 'employee');
    assert.equal(obj.objDb.prepare('SELECT actor_id FROM audit_events').get().actor_id, 'admin');
    const objLogin = createLoginService(obj.objDb, { objMfaService: { verifyCode: () => false }, fnNow: obj.fnNow });
    assert.ok((await objLogin.beginSignIn('new.employee', PASSWORD, 'source')).strSessionToken);
    assert.equal(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), null);
    assert.throws(() => obj.objDb.exec("DELETE FROM staff_invitations"), /history/);
    assert.throws(() => obj.objDb.exec("UPDATE staff_invitations SET state='pending', closed_at=NULL, accepted_user_id=NULL"), /history/);
  } finally { obj.close(); }
});

test('permissions, duplicate pending names and revocation are enforced without account creation', async () => {
  const obj = fixture();
  try {
    assert.equal(obj.objService.issueInvitation(EMPLOYEE_TOKEN, 'new.employee'), null);
    assert.equal(obj.objService.issueInvitation(undefined, 'new.employee'), null);
    assert.equal(obj.objService.issueInvitation(ADMIN_TOKEN, 'bad username'), null);
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    assert.equal(obj.objService.issueInvitation(ADMIN_TOKEN, 'NEW.EMPLOYEE'), null);
    assert.equal(obj.objService.revokeInvitation(EMPLOYEE_TOKEN, objInvite.strInvitationId), null);
    assert.deepEqual(obj.objService.revokeInvitation(ADMIN_TOKEN, objInvite.strInvitationId), { strState: 'revoked' });
    assert.deepEqual(obj.objService.revokeInvitation(ADMIN_TOKEN, objInvite.strInvitationId), { strState: 'revoked' });
    assert.equal(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), null);
    assert.ok(obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee'));
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 2);
  } finally { obj.close(); }
});

test('expiry boundary and issuing-admin changes deny acceptance', async () => {
  for (const strScenario of ['expiry', 'disabled', 'epoch', 'clock']) {
    const obj = fixture();
    try {
      const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
      if (strScenario === 'expiry') obj.advance(86400000);
      if (strScenario === 'clock') obj.advance(-1);
      if (strScenario === 'disabled') obj.objDb.exec("UPDATE staff_users SET state='disabled',disabled_at='2026-10-21T12:10:00.000Z' WHERE id='admin'");
      if (strScenario === 'epoch') obj.objDb.exec("UPDATE staff_users SET revision=revision+1 WHERE id='admin'");
      assert.equal(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), null);
      assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 2);
    } finally { obj.close(); }
  }
});

test('revocation or expiry during password hashing invalidates the attempt', async () => {
  for (const strScenario of ['revoke', 'expiry']) {
    const obj = fixture();
    try {
      const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
      const pAccept = obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source');
      if (strScenario === 'revoke') obj.objService.revokeInvitation(ADMIN_TOKEN, objInvite.strInvitationId);
      else obj.advance(86400000);
      assert.equal(await pAccept, null);
    } finally { obj.close(); }
  }
});

test('two connections accepting the same token create exactly one employee', async () => {
  const strDir = mkdtempSync(join(tmpdir(), 'luigis-invitations-'));
  const obj = fixture(join(strDir, 'test.sqlite')); const objOther = fixture(join(strDir, 'test.sqlite'));
  try {
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    const arrResults = await Promise.all([obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'a'),
      objOther.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'b')]);
    assert.equal(arrResults.filter(Boolean).length, 1);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 3);
  } finally { objOther.close(); obj.close(); rmSync(strDir, { recursive: true, force: true }); }
});

test('audit failure rolls back account, credentials and token consumption; password policy rejects before hashing', async () => {
  const obj = fixture();
  try {
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    assert.equal(await obj.objService.acceptInvitation(objInvite.strInvitationToken, 'weak', 'source'), null);
    assert.equal(obj.objDb.prepare('SELECT attempt_count FROM staff_invitations').get().attempt_count, 0);
    obj.objDb.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    await assert.rejects(obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), /synthetic failure/);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 2);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_credentials').get().total, 0);
    assert.equal(obj.objDb.prepare('SELECT state FROM staff_invitations').get().state, 'pending');
    obj.objDb.exec('DROP TRIGGER synthetic_failure');
    assert.ok(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'));
  } finally { obj.close(); }
});

test('attempt and source limits deny expensive work', async () => {
  const obj = fixture();
  try {
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    obj.objDb.exec('UPDATE staff_invitations SET attempt_count=5');
    assert.equal(await obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source'), null);
    obj.objService.revokeInvitation(ADMIN_TOKEN, objInvite.strInvitationId);
    const objNext = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    const strBucket = createHash('sha256').update('enrollment-source:source').digest('hex');
    obj.objDb.prepare('INSERT INTO login_limits VALUES (?, ?, 30)').run(strBucket, obj.fnNow().getTime());
    assert.equal(await obj.objService.acceptInvitation(objNext.strInvitationToken, PASSWORD, 'source'), null);
    assert.equal(obj.objDb.prepare('SELECT attempt_count FROM staff_invitations WHERE id=?').get(objNext.strInvitationId).attempt_count, 0);
  } finally { obj.close(); }
});

test('username claimed during hashing cannot be overwritten and enrollment concurrency is bounded', async () => {
  const obj = fixture();
  try {
    const objInvite = obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee');
    const pAccept = obj.objService.acceptInvitation(objInvite.strInvitationToken, PASSWORD, 'source');
    const strSyntheticHash = `scrypt-v1$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`;
    obj.objDb.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
      VALUES ('employee', 'new.employee', ?, '2026-10-21T12:10:00.000Z', '2026-10-21T12:10:00.000Z')`).run(strSyntheticHash);
    assert.equal(await pAccept, null);
    assert.equal(obj.objDb.prepare("SELECT password_hash FROM staff_credentials WHERE user_id='employee'").get().password_hash, strSyntheticHash);
    assert.equal(obj.objService.issueInvitation(ADMIN_TOKEN, 'new.employee'), null);
    const arrInvites = ['first.user', 'second.user', 'third.user'].map((strName) => obj.objService.issueInvitation(ADMIN_TOKEN, strName));
    const pFirst = obj.objService.acceptInvitation(arrInvites[0].strInvitationToken, PASSWORD, 'source');
    const pSecond = obj.objService.acceptInvitation(arrInvites[1].strInvitationToken, PASSWORD, 'source');
    assert.equal(await obj.objService.acceptInvitation(arrInvites[2].strInvitationToken, PASSWORD, 'source'), null);
    assert.ok(await pFirst); assert.ok(await pSecond);
  } finally { obj.close(); }
});

test('migration upgrade preserves records and failed invitation migration rolls back', () => {
  const arrFiles = ['001-catalog.sql', '002-orders.sql', '003-payments.sql', '004-scheduling.sql', '005-access-and-audit.sql',
    '006-auth-credentials.sql', '007-mfa-secrets.sql', '008-login-controls.sql', '009-staff-invitations.sql'];
  const arrNames = ['catalog', 'orders', 'payments', 'scheduling', 'access-and-audit', 'auth-credentials', 'mfa-secrets', 'login-controls', 'staff-invitations'];
  const arrMigrations = arrFiles.map((strFile, intIndex) => ({ intVersion: intIndex + 1, strName: arrNames[intIndex],
    strSql: readFileSync(new URL(`../../src/data/migrations/${strFile}`, import.meta.url), 'utf8') }));
  const objDb = openDatabase(':memory:');
  try {
    applyMigrations(objDb, arrMigrations.slice(0, 8));
    objDb.exec("INSERT INTO staff_users (id, identity_subject, role) VALUES ('existing', 'synthetic-existing', 'employee')");
    assert.throws(() => applyMigrations(objDb, [...arrMigrations.slice(0, 8), { ...arrMigrations[8], strSql: arrMigrations[8].strSql + '\nINVALID SQL;' }]));
    assert.equal(objDb.prepare("SELECT name FROM sqlite_master WHERE name='staff_invitations'").get(), undefined);
    applyMigrations(objDb);
    assert.equal(objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 1);
  } finally { objDb.close(); }
});
