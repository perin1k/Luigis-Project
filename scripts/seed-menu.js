import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../src/data/database.js';
import { seedMenu } from '../src/data/seed-menu.js';

const strPath = resolve(process.env.DATABASE_PATH || 'data/luigis-demo.sqlite');
let objDatabase;
try {
  if (!existsSync(strPath)) throw new Error('Run npm run db:migrate before npm run db:seed.');
  objDatabase = openDatabase(strPath);
  const objResult = seedMenu(objDatabase);
  console.log(objResult.bCreated ? 'Approved baseline menu seeded.' : 'Baseline menu structure verified; existing edits preserved.');
} catch (objError) {
  console.error(objError.message);
  process.exitCode = 1;
} finally {
  objDatabase?.close();
}
