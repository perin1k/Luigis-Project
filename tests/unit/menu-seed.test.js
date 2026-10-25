import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { seedMenu } from '../../src/data/seed-menu.js';

function withDatabase(fnCheck) {
  const objDatabase = openDatabase(':memory:');
  try { applyMigrations(objDatabase); fnCheck(objDatabase); } finally { objDatabase.close(); }
}

test('seed contains the approved menu amounts, names and preparation portions', () => withDatabase((objDatabase) => {
  assert.equal(seedMenu(objDatabase).bCreated, true);
  assert.deepEqual(objDatabase.prepare(`SELECT code, diameter_inches, base_price_cents, topping_price_cents, marinara_quarter_cups
    FROM pizza_sizes ORDER BY base_price_cents`).all().map((objRow) => Object.values(objRow)), [
    ['small', 12, 500, 100, 1], ['medium', 14, 700, 200, 2], ['large', 18, 900, 300, 4],
  ]);
  assert.deepEqual(objDatabase.prepare('SELECT display_name FROM crust_options ORDER BY code').all().map((objRow) => objRow.display_name),
    ['New York-style', 'Regular']);
  assert.deepEqual(objDatabase.prepare('SELECT display_name FROM toppings ORDER BY display_name').all().map((objRow) => objRow.display_name),
    ['Beef crumbles', 'Black olives', 'Diced tomatoes', 'Green peppers', 'Jalapeños', 'Onion', 'Pepperoni', 'Pineapple', 'Sausage']);
  assert.deepEqual(objDatabase.prepare('SELECT display_name FROM beverages ORDER BY display_name').all().map((objRow) => objRow.display_name),
    ['Coca-Cola', 'Diet Coke', 'Dr Pepper', 'Sprite', 'Sweet iced tea', 'Unsweet iced tea']);
  assert.deepEqual(objDatabase.prepare('SELECT code, price_cents FROM drink_sizes ORDER BY price_cents').all().map((objRow) => Object.values(objRow)),
    [['small', 100], ['medium', 200], ['large', 300]]);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM ingredients').get().total, 19);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_ingredient_requirements').get().total, 23);
  assert.equal(objDatabase.prepare('PRAGMA foreign_key_check').all().length, 0);
  for (const strTable of ['orders', 'staff_users', 'payment_attempts', 'audit_events', 'service_days']) {
    assert.equal(objDatabase.prepare(`SELECT count(*) AS total FROM ${strTable}`).get().total, 0);
  }
}));

test('ingredient relationships block only the affected catalog options', () => withDatabase((objDatabase) => {
  seedMenu(objDatabase);
  assert.deepEqual(objDatabase.prepare(`SELECT s.code FROM catalog_ingredient_requirements r
    JOIN ingredients i ON i.id = r.ingredient_id JOIN pizza_sizes s ON s.id = r.pizza_size_id
    WHERE i.code = 'cheese' ORDER BY s.code`).all().map((objRow) => objRow.code), ['large', 'medium', 'small']);
  assert.equal(objDatabase.prepare(`SELECT count(*) AS total FROM catalog_ingredient_requirements r
    JOIN ingredients i ON i.id = r.ingredient_id WHERE i.code = 'onion' AND r.topping_id IS NOT NULL`).get().total, 1);
  assert.equal(objDatabase.prepare(`SELECT count(*) AS total FROM catalog_ingredient_requirements r
    JOIN ingredients i ON i.id = r.ingredient_id WHERE i.code = 'diet-coke' AND r.beverage_id IS NOT NULL`).get().total, 1);
}));

test('repeated seeds preserve later price, label and availability changes', () => withDatabase((objDatabase) => {
  seedMenu(objDatabase);
  objDatabase.exec("UPDATE pizza_sizes SET base_price_cents = 650 WHERE code = 'small'");
  objDatabase.exec("UPDATE beverages SET display_name = 'Edited tea label' WHERE code = 'sweet-tea'");
  objDatabase.exec("UPDATE ingredients SET is_available = 0, revision = 2 WHERE code = 'cheese'");
  assert.equal(seedMenu(objDatabase).bCreated, false);
  assert.equal(objDatabase.prepare("SELECT base_price_cents FROM pizza_sizes WHERE code = 'small'").get().base_price_cents, 650);
  assert.equal(objDatabase.prepare("SELECT is_available FROM ingredients WHERE code = 'cheese'").get().is_available, 0);
  assert.equal(objDatabase.prepare("SELECT display_name FROM beverages WHERE code = 'sweet-tea'").get().display_name, 'Edited tea label');
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_versions').get().total, 1);
}));

test('conflicting catalog revision and late ingredient collisions never overwrite records', () => withDatabase((objDatabase) => {
  objDatabase.exec("INSERT INTO catalog_versions (id, revision) VALUES ('existing-menu', 1)");
  assert.throws(() => seedMenu(objDatabase), /conflict/i);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM pizza_sizes').get().total, 0);
  objDatabase.exec("DELETE FROM catalog_versions; INSERT INTO ingredients (id, code, display_name) VALUES ('existing-tea', 'unsweet-tea', 'Existing ingredient')");
  assert.throws(() => seedMenu(objDatabase), /conflict/i);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_versions').get().total, 0);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM ingredients').get().total, 1);
  assert.equal(objDatabase.prepare('SELECT display_name FROM ingredients').get().display_name, 'Existing ingredient');
}));

test('incomplete seeded structure stops safely instead of silently repairing it', () => withDatabase((objDatabase) => {
  seedMenu(objDatabase);
  objDatabase.exec("DELETE FROM catalog_ingredient_requirements WHERE id = (SELECT id FROM catalog_ingredient_requirements LIMIT 1)");
  assert.throws(() => seedMenu(objDatabase), /conflict/i);
  assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_ingredient_requirements').get().total, 22);
}));

test('consistent existing ingredients retain their manual flags on initial seed', () => withDatabase((objDatabase) => {
  objDatabase.exec("INSERT INTO ingredients (id, code, display_name, is_available) VALUES ('luigis:ingredient:cheese', 'cheese', 'Existing cheese label', 0)");
  seedMenu(objDatabase);
  assert.equal(objDatabase.prepare("SELECT is_available FROM ingredients WHERE code = 'cheese'").get().is_available, 0);
}));

test('CLI requires migration first and repeated seed commands persist one menu', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-seed-cli-'));
  const strPath = join(strDirectory, 'demo.sqlite');
  const objOptions = { cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, DATABASE_PATH: strPath }, encoding: 'utf8' };
  let objDatabase;
  try {
    const objBefore = spawnSync(process.execPath, ['scripts/seed-menu.js'], objOptions);
    assert.notEqual(objBefore.status, 0);
    assert.match(objBefore.stderr, /db:migrate/);
    assert.equal(spawnSync(process.execPath, ['scripts/migrate.js'], objOptions).status, 0);
    for (let intRun = 0; intRun < 2; intRun += 1) {
      const objRun = spawnSync(process.execPath, ['scripts/seed-menu.js'], objOptions);
      assert.equal(objRun.status, 0, objRun.stderr);
    }
    objDatabase = openDatabase(strPath);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_versions').get().total, 1);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { objDatabase?.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});
