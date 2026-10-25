import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareTlsGeneration} from '../../scripts/install-tls.js';

test('TLS generation validates matching hostname/key before preparing a private complete pair',()=>{
  const strRoot=mkdtempSync(join(tmpdir(),'luigis-cert-'));const strKey=join(strRoot,'key.pem');const strCert=join(strRoot,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',strKey,'-out',strCert,
    '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-days','1'],{stdio:'ignore'});
  try{
    assert.throws(()=>prepareTlsGeneration(strRoot,strKey,strCert,'wrong.invalid'));
    assert.throws(()=>prepareTlsGeneration(strRoot,strCert,strCert,'localhost'));
    const strGeneration=prepareTlsGeneration(strRoot,strKey,strCert,'localhost');
    assert.equal(readFileSync(join(strGeneration,'privkey.pem')).equals(readFileSync(strKey)),true);
    assert.equal(readFileSync(join(strGeneration,'fullchain.pem')).equals(readFileSync(strCert)),true);
    if(process.platform!=='win32'){
      assert.equal(lstatSync(strGeneration).mode&0o777,0o700);
      assert.equal(lstatSync(join(strGeneration,'privkey.pem')).mode&0o777,0o600);
    }
  }finally{rmSync(strRoot,{recursive:true,force:true});}
});
