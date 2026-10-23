import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {openDatabase} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';

test('v15 upgrades v14 without rewriting prior migrations, catalog, staff or append-only history',()=>{
  const objDatabase=openDatabase(':memory:');
  try {
    const objDirectory=new URL('../../src/data/migrations/',import.meta.url);
    const arrPrevious=readdirSync(objDirectory).filter(strFile=>/^\d{3}-.+\.sql$/.test(strFile)&&Number(strFile.slice(0,3))<=14).sort().map(strFile=>({intVersion:Number(strFile.slice(0,3)),strName:strFile.slice(4,-4),strSql:readFileSync(new URL(strFile,objDirectory),'utf8')}));
    applyMigrations(objDatabase,arrPrevious);
    objDatabase.prepare("INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES ('synthetic-admin','synthetic-admin','admin','2026-10-21T18:00:00.000Z')").run();
    objDatabase.prepare("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES ('synthetic-history','synthetic-admin','staff_change','staff_user','synthetic-admin','2026-10-21T18:00:00.000Z','synthetic-history','operator_request','Staff account changed')").run();
    const arrChecksums=objDatabase.prepare('SELECT * FROM schema_migrations').all();const arrAudit=objDatabase.prepare('SELECT * FROM audit_events').all();
    applyMigrations(objDatabase);applyMigrations(objDatabase);
    assert.deepEqual(objDatabase.prepare('SELECT * FROM schema_migrations WHERE version<=14').all(),arrChecksums);
    assert.deepEqual(objDatabase.prepare('SELECT * FROM audit_events').all(),arrAudit);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM staff_users').get().n,1);
    assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM privacy_actions').get().n,0);
    assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(objDatabase.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>applyMigrations(objDatabase,arrPrevious),/unknown/);
  } finally {objDatabase.close();}
});
