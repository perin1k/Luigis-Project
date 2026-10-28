import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

function seedCatalog(objDatabase) {
  objDatabase.exec(`
    INSERT INTO catalog_versions (id, revision) VALUES ('v1', 1), ('v2', 2);
    INSERT INTO pizza_sizes VALUES ('size1', 'v1', 'small', 'Small', 1, 12, 500, 100, 1);
    INSERT INTO crust_options VALUES ('crust1', 'v1', 'regular', 'Regular', 1);
    INSERT INTO toppings VALUES ('onion1', 'v1', 'onion', 'Onion', 1);
    INSERT INTO toppings VALUES ('onion2', 'v2', 'onion', 'Onion', 1);
    INSERT INTO beverages VALUES ('tea1', 'v1', 'tea', 'Tea', 1);
    INSERT INTO drink_sizes VALUES ('drink1', 'v1', 'small', 'Small', 1, 100);
  `);
}

function createDraft(objDatabase, strId = 'order1', strService = 'carry-out') {
  objDatabase.prepare('INSERT INTO orders (id, public_reference, service_type, catalog_version_id) VALUES (?, ?, ?, ?)')
    .run(strId, strId, strService, 'v1');
  objDatabase.prepare('INSERT INTO order_contacts (order_id, customer_name, phone) VALUES (?, ?, ?)')
    .run(strId, 'Synthetic Guest', '0000000000');
}

function addPizza(objDatabase, strId = 'pizza1', strOrder = 'order1', intQuantity = 1) {
  objDatabase.prepare(`INSERT INTO order_lines
    (id, order_id, catalog_version_id, line_number, item_type, quantity, display_name_snapshot, unit_price_cents, line_subtotal_cents)
    VALUES (?, ?, 'v1', 1, 'pizza', ?, 'Small pizza', 600, ?)`)
    .run(strId, strOrder, intQuantity, intQuantity * 600);
  objDatabase.prepare(`INSERT INTO pizza_line_details
    (order_line_id, catalog_version_id, pizza_size_id, crust_option_id, size_name_snapshot, crust_name_snapshot, base_price_cents, topping_price_cents)
    VALUES (?, 'v1', 'size1', 'crust1', 'Small', 'Regular', 500, 100)`).run(strId);
  objDatabase.prepare(`INSERT INTO pizza_line_toppings
    (order_line_id, catalog_version_id, topping_id, name_snapshot, unit_price_cents)
    VALUES (?, 'v1', 'onion1', 'Onion', 100)`).run(strId);
}

function addQuote(objDatabase, strId = 'quote1', strOrder = 'order1', centsSubtotal = 600) {
  objDatabase.prepare(`INSERT INTO order_quotes
    (id, order_id, catalog_version_id, item_subtotal_cents, tax_cents, tip_cents, total_cents,
      currency, tax_policy_reference, rounding_policy_reference, expires_at)
    VALUES (?, ?, 'v1', ?, 0, 0, ?, 'USD', 'synthetic-fixture-only', 'fixture', '2099-01-01T00:00:00.000Z')`)
    .run(strId, strOrder, centsSubtotal, centsSubtotal);
}

function acceptQuote(objDatabase, strId = 'quote1') {
  objDatabase.prepare('UPDATE order_quotes SET accepted_at = ? WHERE id = ?')
    .run('2026-10-21T12:00:00.000Z', strId);
}

function withDatabase(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    seedCatalog(objDatabase);
    createDraft(objDatabase);
    fnCheck(objDatabase);
  } finally {
    objDatabase.close();
  }
}

test('real catalog migration upgrades to order storage and persists accepted snapshots', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-order-'));
  const strPath = join(strDirectory, 'orders.sqlite');
  let objDatabase;
  try {
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase, [{ intVersion: 1, strName: 'catalog',
      strSql: readFileSync(new URL('../../src/data/migrations/001-catalog.sql', import.meta.url), 'utf8') }]);
    seedCatalog(objDatabase);
    applyMigrations(objDatabase);
    createDraft(objDatabase);
    addPizza(objDatabase);
    addQuote(objDatabase);
    acceptQuote(objDatabase);
    objDatabase.close();
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 17);
    assert.equal(objDatabase.prepare("SELECT accepted_quote_id FROM orders WHERE id = 'order1'").get().accepted_quote_id, 'quote1');
    assert.equal(objDatabase.prepare("SELECT base_price_cents FROM pizza_sizes WHERE id = 'size1'").get().base_price_cents, 500);
    assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    objDatabase?.close();
    rmSync(strDirectory, { recursive: true, force: true });
  }
});

test('aggregate quantity limits protect inserts, updates and moves between orders', () => withDatabase((objDatabase) => {
  addPizza(objDatabase, 'pizza1', 'order1', 6);
  assert.throws(() => objDatabase.exec(`INSERT INTO order_lines
    VALUES ('extra', 'order1', 'v1', 2, 'pizza', 1, 'Pizza', 500, 500)`));
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET quantity = 7, line_subtotal_cents = 4200 WHERE id = 'pizza1'"));
  createDraft(objDatabase, 'order2');
  addPizza(objDatabase, 'pizza2', 'order2');
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET order_id = 'order1', line_number = 2 WHERE id = 'pizza2'"));
  objDatabase.exec(`INSERT INTO order_lines VALUES ('drinkline', 'order1', 'v1', 2, 'drink', 10, 'Tea', 100, 1000)`);
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET quantity = 11, line_subtotal_cents = 1100 WHERE id = 'drinkline'"));
}));

test('invalid quantities, money, service types and cross-version references fail', () => withDatabase((objDatabase) => {
  for (const numQuantity of [-1, 0, 1.5, 7]) {
    assert.throws(() => addPizza(objDatabase, 'bad', 'order1', numQuantity));
  }
  assert.throws(() => objDatabase.exec("UPDATE orders SET service_type = 'delivery'"));
  addPizza(objDatabase);
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET unit_price_cents = 9007199254740992 WHERE id = 'pizza1'"));
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET line_subtotal_cents = 1 WHERE id = 'pizza1'"));
  assert.throws(() => objDatabase.exec("UPDATE pizza_line_toppings SET topping_id = 'onion2'"));
  assert.throws(() => objDatabase.exec("INSERT INTO pizza_line_toppings VALUES ('pizza1', 'v1', 'onion1', 'Onion', 100)"));
  assert.throws(() => objDatabase.exec("UPDATE order_lines SET item_type = 'drink' WHERE id = 'pizza1'"));
}));

test('quote acceptance requires complete matching details, contacts and subtotal', () => withDatabase((objDatabase) => {
  addPizza(objDatabase);
  addQuote(objDatabase);
  objDatabase.exec("DELETE FROM pizza_line_details WHERE order_line_id = 'pizza1'");
  assert.throws(() => acceptQuote(objDatabase), /details/);
  objDatabase.exec("INSERT INTO pizza_line_details VALUES ('pizza1', 'v1', 'size1', 'crust1', 'Small', 'Regular', 500, 100)");
  objDatabase.exec("UPDATE order_contacts SET phone = NULL");
  assert.throws(() => acceptQuote(objDatabase), /contact/);
  objDatabase.exec("UPDATE orders SET service_type = 'dine-in'; UPDATE order_contacts SET email = 'synthetic@example.invalid'");
  objDatabase.exec("UPDATE order_quotes SET item_subtotal_cents = 500, total_cents = 500");
  assert.throws(() => acceptQuote(objDatabase), /subtotal/);
  objDatabase.exec("UPDATE order_quotes SET item_subtotal_cents = 600, total_cents = 600");
  acceptQuote(objDatabase);
}));

test('accepted snapshots resist mutation and retain prices after catalog edits', () => withDatabase((objDatabase) => {
  addPizza(objDatabase);
  addQuote(objDatabase);
  acceptQuote(objDatabase);
  for (const strSql of [
    "UPDATE order_lines SET display_name_snapshot = 'Changed'",
    "DELETE FROM order_lines",
    "UPDATE pizza_line_details SET base_price_cents = 700",
    "DELETE FROM pizza_line_toppings",
    "UPDATE order_quotes SET tax_cents = 10, total_cents = 610",
    "DELETE FROM order_quotes",
    "UPDATE orders SET accepted_quote_id = NULL",
    "UPDATE orders SET service_type = 'dine-in'",
    "DELETE FROM orders",
    "INSERT OR REPLACE INTO order_quotes SELECT id, order_id, catalog_version_id, item_subtotal_cents, tax_cents, tip_cents, total_cents, currency, tax_policy_reference, rounding_policy_reference, created_at, expires_at, NULL FROM order_quotes",
    "INSERT OR REPLACE INTO orders (id, public_reference, service_type, catalog_version_id) VALUES ('order1', 'order1', 'carry-out', 'v1')",
  ]) assert.throws(() => objDatabase.exec(strSql), strSql);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents = 900 WHERE id = 'size1'");
  objDatabase.exec("UPDATE toppings SET display_name = 'New name' WHERE id = 'onion1'");
  assert.equal(objDatabase.prepare('SELECT unit_price_cents FROM order_lines').get().unit_price_cents, 600);
  assert.equal(objDatabase.prepare('SELECT name_snapshot FROM pizza_line_toppings').get().name_snapshot, 'Onion');
  objDatabase.exec("UPDATE order_contacts SET customer_name = NULL, phone = NULL, email = NULL, redacted_at = '2026-11-01T00:00:00.000Z'");
  assert.equal(objDatabase.prepare('SELECT total_cents FROM order_quotes').get().total_cents, 600);
}));

test('drink-only snapshots accept with dine-in email and reject wrong detail types', () => withDatabase((objDatabase) => {
  objDatabase.exec(`
    UPDATE orders SET service_type = 'dine-in';
    UPDATE order_contacts SET phone = NULL, email = 'synthetic@example.invalid';
    INSERT INTO order_lines VALUES ('tea-line', 'order1', 'v1', 1, 'drink', 2, 'Small Tea', 100, 200);
    INSERT INTO drink_line_details VALUES ('tea-line', 'v1', 'tea1', 'drink1', 'Tea', 'Small');
  `);
  assert.throws(() => objDatabase.exec("INSERT INTO pizza_line_toppings VALUES ('tea-line', 'v1', 'onion1', 'Onion', 100)"));
  addQuote(objDatabase, 'quote1', 'order1', 200);
  assert.throws(() => objDatabase.exec("UPDATE order_quotes SET total_cents = 201"));
  acceptQuote(objDatabase);
  assert.throws(() => objDatabase.exec("DELETE FROM drink_line_details"));
  assert.throws(() => objDatabase.exec("UPDATE drink_line_details SET size_name_snapshot = 'Large'"));
  assert.throws(() => objDatabase.exec("INSERT INTO order_lines VALUES ('late', 'order1', 'v1', 2, 'drink', 1, 'Tea', 100, 100)"));
}));

test('quotes cannot point across orders or bypass acceptance through insert', () => withDatabase((objDatabase) => {
  createDraft(objDatabase, 'order2');
  addPizza(objDatabase);
  addQuote(objDatabase);
  assert.throws(() => objDatabase.exec("UPDATE orders SET accepted_quote_id = 'quote1' WHERE id = 'order2'"));
  assert.throws(() => objDatabase.exec("UPDATE orders SET accepted_quote_id = 'quote1' WHERE id = 'order1'"));
  assert.throws(() => objDatabase.exec(`INSERT INTO order_quotes
    SELECT 'copy', order_id, catalog_version_id, item_subtotal_cents, tax_cents, tip_cents, total_cents,
      currency, tax_policy_reference, rounding_policy_reference, created_at, expires_at,
      '2026-10-21T12:00:00.000Z' FROM order_quotes WHERE id = 'quote1'`));
}));

test('malformed nested order write rolls back the entire transaction', () => withDatabase((objDatabase) => {
  assert.throws(() => runTransaction(objDatabase, () => {
    addPizza(objDatabase);
    objDatabase.exec("INSERT INTO pizza_line_toppings VALUES ('pizza1', 'v1', 'missing', 'Invalid', 100)");
  }));
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM order_lines').get().total, 0);
}));
