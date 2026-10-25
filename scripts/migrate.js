/**
 * Explicit database migration CLI. Applies reviewed checksum-verified additions; startup
 * or a failed check must not silently rewrite earlier SQL or reset the database.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from '../src/data/database.js';
import { applyMigrations } from '../src/data/migrations.js';

const strPath = resolve(process.env.DATABASE_PATH || 'data/luigis-demo.sqlite');
mkdirSync(dirname(strPath), { recursive: true });
const objDatabase = openDatabase(strPath);
try {
  applyMigrations(objDatabase);
  console.log('Database migrations applied successfully.');
} finally {
  objDatabase.close();
}
