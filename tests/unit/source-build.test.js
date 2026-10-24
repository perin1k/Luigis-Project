import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {buildSourceRelease} from '../../scripts/build-release.js';

test('clean Git source artifact is repeatable, excludes tracked private roots and refuses dirty checkout/overwrite',()=>{
  const strStage=mkdtempSync(join(tmpdir(),'luigis-source-build-'));const strRoot=join(strStage,'checkout');mkdirSync(strRoot);
  const fnGit=arrArgs=>execFileSync('git',['-c','core.fsmonitor=false','-C',strRoot,...arrArgs],{stdio:'pipe'});
  try{
    fnGit(['init']);fnGit(['config','user.name','Synthetic Build Test']);fnGit(['config','user.email','build@example.test']);
    for(const strName of ['src','scripts','deploy']){mkdirSync(join(strRoot,strName));writeFileSync(join(strRoot,strName,'example.txt'),'reviewed source\n');}
    writeFileSync(join(strRoot,'package.json'),'{}\n');writeFileSync(join(strRoot,'package-lock.json'),'{}\n');
    writeFileSync(join(strRoot,'.env'),'SYNTHETIC_PRIVATE_MARKER=not-a-real-key\n');
    mkdirSync(join(strRoot,'data'));writeFileSync(join(strRoot,'data','private.txt'),'SYNTHETIC_PRIVATE_MARKER\n');
    fnGit(['add','.']);fnGit(['commit','-m','Synthetic reviewed baseline']);
    const strA=join(strStage,'out-a'),strB=join(strStage,'out-b');
    const objA=buildSourceRelease(strRoot,strA),objB=buildSourceRelease(strRoot,strB);
    assert.equal(objA.strSha256,objB.strSha256);
    assert.equal(readFileSync(join(strA,objA.strCommit+'.tar')).includes(Buffer.from('SYNTHETIC_PRIVATE_MARKER')),false);
    assert.throws(()=>buildSourceRelease(strRoot,strA));
    writeFileSync(join(strRoot,'src','example.txt'),'unreviewed\n');assert.throws(()=>buildSourceRelease(strRoot,join(strStage,'dirty')),/clean reviewed/);
  }finally{rmSync(strStage,{recursive:true,force:true});}
});
