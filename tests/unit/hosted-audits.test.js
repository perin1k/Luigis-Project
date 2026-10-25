import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSummary} from '../../scripts/hosted-audits.js';
test('audit summary preserves required scores and only existing noindex SEO exception without copying private data',()=>{
  const objLhr={lighthouseVersion:'test',categories:Object.fromEntries(['performance','accessibility','best-practices','seo'].map(strKey=>[strKey,{score:strKey==='seo'?0.6:1}])),
    finalDisplayedUrl:'https://localhost/private-token',configSettings:{extraHeaders:{Cookie:'PRIVATE'}}};
  assert.equal(auditSummary(objLhr,'staff-detail','mobile',true).bPassed,true);
  assert.equal(auditSummary(objLhr,'staff-detail','mobile',false).bPassed,false);
  assert.equal(JSON.stringify(auditSummary(objLhr,'staff-detail','mobile',true)).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(auditSummary(objLhr,'staff-detail','mobile',true)).includes('private-token'),false);
  objLhr.categories.performance.score=0.99;assert.equal(auditSummary(objLhr,'staff-detail','mobile',true).bPassed,false);
  objLhr.categories.performance.score=1;objLhr.runtimeError={code:'FAILED'};assert.equal(auditSummary(objLhr,'staff-detail','mobile',true).bPassed,false);
});
