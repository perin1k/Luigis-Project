import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

function seedOrders(objDatabase) {
  objDatabase.exec(`INSERT INTO catalog_versions (id, revision) VALUES ('v1', 1);
    INSERT INTO orders (id, public_reference, service_type, catalog_version_id)
    VALUES ('order1', 'SYNTHETIC-1', 'carry-out', 'v1'), ('order2', 'SYNTHETIC-2', 'dine-in', 'v1');`);
}

function seedSchedule(objDatabase) {
  objDatabase.exec(`INSERT INTO service_days
    (id, service_date, opens_at, closes_at, cutoff_at, latest_pickup_at)
    VALUES ('day1', '2026-10-21', '2026-10-21T15:00:00.000Z', '2026-10-22T04:00:00.000Z',
      '2026-10-22T03:30:00.000Z', '2026-10-22T03:50:00.000Z');
    INSERT INTO service_days (id, service_date, is_closed) VALUES ('day2', '2026-10-22', 1);
    INSERT INTO fulfillment_bookings
    (id, order_id, service_day_id, selection_type, promised_at, minimum_lead_minutes, capacity_policy_reference)
    VALUES ('booking1', 'order1', 'day1', 'scheduled', '2026-10-21T16:00:00.000Z', 20, 'demo-six-per-20m-v1');
    INSERT INTO capacity_windows (id, service_day_id, starts_at, ends_at, capacity_units, policy_reference)
    VALUES ('window1', 'day1', '2026-10-21T16:00:00.000Z', '2026-10-21T16:20:00.000Z', 6, 'demo-six-per-20m-v1');`);
}

function addHold(objDatabase, strId = 'hold1', strExpiresAt = '2026-10-21T15:50:00.000Z') {
  objDatabase.prepare(`INSERT INTO capacity_holds
    (id, booking_id, capacity_window_id, service_day_id, reserved_units, created_at, expires_at)
    VALUES (?, 'booking1', 'window1', 'day1', 2, '2026-10-21T15:20:00.000Z', ?)`).run(strId, strExpiresAt);
}

function withDatabase(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase); seedOrders(objDatabase); seedSchedule(objDatabase);
    fnCheck(objDatabase);
  } finally { objDatabase.close(); }
}

function historicalMigrations() {
  return ['catalog', 'orders', 'payments'].map((strName, intIndex) => ({
    intVersion: intIndex + 1, strName,
    strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
  }));
}

test('scheduling upgrade preserves existing orders and promised instants after reopening', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-schedule-'));
  const strPath = join(strDirectory, 'test.sqlite');
  let objDatabase;
  try {
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase, historicalMigrations()); seedOrders(objDatabase);
    applyMigrations(objDatabase); seedSchedule(objDatabase); addHold(objDatabase);
    objDatabase.close();
    objDatabase = openDatabase(strPath); applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT promised_at FROM fulfillment_bookings').get().promised_at, '2026-10-21T16:00:00.000Z');
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM orders').get().total, 2);
    assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { objDatabase?.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});

test('service days reject invalid dates, UTC representations and reversed hours', () => withDatabase((objDatabase) => {
  for (const strSql of [
    "UPDATE service_days SET service_date = '2026-02-30' WHERE id = 'day1'",
    "UPDATE service_days SET timezone = 'America/New_York' WHERE id = 'day1'",
    "UPDATE service_days SET opens_at = '2026-10-21 15:00:00' WHERE id = 'day1'",
    "UPDATE service_days SET closes_at = opens_at WHERE id = 'day1'",
    "UPDATE service_days SET cutoff_at = closes_at WHERE id = 'day1'",
    "UPDATE service_days SET is_closed = 0 WHERE id = 'day2'",
  ]) assert.throws(() => objDatabase.exec(strSql), strSql);
}));

test('bookings and holds enforce ownership, policy and timestamp consistency', () => withDatabase((objDatabase) => {
  assert.throws(() => addHold(objDatabase, 'bad-duration', '2026-10-21T15:50:00.500Z'), /CHECK/);
  assert.throws(() => addHold(objDatabase, 'bad-format', 'not-a-timestamp'), /CHECK/);
  addHold(objDatabase);
  assert.throws(() => addHold(objDatabase, 'duplicate'));
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET service_day_id = 'day2'"));
  assert.throws(() => objDatabase.exec('UPDATE capacity_holds SET reserved_units = 1.5'));
  assert.throws(() => objDatabase.exec('UPDATE capacity_holds SET reserved_units = 7'));
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET expires_at = '2026-10-21T15:51:00.000Z'"));
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET expires_at = '2026-10-21T15:50:00.500Z'"));
  assert.throws(() => objDatabase.exec("UPDATE capacity_windows SET ends_at = '2026-10-21T16:21:00.000Z'"));
  assert.throws(() => objDatabase.exec('UPDATE capacity_windows SET capacity_units = 12'));
  objDatabase.exec(`INSERT INTO capacity_windows (id, service_day_id, starts_at, ends_at, capacity_units, policy_reference)
    VALUES ('other-day', 'day2', '2026-10-22T16:00:00.000Z', '2026-10-22T16:20:00.000Z', 6, 'demo-six-per-20m-v1')`);
  assert.throws(() => objDatabase.exec(`INSERT INTO capacity_holds
    (id, booking_id, capacity_window_id, service_day_id, reserved_units, created_at, expires_at)
    VALUES ('mismatch', 'booking1', 'other-day', 'day1', 1, '2026-10-21T15:20:00.000Z', '2026-10-21T15:50:00.000Z')`), /match/);
  assert.throws(() => objDatabase.exec('UPDATE fulfillment_bookings SET minimum_lead_minutes = 19'));
  assert.throws(() => objDatabase.exec("UPDATE fulfillment_bookings SET promised_at = '2026-10-21T16:20:00.000Z'"));
  assert.throws(() => objDatabase.exec("INSERT INTO fulfillment_bookings SELECT 'other', order_id, service_day_id, selection_type, promised_at, minimum_lead_minutes, capacity_policy_reference, revision FROM fulfillment_bookings"));
}));

test('holds confirm or expire explicitly and cannot silently reopen', () => withDatabase((objDatabase) => {
  addHold(objDatabase);
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'expired'"));
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'confirmed'"));
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'confirmed', confirmed_at = '2026-10-21T15:51:00.000Z'"));
  objDatabase.exec("UPDATE capacity_holds SET state = 'confirmed', confirmed_at = '2026-10-21T15:30:00.000Z'");
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'active', confirmed_at = NULL"));
  objDatabase.exec("UPDATE capacity_holds SET state = 'released', released_at = '2026-10-21T15:35:00.000Z'");
  assert.equal(objDatabase.prepare('SELECT confirmed_at FROM capacity_holds').get().confirmed_at, '2026-10-21T15:30:00.000Z');
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'active', released_at = NULL, confirmed_at = NULL"));
  addHold(objDatabase, 'hold2');
  assert.throws(() => objDatabase.exec("UPDATE capacity_holds SET state = 'expired', released_at = '2026-10-21T15:49:00.000Z' WHERE id = 'hold2'"));
  objDatabase.exec("UPDATE capacity_holds SET state = 'expired', released_at = '2026-10-21T15:50:00.000Z' WHERE id = 'hold2'");
  assert.throws(() => objDatabase.exec('DELETE FROM capacity_holds'));
}));

test('ASAP instants need not follow scheduled slot grid; service-hours changes preserve promises', () => withDatabase((objDatabase) => {
  objDatabase.exec(`INSERT INTO fulfillment_bookings
    (id, order_id, service_day_id, selection_type, promised_at, minimum_lead_minutes, capacity_policy_reference)
    VALUES ('asap', 'order2', 'day1', 'ASAP', '2026-10-21T16:05:00.000Z', 20, 'demo-six-per-20m-v1')`);
  objDatabase.exec(`UPDATE service_days SET closes_at = '2026-10-22T03:00:00.000Z',
    cutoff_at = '2026-10-22T02:30:00.000Z', latest_pickup_at = '2026-10-22T02:50:00.000Z' WHERE id = 'day1'`);
  assert.equal(objDatabase.prepare("SELECT promised_at FROM fulfillment_bookings WHERE id = 'asap'").get().promised_at, '2026-10-21T16:05:00.000Z');
}));

test('order events are append-only with unique sequences and valid status labels', () => withDatabase((objDatabase) => {
  objDatabase.exec(`INSERT INTO order_events (id, order_id, sequence, event_type, from_status, to_status, occurred_at)
    VALUES ('event1', 'order1', 1, 'status-change', NULL, 'Received', '2026-10-21T15:30:00.000Z')`);
  assert.throws(() => objDatabase.exec("INSERT INTO order_events SELECT 'duplicate', order_id, sequence, event_type, from_status, to_status, occurred_at, actor_id, reason_code FROM order_events"));
  assert.throws(() => objDatabase.exec('UPDATE order_events SET sequence = 2'));
  assert.throws(() => objDatabase.exec('DELETE FROM order_events'));
  assert.throws(() => objDatabase.exec('INSERT OR REPLACE INTO order_events SELECT * FROM order_events'));
  assert.throws(() => objDatabase.exec(`INSERT INTO order_events (id, order_id, sequence, event_type, to_status, occurred_at)
    VALUES ('bad', 'order1', 2, 'status-change', 'Delivered', '2026-10-21T15:40:00.000Z')`));
}));

test('reviews require explicit resolution and preserve the original trigger', () => withDatabase((objDatabase) => {
  objDatabase.exec(`INSERT INTO fulfillment_reviews (id, order_id, trigger_type, trigger_reference, opened_at)
    VALUES ('review1', 'order1', 'hours_change', 'synthetic-change-1', '2026-10-21T15:30:00.000Z')`);
  assert.throws(() => objDatabase.exec("UPDATE fulfillment_reviews SET state = 'resolved'"));
  assert.throws(() => objDatabase.exec("UPDATE fulfillment_reviews SET order_id = 'order2'"));
  objDatabase.exec(`UPDATE fulfillment_reviews SET state = 'resolved', resolved_at = '2026-10-21T15:40:00.000Z',
    resolved_by = 'synthetic-admin', resolution = 'Reviewed synthetic booking'`);
  assert.throws(() => objDatabase.exec('DELETE FROM fulfillment_reviews'));
  assert.throws(() => objDatabase.exec("UPDATE fulfillment_reviews SET resolution = 'Changed history'"));
}));

test('failed migration and malformed booking transaction preserve existing data', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    const arrHistorical = historicalMigrations();
    applyMigrations(objDatabase, arrHistorical); seedOrders(objDatabase);
    assert.throws(() => applyMigrations(objDatabase, [...arrHistorical, {
      intVersion: 4, strName: 'scheduling',
      strSql: readFileSync(new URL('../../src/data/migrations/004-scheduling.sql', import.meta.url), 'utf8') + '\nINVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 3);
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'service_days'").get(), undefined);
    applyMigrations(objDatabase);
    assert.throws(() => runTransaction(objDatabase, () => {
      seedSchedule(objDatabase); addHold(objDatabase);
      objDatabase.exec("UPDATE capacity_holds SET state = 'confirmed'");
    }));
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM service_days').get().total, 0);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM orders').get().total, 2);
  } finally { objDatabase.close(); }
});
