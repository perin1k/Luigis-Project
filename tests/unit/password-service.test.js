import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashPassword, verifyPassword } from '../../src/auth/password-service.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

const SYNTHETIC_PASSWORD = 'Synthetic passphrase — test only';
// Schema fixture only: these strings have the correct format but are not login hashes.
const FIXTURE_HASH = `scrypt-v1$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`;
const CHANGED_HASH = `scrypt-v1$131072$8$1$${'c'.repeat(32)}$${'d'.repeat(128)}`;

test('password hashes use random salts and verify without trimming or normalization', async () => {
  const strHash = await hashPassword(SYNTHETIC_PASSWORD);
  const strOtherHash = await hashPassword(SYNTHETIC_PASSWORD);
  assert.notEqual(strHash, strOtherHash);
  assert.match(strHash, /^scrypt-v1\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(strHash.includes(SYNTHETIC_PASSWORD), false);
  assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, strHash), true);
  assert.equal(await verifyPassword(`${SYNTHETIC_PASSWORD} `, strHash), false);
  assert.equal(await verifyPassword('incorrect synthetic password', strHash), false);
});

test('malformed hashes and attacker-controlled costs fail closed', async () => {
  for (const objHash of [null, {}, '', 'plaintext', `${FIXTURE_HASH}\n`,
    FIXTURE_HASH.replace('131072', '1073741824'), FIXTURE_HASH.replace('$8$', '$800$'),
    FIXTURE_HASH.replace('scrypt-v1', 'scrypt-v2'), FIXTURE_HASH.slice(0, -1), 'x'.repeat(10000)]) {
    assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, objHash), false);
  }
  for (const objPassword of [null, {}, '', 'x'.repeat(1025), '\ud800']) {
    await assert.rejects(hashPassword(objPassword), /password/i);
    assert.equal(await verifyPassword(objPassword, FIXTURE_HASH), false);
  }
});

test('password size boundary is measured in UTF-8 bytes', async () => {
  await assert.rejects(hashPassword('é'.repeat(513)), /password/i);
  const strPassword = 'é'.repeat(512);
  const strHash = await hashPassword(strPassword);
  assert.equal(await verifyPassword(strPassword, strHash), true);
});

test('credentials enforce staff relationships, username uniqueness and safe hash format', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    objDatabase.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at)
      VALUES ('staff1', 'synthetic-1', 'employee', '2026-10-21T10:00:00.000Z'),
        ('staff2', 'synthetic-2', 'employee', '2026-10-21T10:00:00.000Z')`);
    const objInsert = objDatabase.prepare(`INSERT INTO staff_credentials
      (user_id, username, password_hash, created_at, password_changed_at)
      VALUES (?, ?, ?, '2026-10-21T11:00:00.000Z', '2026-10-21T11:00:00.000Z')`);
    assert.throws(() => objInsert.run('missing', 'missing', FIXTURE_HASH));
    assert.throws(() => objInsert.run('staff1', 'staff.one', 'plaintext'));
    assert.throws(() => objInsert.run('staff1', 'UpperCase', FIXTURE_HASH));
    objInsert.run('staff1', 'staff.one', FIXTURE_HASH);
    assert.throws(() => objInsert.run('staff2', 'staff.one', FIXTURE_HASH));
    assert.throws(() => objDatabase.exec("UPDATE staff_credentials SET password_changed_at = 'not-a-date'"));
    assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { objDatabase.close(); }
});

test('credential changes revoke sessions atomically and require a new revision', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    objDatabase.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at)
      VALUES ('staff1', 'synthetic-1', 'employee', '2026-10-21T10:00:00.000Z');
      INSERT INTO staff_sessions (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at)
      VALUES ('session1', 'staff1', '${'e'.repeat(64)}', '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:00.000Z', '2026-10-21T20:00:00.000Z');`);
    objDatabase.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
      VALUES ('staff1', 'staff.one', ?, '2026-10-21T11:00:00.000Z', '2026-10-21T11:00:00.000Z')`).run(FIXTURE_HASH);
    assert.throws(() => objDatabase.prepare('UPDATE staff_credentials SET password_hash = ?').run(CHANGED_HASH));
    assert.throws(() => objDatabase.prepare(`UPDATE staff_credentials SET password_hash = ?, revision = 2,
      password_changed_at = '2026-10-21T11:30:00.000Z'`).run(CHANGED_HASH));
    assert.equal(objDatabase.prepare('SELECT password_hash FROM staff_credentials').get().password_hash, FIXTURE_HASH);
    assert.equal(objDatabase.prepare('SELECT revoked_at FROM staff_sessions').get().revoked_at, null);
    objDatabase.prepare(`UPDATE staff_credentials SET password_hash = ?, revision = 2,
      password_changed_at = '2026-10-21T12:10:00.000Z'`).run(CHANGED_HASH);
    assert.equal(objDatabase.prepare('SELECT revoked_at FROM staff_sessions').get().revoked_at, '2026-10-21T12:10:00.000Z');
    assert.throws(() => objDatabase.exec('INSERT OR REPLACE INTO staff_credentials SELECT * FROM staff_credentials'));
  } finally { objDatabase.close(); }
});

test('credential migration upgrades without creating accounts and rolls back failed upgrades', () => {
  const objDatabase = openDatabase(':memory:');
  const arrHistorical = ['catalog', 'orders', 'payments', 'scheduling', 'access-and-audit'].map((strName, intIndex) => ({
    intVersion: intIndex + 1, strName,
    strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
  }));
  try {
    applyMigrations(objDatabase, arrHistorical);
    assert.throws(() => applyMigrations(objDatabase, [...arrHistorical, {
      intVersion: 6, strName: 'auth-credentials',
      strSql: readFileSync(new URL('../../src/data/migrations/006-auth-credentials.sql', import.meta.url), 'utf8') + '\nINVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 5);
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'staff_credentials'").get(), undefined);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM staff_credentials').get().total, 0);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM staff_users').get().total, 0);
  } finally { objDatabase.close(); }
});
