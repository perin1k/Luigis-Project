import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

function seedOrder(objDatabase, strId) {
  objDatabase.prepare(`INSERT INTO orders (id, public_reference, service_type, catalog_version_id)
    VALUES (?, ?, 'carry-out', 'v1')`).run(strId, strId);
  objDatabase.prepare(`INSERT INTO order_contacts VALUES (?, 'Synthetic Guest', '0000000000', NULL, NULL)`).run(strId);
  objDatabase.prepare(`INSERT INTO order_lines VALUES (?, ?, 'v1', 1, 'drink', 2, 'Tea', 100, 200)`).run(`line-${strId}`, strId);
  objDatabase.prepare(`INSERT INTO drink_line_details VALUES (?, 'v1', 'tea', 'small', 'Tea', 'Small')`).run(`line-${strId}`);
  objDatabase.prepare(`INSERT INTO order_quotes
    (id, order_id, catalog_version_id, item_subtotal_cents, tax_cents, tip_cents, total_cents, currency,
    tax_policy_reference, rounding_policy_reference, expires_at)
    VALUES (?, ?, 'v1', 200, 20, 10, 230, 'USD', 'fixture-only', 'fixture-only', '2099-01-01T00:00:00.000Z')`)
    .run(`quote-${strId}`, strId);
  objDatabase.prepare('UPDATE order_quotes SET accepted_at = ? WHERE id = ?')
    .run('2026-10-21T12:00:00.000Z', `quote-${strId}`);
}

function seedFixture(objDatabase) {
  objDatabase.exec(`INSERT INTO catalog_versions (id, revision) VALUES ('v1', 1);
    INSERT INTO beverages VALUES ('tea', 'v1', 'tea', 'Tea', 1);
    INSERT INTO drink_sizes VALUES ('small', 'v1', 'small', 'Small', 1, 100);`);
  seedOrder(objDatabase, 'order1');
  seedOrder(objDatabase, 'order2');
}

function addEvent(objDatabase, strId = 'event1') {
  objDatabase.prepare(`INSERT INTO provider_events
    (id, provider, provider_event_id, event_type, occurred_at, verified_at)
    VALUES (?, 'stripe', ?, 'synthetic.fixture', '2026-10-21T12:00:00.000Z', '2026-10-21T12:00:01.000Z')`)
    .run(strId, `provider-${strId}`);
}

function addPayment(objDatabase, strId = 'payment1', strOrder = 'order1') {
  objDatabase.prepare(`INSERT INTO payment_attempts
    (id, order_id, quote_id, provider, idempotency_key, amount_cents, currency)
    VALUES (?, ?, ?, 'stripe', ?, 230, 'USD')`).run(strId, strOrder, `quote-${strOrder}`, `key-${strId}`);
}

function confirmPayment(objDatabase, strId = 'payment1', strEvent = 'event1') {
  objDatabase.prepare(`UPDATE payment_attempts SET state = 'succeeded', provider_payment_id = ?,
    paid_at = '2026-10-21T12:01:00.000Z', evidence_event_id = ? WHERE id = ?`)
    .run(`provider-${strId}`, strEvent, strId);
}

function approveCancellation(objDatabase, strId = 'cancel1', strOrder = 'order1') {
  objDatabase.prepare(`INSERT INTO cancellation_requests (id, order_id, source, reason_code)
    VALUES (?, ?, 'customer', 'synthetic-request')`).run(strId, strOrder);
  objDatabase.prepare(`UPDATE cancellation_requests SET state = 'approved',
    decided_at = '2026-10-21T12:02:00.000Z', decided_by = 'synthetic-admin', decision_reason = 'fixture'
    WHERE id = ?`).run(strId);
}

function addRefund(objDatabase, strId = 'refund1', strCancellation = 'cancel1') {
  objDatabase.prepare(`INSERT INTO refunds
    (id, order_id, payment_attempt_id, cancellation_request_id, idempotency_key,
    requested_cents, approved_by, policy_reference)
    VALUES (?, 'order1', 'payment1', ?, ?, 230, 'synthetic-admin', 'demo-full-refund-v1')`)
    .run(strId, strCancellation, `key-${strId}`);
}

function withDatabase(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    seedFixture(objDatabase);
    fnCheck(objDatabase);
  } finally { objDatabase.close(); }
}

test('payment migration upgrades existing orders and persists after reopening', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-payment-'));
  const strPath = join(strDirectory, 'test.sqlite');
  let objDatabase;
  try {
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase, ['catalog', 'orders'].map((strName, intIndex) => ({
      intVersion: intIndex + 1, strName,
      strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
    })));
    seedFixture(objDatabase);
    applyMigrations(objDatabase);
    addEvent(objDatabase); addPayment(objDatabase); confirmPayment(objDatabase);
    objDatabase.close();
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT state FROM payment_attempts').get().state, 'succeeded');
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM orders').get().total, 2);
    assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { objDatabase?.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});

test('provider events and payment retry keys reject duplicates and mismatched quotes', () => withDatabase((objDatabase) => {
  addEvent(objDatabase); addPayment(objDatabase);
  assert.throws(() => addEvent(objDatabase));
  assert.throws(() => objDatabase.exec("UPDATE provider_events SET provider_event_id = 'changed'"));
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET quote_id = 'quote-order2'"));
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET amount_cents = 229"));
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET amount_cents = 1.5"));
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET mode = 'live'"));
  objDatabase.exec("UPDATE payment_attempts SET provider_checkout_id = 'synthetic-checkout'");
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET provider_checkout_id = 'replacement'"));
  assert.throws(() => objDatabase.exec(`INSERT INTO payment_attempts
    (id, order_id, quote_id, provider, idempotency_key, amount_cents, currency)
    VALUES ('duplicate', 'order1', 'quote-order1', 'stripe', 'key-payment1', 230, 'USD')`));
}));

test('success requires evidence and preserves payment history without implying fulfillment', () => withDatabase((objDatabase) => {
  addPayment(objDatabase);
  assert.throws(() => confirmPayment(objDatabase));
  addEvent(objDatabase);
  objDatabase.exec('UPDATE provider_events SET verified_at = NULL');
  assert.throws(() => confirmPayment(objDatabase));
  objDatabase.exec("UPDATE provider_events SET verified_at = '2026-10-21T12:00:01.000Z'");
  confirmPayment(objDatabase);
  assert.throws(() => objDatabase.exec("UPDATE payment_attempts SET state = 'failed', paid_at = NULL"));
  assert.throws(() => objDatabase.exec('DELETE FROM payment_attempts'));
  assert.throws(() => objDatabase.exec('INSERT OR REPLACE INTO payment_attempts SELECT * FROM payment_attempts'));
  assert.equal(objDatabase.prepare("SELECT fulfillment_status FROM orders WHERE id = 'order1'").get().fulfillment_status, null);
}));

test('cancellation holds block preparation and customer requests after preparation', () => withDatabase((objDatabase) => {
  objDatabase.exec("INSERT INTO cancellation_requests (id, order_id, source, reason_code) VALUES ('pending', 'order1', 'customer', 'fixture')");
  assert.throws(() => objDatabase.exec("INSERT INTO cancellation_requests (id, order_id, source, reason_code) VALUES ('second', 'order1', 'customer', 'fixture')"));
  assert.throws(() => objDatabase.exec("UPDATE orders SET fulfillment_status = 'Preparing' WHERE id = 'order1'"));
  objDatabase.exec("UPDATE cancellation_requests SET state = 'denied', decided_at = '2026-10-21T12:00:00.000Z', decided_by = 'synthetic-admin', decision_reason = 'fixture'");
  objDatabase.exec("UPDATE orders SET fulfillment_status = 'Preparing' WHERE id = 'order1'");
  assert.throws(() => approveCancellation(objDatabase));
  objDatabase.exec("INSERT INTO cancellation_requests (id, order_id, source, reason_code) VALUES ('exception', 'order1', 'restaurant', 'inventory')");
}));

test('refunds require matching approved cancellation and successful payment; reserve full amount', () => withDatabase((objDatabase) => {
  addEvent(objDatabase); addPayment(objDatabase);
  approveCancellation(objDatabase);
  assert.throws(() => addRefund(objDatabase));
  confirmPayment(objDatabase);
  approveCancellation(objDatabase, 'other', 'order2');
  assert.throws(() => addRefund(objDatabase, 'bad', 'other'));
  addRefund(objDatabase);
  assert.equal(objDatabase.prepare('SELECT state, confirmed_cents FROM refunds').get().state, 'pending');
  assert.equal(objDatabase.prepare('SELECT confirmed_cents FROM refunds').get().confirmed_cents, null);
  assert.throws(() => addRefund(objDatabase, 'over'));
  assert.throws(() => objDatabase.exec('UPDATE refunds SET requested_cents = 229'));
  assert.throws(() => objDatabase.exec("UPDATE refunds SET state = 'succeeded'"));
  objDatabase.exec("UPDATE refunds SET state = 'failed', failed_at = '2026-10-21T12:03:00.000Z'");
  addRefund(objDatabase, 'retry');
  assert.throws(() => objDatabase.exec("UPDATE refunds SET state = 'pending', failed_at = NULL WHERE id = 'refund1'"));
}));

test('confirmed refunds remain immutable and retain provider-confirmed amount', () => withDatabase((objDatabase) => {
  addEvent(objDatabase); addPayment(objDatabase); confirmPayment(objDatabase);
  approveCancellation(objDatabase); addRefund(objDatabase); addEvent(objDatabase, 'refund-event');
  objDatabase.exec(`UPDATE refunds SET state = 'succeeded', confirmed_cents = 230,
    provider_refund_id = 'test-refund', evidence_event_id = 'refund-event', confirmed_at = '2026-10-21T12:04:00.000Z'`);
  assert.throws(() => objDatabase.exec('UPDATE refunds SET confirmed_cents = 231'));
  assert.throws(() => objDatabase.exec('DELETE FROM refunds'));
  assert.throws(() => addRefund(objDatabase, 'excess'));
}));

test('financial allocations are append-only, bounded and reverse only their own captured components', () => withDatabase((objDatabase) => {
  addEvent(objDatabase); addPayment(objDatabase); confirmPayment(objDatabase);
  const objInsert = objDatabase.prepare(`INSERT INTO financial_allocations
    (id, order_id, payment_attempt_id, refund_id, order_line_id, component, signed_cents, effective_at, source_reference, reversal_of_id)
    VALUES (?, 'order1', 'payment1', ?, ?, ?, ?, '2026-10-21T12:01:00.000Z', ?, ?)`);
  objInsert.run('items', null, 'line-order1', 'item', 200, 'capture', null);
  objInsert.run('tax', null, null, 'tax', 20, 'capture', null);
  objInsert.run('tip', null, null, 'tip', 10, 'capture', null);
  assert.throws(() => objInsert.run('duplicate', null, null, 'tax', 1, 'capture', null));
  assert.throws(() => objInsert.run('excess', null, 'line-order1', 'item', 1, 'extra', null));
  assert.throws(() => objInsert.run('cross', null, 'line-order2', 'item', 1, 'cross', null));
  assert.throws(() => objInsert.run('fee', null, null, 'retained_fee_recovery', 10, 'fee', null));
  assert.throws(() => objDatabase.exec('UPDATE financial_allocations SET signed_cents = 0'));
  assert.throws(() => objDatabase.exec('DELETE FROM financial_allocations'));
  approveCancellation(objDatabase); addRefund(objDatabase); addEvent(objDatabase, 'refund-event');
  objDatabase.exec(`UPDATE refunds SET state = 'succeeded', confirmed_cents = 230, provider_refund_id = 'test-refund',
    evidence_event_id = 'refund-event', confirmed_at = '2026-10-21T12:04:00.000Z'`);
  objInsert.run('reverse-items', 'refund1', 'line-order1', 'item', -200, 'refund', 'items');
  assert.throws(() => objInsert.run('wrong-tax', 'refund1', null, 'tax', -21, 'refund', 'tax'));
  objInsert.run('reverse-tax', 'refund1', null, 'tax', -20, 'refund', 'tax');
  objInsert.run('reverse-tip', 'refund1', null, 'tip', -10, 'refund', 'tip');
  assert.equal(objDatabase.prepare('SELECT sum(signed_cents) AS total FROM financial_allocations').get().total, 0);
}));

test('duplicate callback write rolls back event processing and financial mutations together', () => withDatabase((objDatabase) => {
  addEvent(objDatabase); addPayment(objDatabase);
  assert.throws(() => runTransaction(objDatabase, () => {
    confirmPayment(objDatabase);
    objDatabase.exec("UPDATE provider_events SET processing_state = 'processed', processed_at = '2026-10-21T12:01:00.000Z'");
    addEvent(objDatabase);
  }));
  assert.equal(objDatabase.prepare('SELECT state FROM payment_attempts').get().state, 'pending');
  assert.equal(objDatabase.prepare('SELECT processing_state FROM provider_events').get().processing_state, 'pending');
}));

test('competing connections cannot reserve two full refunds for one payment', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-refund-race-'));
  const strPath = join(strDirectory, 'test.sqlite');
  const objFirst = openDatabase(strPath);
  let objSecond;
  try {
    applyMigrations(objFirst); seedFixture(objFirst);
    addEvent(objFirst); addPayment(objFirst); confirmPayment(objFirst); approveCancellation(objFirst);
    objSecond = openDatabase(strPath);
    objSecond.exec('PRAGMA busy_timeout = 0');
    runTransaction(objFirst, () => {
      addRefund(objFirst);
      assert.throws(() => addRefund(objSecond, 'competing'), /locked/);
    });
    assert.throws(() => addRefund(objSecond, 'competing'), /UNIQUE/);
    assert.equal(objSecond.prepare("SELECT count(*) AS total FROM refunds WHERE state = 'pending'").get().total, 1);
  } finally {
    objSecond?.close(); objFirst.close(); rmSync(strDirectory, { recursive: true, force: true });
  }
});

test('failed financial migration restores the existing order schema and version', () => {
  const objDatabase = openDatabase(':memory:');
  const arrHistorical = ['catalog', 'orders'].map((strName, intIndex) => ({
    intVersion: intIndex + 1, strName,
    strSql: readFileSync(new URL(`../../src/data/migrations/00${intIndex + 1}-${strName}.sql`, import.meta.url), 'utf8'),
  }));
  try {
    applyMigrations(objDatabase, arrHistorical); seedFixture(objDatabase);
    assert.throws(() => applyMigrations(objDatabase, [...arrHistorical, {
      intVersion: 3, strName: 'payments',
      strSql: readFileSync(new URL('../../src/data/migrations/003-payments.sql', import.meta.url), 'utf8') + '\nINVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 2);
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'payment_attempts'").get(), undefined);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM orders').get().total, 2);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM payment_attempts').get().total, 0);
  } finally { objDatabase.close(); }
});
