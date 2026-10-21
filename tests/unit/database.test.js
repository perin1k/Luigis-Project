import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

test('catalog survives reopening and migrations are repeatable', () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-data-'));
  const strPath = join(strDirectory, 'demo.sqlite');
  let objDatabase;
  try {
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase);
    objDatabase.prepare('INSERT INTO catalog_versions (id, revision) VALUES (?, ?)').run('menu-1', 1);
    objDatabase.close();
    objDatabase = openDatabase(strPath);
    applyMigrations(objDatabase);
    assert.equal(objDatabase.prepare('SELECT revision FROM catalog_versions WHERE id = ?').get('menu-1').revision, 1);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM schema_migrations').get().total, 6);
  } finally {
    objDatabase?.close();
    rmSync(strDirectory, { recursive: true, force: true });
  }
});

test('catalog enforces money, version, availability and ingredient relationships', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    objDatabase.exec("INSERT INTO catalog_versions (id, revision) VALUES ('v1', 1), ('v2', 2)");
    const objInsert = objDatabase.prepare(`INSERT INTO pizza_sizes
      (id, catalog_version_id, code, display_name, diameter_inches, base_price_cents, topping_price_cents, marinara_quarter_cups)
      VALUES (?, ?, 'small', 'Small', 12, ?, 100, 1)`);
    for (const numInvalid of [-1, 1.5, 9007199254740992]) {
      assert.throws(() => objInsert.run('bad', 'v1', numInvalid));
    }
    assert.throws(() => objInsert.run('bad', 'missing', 500));
    objInsert.run('small-v1', 'v1', 500);
    assert.throws(() => objInsert.run('duplicate', 'v1', 500));
    objDatabase.exec("INSERT INTO ingredients (id, code, display_name) VALUES ('cheese', 'cheese', 'Cheese')");
    const objRequirement = objDatabase.prepare(`INSERT INTO catalog_ingredient_requirements
      (id, catalog_version_id, pizza_size_id, ingredient_id) VALUES (?, ?, ?, 'cheese')`);
    objRequirement.run('r1', 'v1', 'small-v1');
    assert.throws(() => objDatabase.exec(`INSERT INTO catalog_ingredient_requirements
      (id, catalog_version_id, ingredient_id) VALUES ('empty', 'v1', 'cheese')`));
    assert.throws(() => objRequirement.run('r2', 'v2', 'small-v1'));
    assert.throws(() => objRequirement.run('r3', 'v1', 'small-v1'));
    assert.throws(() => objDatabase.exec("UPDATE ingredients SET is_available = 2"));
    assert.throws(() => objDatabase.exec("DELETE FROM ingredients WHERE id = 'cheese'"));
    objDatabase.exec("UPDATE ingredients SET is_available = 0 WHERE id = 'cheese'");
    assert.equal(objDatabase.prepare("SELECT is_available FROM ingredients WHERE id = 'cheese'").get().is_available, 0);
  } finally {
    objDatabase.close();
  }
});

test('failed migrations roll back their schema and version record', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    assert.throws(() => applyMigrations(objDatabase, [{
      intVersion: 1, strName: 'broken', strSql: 'CREATE TABLE incomplete (id TEXT); INVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare("SELECT name FROM sqlite_master WHERE name = 'incomplete'").get(), undefined);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM schema_migrations').get().total, 0);
    applyMigrations(objDatabase);
    applyMigrations(objDatabase, undefined);
    assert.throws(() => applyMigrations(objDatabase, []), /unknown/);
    assert.throws(() => applyMigrations(objDatabase, [{ intVersion: 1, strName: 'changed', strSql: 'SELECT 1;' }]), /changed/);
  } finally {
    objDatabase.close();
  }
});

test('transaction failure leaves no partial writes and rejects async callbacks', () => {
  const objDatabase = openDatabase(':memory:');
  try {
    applyMigrations(objDatabase);
    assert.throws(() => runTransaction(objDatabase, () => {
      objDatabase.exec("INSERT INTO catalog_versions (id, revision) VALUES ('rollback', 1)");
      throw new Error('stop');
    }), /stop/);
    assert.equal(objDatabase.prepare('SELECT count(*) AS total FROM catalog_versions').get().total, 0);
    assert.throws(() => runTransaction(objDatabase, async () => {}), /synchronous/);
  } finally {
    objDatabase.close();
  }
});

test('upgrades preserve existing rows and failed upgrades retain the prior version', () => {
  const objDatabase = openDatabase(':memory:');
  const objFirst = { intVersion: 1, strName: 'fixture-start', strSql: 'CREATE TABLE sample (id TEXT PRIMARY KEY) STRICT;' };
  try {
    applyMigrations(objDatabase, [objFirst]);
    objDatabase.exec("INSERT INTO sample VALUES ('retained')");
    assert.throws(() => applyMigrations(objDatabase, [objFirst, {
      intVersion: 2, strName: 'bad-upgrade', strSql: 'ALTER TABLE sample ADD COLUMN label TEXT; INVALID SQL;',
    }]));
    assert.equal(objDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 1);
    assert.throws(() => objDatabase.prepare('SELECT label FROM sample'));
    applyMigrations(objDatabase, [objFirst, {
      intVersion: 2, strName: 'upgrade', strSql: "ALTER TABLE sample ADD COLUMN label TEXT NOT NULL DEFAULT 'existing';",
    }]);
    assert.equal(objDatabase.prepare("SELECT label FROM sample WHERE id = 'retained'").get().label, 'existing');
  } finally {
    objDatabase.close();
  }
});
