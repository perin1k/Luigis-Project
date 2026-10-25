import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

function seedOrder(objDatabase) {
  objDatabase.exec(`INSERT INTO catalog_versions (id, revision) VALUES ('v1', 1);
    INSERT INTO orders (id, public_reference, service_type, catalog_version_id)
    VALUES ('order1', 'SYNTHETIC-1', 'carry-out', 'v1'), ('order2', 'SYNTHETIC-2', 'dine-in', 'v1');
    INSERT INTO order_events (id, order_id, sequence, event_type, occurred_at)
    VALUES ('event1', 'order1', 1, 'synthetic-event', '2026-10-21T12:00:00.000Z');`);
}

function seedStaff(objDatabase) {
  objDatabase.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at)
    VALUES ('admin1', 'synthetic-admin', 'admin', '2026-10-21T10:00:00.000Z'),
      ('employee1', 'synthetic-employee', 'employee', '2026-10-21T10:00:00.000Z');`);
}

function addSession(objDatabase, strUser = 'employee1', strId = 'session1', strDigest = 'a'.repeat(64), strMfaAt = null) {
  objDatabase.prepare(`INSERT INTO staff_sessions
    (id, user_id, session_token_digest, authenticated_at, last_activity_at, expires_at, mfa_verified_at)
    VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z', '2026-10-21T12:10:00.000Z', '2026-10-21T20:00:00.000Z', ?)`)
    .run(strId, strUser, strDigest, strMfaAt);
}

function addGrant(objDatabase, strId = 'grant1', strOrder = 'order1', strDigest = 'b'.repeat(64), strExpiresAt = '2026-10-28T12:00:00.000Z') {
  objDatabase.prepare(`INSERT INTO tracking_grants (id, order_id, token_digest, created_at, expires_at)
    VALUES (?, ?, ?, '2026-10-21T12:00:00.000Z', ?)`).run(strId, strOrder, strDigest, strExpiresAt);
}

function withDatabase(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase); seedOrder(objDatabase); seedStaff(objDatabase); fnCheck(objDatabase);
  } finally { objDatabase.close(); }
}

function historicalMigrations() {
  return ['catalog', 'orders', 'payments', 'scheduling'].map((strName, intIndex) => ({
    intVersion: intIndex + 1, strName,
    strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
  }));
}

test('access migration preserves existing orders and persists digests after reopening', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-access-'));
  const strPath = join(strDirectory, 'test.sqlite');
  let objDatabase;
  try {
    objDatabase = openDatabase(strPath); applyMigrations(objDatabase, historicalMigrations()); seedOrder(objDatabase);
    applyMigrations(objDatabase); seedStaff(objDatabase); addSession(objDatabase); addGrant(objDatabase);
    objDatabase.close(); objDatabase = openDatabase(strPath); applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT session_token_digest FROM staff_sessions').get().session_token_digest, 'a'.repeat(64));
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM orders').get().total, 2);
    assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { objDatabase?.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});

test('sessions require active staff, unique hex digests and admin MFA markers', () => withDatabase((objDatabase) => {
  assert.throws(() => addSession(objDatabase, 'missing'));
  assert.throws(() => addSession(objDatabase, 'employee1', 'bad', 'raw-secret'));
  assert.throws(() => addSession(objDatabase, 'admin1'));
  addSession(objDatabase, 'admin1', 'admin-session', 'c'.repeat(64), '2026-10-21T12:01:00.000Z');
  assert.throws(() => addSession(objDatabase, 'employee1', 'duplicate', 'c'.repeat(64)));
  objDatabase.exec("UPDATE staff_users SET state = 'disabled', disabled_at = '2026-10-21T12:20:00.000Z' WHERE id = 'admin1'");
  assert.equal(objDatabase.prepare('SELECT revoked_at FROM staff_sessions').get().revoked_at, '2026-10-21T12:20:00.000Z');
  assert.throws(() => addSession(objDatabase, 'admin1', 'new', 'd'.repeat(64), '2026-10-21T12:01:00.000Z'));
  assert.throws(() => objDatabase.exec('UPDATE staff_sessions SET revoked_at = NULL'));
}));

test('session timestamps cannot extend absolute expiry or move activity backwards', () => withDatabase((objDatabase) => {
  addSession(objDatabase);
  assert.throws(() => objDatabase.exec("UPDATE staff_sessions SET expires_at = '2026-10-21T21:00:00.000Z'"));
  assert.throws(() => objDatabase.exec("UPDATE staff_sessions SET last_activity_at = '2026-10-21T12:09:00.000Z'"));
  assert.throws(() => objDatabase.exec("UPDATE staff_sessions SET last_activity_at = '2026-10-21T20:00:00.000Z'"));
  assert.throws(() => objDatabase.exec("UPDATE staff_sessions SET last_activity_at = '2026-10-21T12:40:00.000Z'"));
  objDatabase.exec("UPDATE staff_sessions SET last_activity_at = '2026-10-21T12:39:59.999Z'");
  assert.throws(() => objDatabase.exec("UPDATE staff_users SET role = 'admin' WHERE id = 'employee1'"));
  objDatabase.exec("UPDATE staff_sessions SET revoked_at = '2026-10-21T12:40:00.000Z'");
  objDatabase.exec("UPDATE staff_users SET role = 'admin' WHERE id = 'employee1'");
}));

test('MFA references retain history and revocation invalidates MFA-marked sessions', () => withDatabase((objDatabase) => {
  objDatabase.exec(`INSERT INTO mfa_references (id, user_id, provider_reference, enrolled_at)
    VALUES ('mfa1', 'admin1', 'synthetic-factor-reference', '2026-10-21T11:00:00.000Z')`);
  addSession(objDatabase, 'admin1', 'admin-session', 'c'.repeat(64), '2026-10-21T12:01:00.000Z');
  objDatabase.exec("UPDATE mfa_references SET state = 'revoked', revoked_at = '2026-10-21T12:20:00.000Z'");
  assert.equal(objDatabase.prepare('SELECT revoked_at FROM staff_sessions').get().revoked_at, '2026-10-21T12:20:00.000Z');
  assert.throws(() => objDatabase.exec('DELETE FROM mfa_references'));
  assert.throws(() => objDatabase.exec("UPDATE mfa_references SET state = 'active', revoked_at = NULL"));
}));

test('tracking replacements require revocation and cannot extend an established deadline', () => withDatabase((objDatabase) => {
  addGrant(objDatabase);
  assert.throws(() => addGrant(objDatabase, 'same-order', 'order1', 'e'.repeat(64)));
  assert.throws(() => addGrant(objDatabase, 'same-digest', 'order2'));
  objDatabase.exec("UPDATE tracking_grants SET revoked_at = '2026-10-21T12:20:00.000Z'");
  assert.throws(() => addGrant(objDatabase, 'extended', 'order1', 'e'.repeat(64), '2026-10-29T12:00:00.000Z'));
  assert.throws(() => addGrant(objDatabase, 'no-deadline', 'order1', 'e'.repeat(64), null));
  addGrant(objDatabase, 'replacement', 'order1', 'e'.repeat(64));
  assert.throws(() => objDatabase.exec("UPDATE tracking_grants SET token_digest = 'changed'"));
  assert.throws(() => objDatabase.exec("UPDATE tracking_grants SET expires_at = '2026-10-29T12:00:00.000Z' WHERE id = 'replacement'"));
}));

test('unresolved tracking deadlines may be assigned later without raw tokens or reversed timestamps', () => withDatabase((objDatabase) => {
  addGrant(objDatabase, 'unresolved', 'order1', 'e'.repeat(64), null);
  objDatabase.exec("UPDATE tracking_grants SET expires_at = '2026-10-28T12:00:00.000Z'");
  assert.throws(() => objDatabase.exec('UPDATE tracking_grants SET expires_at = NULL'));
  assert.throws(() => objDatabase.exec("UPDATE tracking_grants SET revoked_at = '2026-10-21T11:00:00.000Z'"));
  assert.throws(() => addGrant(objDatabase, 'raw', 'order2', 'raw-token'));
}));

test('notification records deduplicate source/channel/template and cannot claim delivery', () => withDatabase((objDatabase) => {
  objDatabase.exec(`INSERT INTO notification_outbox (id, order_id, source_event_id, channel, template_key, created_at)
    VALUES ('preview1', 'order1', 'event1', 'email', 'confirmation', '2026-10-21T12:00:00.000Z')`);
  assert.throws(() => objDatabase.exec(`INSERT INTO notification_outbox (id, order_id, source_event_id, channel, template_key)
    VALUES ('duplicate', 'order1', 'event1', 'email', 'confirmation')`));
  assert.throws(() => objDatabase.exec(`INSERT INTO notification_outbox (id, order_id, source_event_id, channel, template_key)
    VALUES ('wrong-order', 'order2', 'event1', 'sms', 'ready')`));
  assert.throws(() => objDatabase.exec("UPDATE notification_outbox SET state = 'delivered'"));
  assert.throws(() => objDatabase.exec("UPDATE notification_outbox SET sanitized_error_code = 'customer@example.invalid'"));
  objDatabase.exec("UPDATE notification_outbox SET state = 'previewed', previewed_at = '2026-10-21T12:01:00.000Z', attempt_count = 1");
  assert.equal(objDatabase.prepare('SELECT state FROM notification_outbox').get().state, 'previewed');
}));

test('audit summaries are allowlisted, actor-linked and append-only', () => withDatabase((objDatabase) => {
  const objInsert = objDatabase.prepare(`INSERT INTO audit_events
    (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, safe_change_summary)
    VALUES (?, ?, 'tracking_replacement', 'tracking_grant', 'grant1', '2026-10-21T12:20:00.000Z', 'synthetic-correlation', ?)`);
  assert.throws(() => objInsert.run('bad', 'missing', 'Tracking grant replaced'));
  assert.throws(() => objInsert.run('bad', 'admin1', 'raw-secret-or-contact'));
  objInsert.run('audit1', 'admin1', 'Tracking grant replaced');
  assert.throws(() => objDatabase.exec("UPDATE audit_events SET entity_id = 'changed'"));
  assert.throws(() => objDatabase.exec('DELETE FROM audit_events'));
  assert.throws(() => objDatabase.exec('INSERT OR REPLACE INTO audit_events SELECT * FROM audit_events'));
}));

test('access migration failures and invalid session transactions leave no partial writes', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    const arrHistorical = historicalMigrations();
    applyMigrations(objDatabase, arrHistorical); seedOrder(objDatabase);
    assert.throws(() => applyMigrations(objDatabase, [...arrHistorical, {
      intVersion: 5, strName: 'access-and-audit',
      strSql: readFileSync(new URL('../../src/data/migrations/005-access-and-audit.sql', import.meta.url), 'utf8') + '\nINVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 4);
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'staff_users'").get(), undefined);
    applyMigrations(objDatabase);
    assert.throws(() => runTransaction(objDatabase, () => { seedStaff(objDatabase); addSession(objDatabase, 'admin1'); }));
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM staff_users').get().total, 0);
  } finally { objDatabase.close(); }
});
