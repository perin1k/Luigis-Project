import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runTransaction } from './database.js';

const CATALOG_MIGRATION = Object.freeze({
  intVersion: 1,
  strName: 'catalog',
  strSql: readFileSync(new URL('./migrations/001-catalog.sql', import.meta.url), 'utf8'),
});

const ORDERS_MIGRATION = Object.freeze({
  intVersion: 2,
  strName: 'orders',
  strSql: readFileSync(new URL('./migrations/002-orders.sql', import.meta.url), 'utf8'),
});

const PAYMENTS_MIGRATION = Object.freeze({
  intVersion: 3,
  strName: 'payments',
  strSql: readFileSync(new URL('./migrations/003-payments.sql', import.meta.url), 'utf8'),
});

const SCHEDULING_MIGRATION = Object.freeze({
  intVersion: 4,
  strName: 'scheduling',
  strSql: readFileSync(new URL('./migrations/004-scheduling.sql', import.meta.url), 'utf8'),
});

const ACCESS_MIGRATION = Object.freeze({
  intVersion: 5,
  strName: 'access-and-audit',
  strSql: readFileSync(new URL('./migrations/005-access-and-audit.sql', import.meta.url), 'utf8'),
});

const CREDENTIALS_MIGRATION = Object.freeze({
  intVersion: 6,
  strName: 'auth-credentials',
  strSql: readFileSync(new URL('./migrations/006-auth-credentials.sql', import.meta.url), 'utf8'),
});

const MFA_MIGRATION = Object.freeze({
  intVersion: 7,
  strName: 'mfa-secrets',
  strSql: readFileSync(new URL('./migrations/007-mfa-secrets.sql', import.meta.url), 'utf8'),
});

const LOGIN_MIGRATION = Object.freeze({
  intVersion: 8,
  strName: 'login-controls',
  strSql: readFileSync(new URL('./migrations/008-login-controls.sql', import.meta.url), 'utf8'),
});

const INVITATIONS_MIGRATION = Object.freeze({
  intVersion: 9,
  strName: 'staff-invitations',
  strSql: readFileSync(new URL('./migrations/009-staff-invitations.sql', import.meta.url), 'utf8'),
});

const RECOVERY_MIGRATION = Object.freeze({
  intVersion: 10,
  strName: 'account-recovery',
  strSql: readFileSync(new URL('./migrations/010-account-recovery.sql', import.meta.url), 'utf8'),
});

const DEMO_PAYMENTS_MIGRATION = Object.freeze({
  intVersion: 11, strName: 'demo-payments',
  strSql: readFileSync(new URL('./migrations/011-demo-payments.sql', import.meta.url), 'utf8'),
});

const DEMO_REFUNDS_MIGRATION = Object.freeze({intVersion:12,strName:'demo-refunds',strSql:readFileSync(new URL('./migrations/012-demo-refunds.sql',import.meta.url),'utf8')});

const NOTIFICATION_PREVIEWS_MIGRATION=Object.freeze({intVersion:13,strName:'notification-previews',strSql:readFileSync(new URL('./migrations/013-notification-previews.sql',import.meta.url),'utf8')});
const STAFF_ROLES_MIGRATION=Object.freeze({intVersion:14,strName:'staff-roles',strSql:readFileSync(new URL('./migrations/014-staff-roles.sql',import.meta.url),'utf8')});

const PRIVACY_ACTIONS_MIGRATION=Object.freeze({intVersion:15,strName:'privacy-actions',strSql:readFileSync(new URL('./migrations/015-privacy-actions.sql',import.meta.url),'utf8')});

export function applyMigrations(objDatabase, arrMigrations = [
  CATALOG_MIGRATION, ORDERS_MIGRATION, PAYMENTS_MIGRATION, SCHEDULING_MIGRATION, ACCESS_MIGRATION,
  CREDENTIALS_MIGRATION, MFA_MIGRATION, LOGIN_MIGRATION, INVITATIONS_MIGRATION, RECOVERY_MIGRATION, DEMO_PAYMENTS_MIGRATION, DEMO_REFUNDS_MIGRATION, NOTIFICATION_PREVIEWS_MIGRATION, STAFF_ROLES_MIGRATION, PRIVACY_ACTIONS_MIGRATION,
]) {
  let intPrevious = 0;
  for (const objMigration of arrMigrations) {
    if (!Number.isSafeInteger(objMigration.intVersion) || objMigration.intVersion !== intPrevious + 1
      || typeof objMigration.strName !== 'string' || typeof objMigration.strSql !== 'string') {
      throw new TypeError('Migrations must have consecutive versions and text names/SQL.');
    }
    intPrevious = objMigration.intVersion;
  }
  runTransaction(objDatabase, () => {
    objDatabase.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT`);
  });
  runTransaction(objDatabase, () => {
    const arrApplied = objDatabase.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all();
    for (const objApplied of arrApplied) {
      const objMigration = arrMigrations.find((objCandidate) => objCandidate.intVersion === objApplied.version);
      if (!objMigration || objMigration.strName !== objApplied.name
        || createHash('sha256').update(objMigration.strSql).digest('hex') !== objApplied.checksum) {
        throw new Error('Applied migration changed or is unknown; restore matching application code.');
      }
    }
    for (const objMigration of arrMigrations) {
      if (arrApplied.some((objApplied) => objApplied.version === objMigration.intVersion)) continue;
      objDatabase.exec(objMigration.strSql);
      objDatabase.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)')
        .run(objMigration.intVersion, objMigration.strName, createHash('sha256').update(objMigration.strSql).digest('hex'));
    }
  });
}
