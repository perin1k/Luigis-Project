import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,runTransaction} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedMenu} from '../../src/data/seed-menu.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';

test('file databases use WAL/FULL, bounded waits and reader/writer isolation',()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-wal-'));let objWriter,objReader;
  try{
    objWriter=openDatabase(join(strDirectory,'demo.sqlite'));
    assert.equal(objWriter.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
    assert.equal(objWriter.prepare('PRAGMA synchronous').get().synchronous,2);
    assert.equal(objWriter.prepare('PRAGMA busy_timeout').get().timeout,5000);
    assert.equal(objWriter.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint,1000);
    objWriter.exec('CREATE TABLE sample(value INTEGER); INSERT INTO sample VALUES(1)');
    objReader=openDatabase(join(strDirectory,'demo.sqlite'));objReader.exec('PRAGMA busy_timeout=20');
    objWriter.exec('BEGIN IMMEDIATE; UPDATE sample SET value=2');
    assert.equal(objReader.prepare('SELECT value FROM sample').get().value,1);
    assert.throws(()=>objReader.exec('BEGIN IMMEDIATE'),/locked|busy/i);
    objWriter.exec('COMMIT');
    assert.equal(objReader.prepare('SELECT value FROM sample').get().value,2);
    assert.throws(()=>runTransaction(objWriter,()=>{objWriter.exec('UPDATE sample SET value=3');throw new Error('rollback probe');}),/rollback probe/);
    assert.equal(objReader.prepare('SELECT value FROM sample').get().value,2);
    assert.equal(objWriter.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    if(process.platform!=='win32'){
      // SQLite auxiliary files must not broaden the containing directory's access.
      const intDatabaseMode=statSync(join(strDirectory,'demo.sqlite')).mode&0o777;
      assert.equal((statSync(join(strDirectory,'demo.sqlite-wal')).mode&0o777)&~intDatabaseMode,0);
    }
  }finally{objReader?.close();objWriter?.close();rmSync(strDirectory,{recursive:true,force:true});}
});

test('catalog cache invalidates external changes and never retains rolled-back menu state',()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-menu-cache-'));let objDatabase,objOther;
  try{
    const strPath=join(strDirectory,'demo.sqlite');objDatabase=openDatabase(strPath);applyMigrations(objDatabase);seedMenu(objDatabase);objOther=openDatabase(strPath);
    const objCatalog=createCatalogService(objDatabase),objInitial=objCatalog.readCatalog();
    objInitial.arrSizes[0].centsBase=999999;
    assert.equal(objCatalog.readCatalog().arrSizes[0].centsBase,500);
    objOther.exec("UPDATE ingredients SET is_available=0,revision=revision+1 WHERE code='pepperoni'");
    assert.equal(objCatalog.readCatalog().arrToppings.find(obj=>obj.strCode==='pepperoni').bAvailable,false);
    objDatabase.exec('BEGIN IMMEDIATE');
    objDatabase.exec("UPDATE ingredients SET is_available=1,revision=revision+1 WHERE code='pepperoni'");
    assert.equal(objCatalog.readCatalog({bWithinTransaction:true}).arrToppings.find(obj=>obj.strCode==='pepperoni').bAvailable,true);
    objDatabase.exec('ROLLBACK');
    assert.equal(objCatalog.readCatalog().arrToppings.find(obj=>obj.strCode==='pepperoni').bAvailable,false);
    assert.deepEqual(objDatabase.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{objOther?.close();objDatabase?.close();rmSync(strDirectory,{recursive:true,force:true});}
});

test('booking, review and payment lookup plans use their selective identifiers',()=>{
  const objDatabase=openDatabase(':memory:');
  try{
    applyMigrations(objDatabase);
    for(const [strSql,strIdentifier] of [
      ["SELECT id FROM capacity_holds WHERE booking_id=? AND state='confirmed'",'booking_id'],
      ["SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'",'order_id'],
      ['SELECT component,signed_cents FROM demo_financial_allocations WHERE payment_id=?','payment_id'],
    ]){
      const strPlan=objDatabase.prepare('EXPLAIN QUERY PLAN '+strSql).all('sample').map(obj=>obj.detail).join(' ');
      assert.match(strPlan,new RegExp(`SEARCH .*${strIdentifier}`));
    }
  }finally{objDatabase.close();}
});
