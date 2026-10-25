/**
 * Read-only retained-state inspector emits counts/digests rather than account secrets or
 * rows. Compare compatible checkpoints and distinguish ordinary MFA counter changes from
 * credential replacement.
 */
/** Private operator check: emit counts/digests only, never credential or customer rows. */
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {statSync} from 'node:fs';
const strDatabase=process.env.DATABASE_PATH??'/var/lib/luigis-data/luigis-demo.sqlite';
const objDatabase=new DatabaseSync(strDatabase,{readOnly:true});
try{
  const objResult={};
  for(const strTable of ['staff_users','staff_credentials','staff_ownership','mfa_references','mfa_secrets','recovery_codes','staff_mfa_enrollments']){
    // Table names come from this fixed operator list, not command-line or HTTP input.
    const bExists=Boolean(objDatabase.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(strTable));
    if(!bExists)throw new Error('Required retained staff table missing.');
    const arrRows=objDatabase.prepare(`SELECT * FROM ${strTable}`).all().map(objRow=>JSON.stringify(objRow)).sort();
    objResult[strTable]={intCount:arrRows.length,strDigest:createHash('sha256').update(JSON.stringify(arrRows)).digest('hex')};
  }
  const arrMigrations=objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all();
  const objStat=statSync(strDatabase);
  objResult.objDatabase={intDevice:objStat.dev,intInode:objStat.ino,bIntegrity:objDatabase.prepare('PRAGMA integrity_check').get().integrity_check==='ok',bForeignKeys:objDatabase.prepare('PRAGMA foreign_key_check').all().length===0};
  objResult.objSchema={intCount:arrMigrations.length,strOriginal15Digest:createHash('sha256').update(JSON.stringify(arrMigrations.slice(0,15))).digest('hex')};
  console.log(JSON.stringify(objResult));
}finally{objDatabase.close();}
