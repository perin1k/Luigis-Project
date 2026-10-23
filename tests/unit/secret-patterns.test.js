import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';

test('secret review reports historical locations without exposing matched values',()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-secret-review-'));
  const strScript=fileURLToPath(new URL('../../scripts/check-secret-patterns.js',import.meta.url));
  function git(arrArgs){return execFileSync('git',arrArgs,{cwd:strDirectory,stdio:'pipe'});}
  function scan(){return spawnSync(process.execPath,[strScript],{cwd:strDirectory,encoding:'utf8'});}
  try{
    git(['init']);writeFileSync(join(strDirectory,'example.js'),'// clean fixture\n');git(['add','example.js']);
    assert.equal(scan().status,0);
    const strSyntheticToken='gh'+'p_'+'A'.repeat(36);
    writeFileSync(join(strDirectory,'example.js'),`// deliberately synthetic scanner fixture ${strSyntheticToken}\n`);
    git(['add','example.js']);git(['-c','user.name=Scanner Fixture','-c','user.email=scanner@example.invalid','commit','-m','synthetic fixture']);
    writeFileSync(join(strDirectory,'example.js'),'// clean working copy\n');
    const objResult=scan();assert.equal(objResult.status,1);assert.match(objResult.stdout,/github-token/);assert.match(objResult.stdout,/blob:/);assert.doesNotMatch(objResult.stdout,new RegExp(strSyntheticToken));assert.equal(objResult.stderr,'');
  }finally{rmSync(strDirectory,{recursive:true,force:true});}
});
