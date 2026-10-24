import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createManifest, verifyRelease} from '../../scripts/release.js';

function fixture(fnWork){
  const strRoot=mkdtempSync(join(tmpdir(),'luigis-release-'));
  const strRelease=join(strRoot,'release');mkdirSync(join(strRelease,'src'),{recursive:true});
  mkdirSync(join(strRelease,'scripts'));mkdirSync(join(strRelease,'deploy'));
  writeFileSync(join(strRelease,'src/server.js'),'// isolated release\n');
  writeFileSync(join(strRelease,'package.json'),JSON.stringify({type:'module'}));
  writeFileSync(join(strRelease,'package-lock.json'),'{}\n');
  const objDatabase=new DatabaseSync(join(strRoot,'retained.sqlite'));
  objDatabase.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,checksum TEXT) STRICT');
  const arrMigrations=[{version:1,name:'example',checksum:'a'.repeat(64)}];
  objDatabase.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(1,'example','a'.repeat(64));objDatabase.close();
  try{fnWork({strRoot,strRelease,strDatabase:join(strRoot,'retained.sqlite'),arrMigrations});}
  finally{rmSync(strRoot,{recursive:true,force:true});}
}

test('release verification checks source/lock integrity without modifying retained SQLite',()=>fixture(({strRelease,strDatabase,arrMigrations})=>{
  createManifest(strRelease,'a'.repeat(40),arrMigrations);
  const objBefore=readFileSync(strDatabase);
  assert.equal(verifyRelease(strRelease,strDatabase,'ready').strCommit,'a'.repeat(40));
  assert.deepEqual(readFileSync(strDatabase),objBefore);
  writeFileSync(join(strRelease,'src/server.js'),'// altered\n');
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'ready'),/integrity/);
}));

test('forward plan allows reviewed pending migrations; rollback refuses newer/changed schema',()=>fixture(({strRelease,strDatabase,arrMigrations})=>{
  createManifest(strRelease,'b'.repeat(40),[...arrMigrations,{version:2,name:'next',checksum:'b'.repeat(64)}]);
  assert.equal(verifyRelease(strRelease,strDatabase,'forward').intPending,1);
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'rollback'),/schema/);
  const objDatabase=new DatabaseSync(strDatabase);
  objDatabase.prepare('UPDATE schema_migrations SET checksum=?').run('c'.repeat(64));objDatabase.close();
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'forward'),/schema/);
}));

test('unknown schema, runtime mismatch, added files and missing DB fail closed',()=>fixture(({strRoot,strRelease,strDatabase,arrMigrations})=>{
  createManifest(strRelease,'c'.repeat(40),arrMigrations);
  assert.throws(()=>verifyRelease(strRelease,join(strRoot,'missing.sqlite'),'ready'));
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'unknown'),/mode/);
  const strManifest=join(strRelease,'release-manifest.json');
  const objManifest=JSON.parse(readFileSync(strManifest));objManifest.strNodeVersion='v0.0.0';
  writeFileSync(strManifest,JSON.stringify(objManifest));
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'ready'),/runtime/);
  objManifest.strNodeVersion=process.version;writeFileSync(strManifest,JSON.stringify(objManifest));
  writeFileSync(join(strRelease,'src/unreviewed.js'),'// unexpected\n');
  assert.throws(()=>verifyRelease(strRelease,strDatabase,'ready'),/integrity/);
}));
