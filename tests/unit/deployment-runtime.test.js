import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {validateRuntime} from '../../scripts/validate-runtime.js';

test('hosted preflight validates matching TLS/private keys and rejects incomplete or unsafe configuration',()=>{
  const strRoot=mkdtempSync(join(tmpdir(),'luigis-preflight-'));const strData=join(strRoot,'data');mkdirSync(strData);
  const strKey=join(strRoot,'key.pem');const strCert=join(strRoot,'cert.pem');const strPayment=join(strRoot,'payment.json');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',strKey,'-out',strCert,
    '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-days','1'],{stdio:'ignore'});
  const strDatabase=join(strData,'retained.sqlite');writeFileSync(strDatabase,'fixture');
  const strSecret=randomBytes(32).toString('hex');
  writeFileSync(strPayment,JSON.stringify({strActiveKeyId:'fixture',mapKeys:{fixture:strSecret}}));
  for(const strPath of [strKey,strCert,strPayment])chmodSync(strPath,0o600);
  const objEnvironment={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3443',AUTH_ORIGIN:'https://localhost:3443',
    DATABASE_PATH:strDatabase,MFA_ENCRYPTION_KEY_HEX:randomBytes(32).toString('hex'),
    TLS_KEY_PATH:strKey,TLS_CERT_PATH:strCert,DEMO_PAYMENT_KEYS_PATH:strPayment};
  try{
    assert.equal(validateRuntime(objEnvironment),true);
    for(const objChange of [{MFA_ENCRYPTION_KEY_HEX:''},{PORT:'443'},{AUTH_ORIGIN:'http://localhost:3443'},
      {AUTH_ORIGIN:'https://wrong.invalid:3443'},{DEMO_PAYMENT_KEYS_PATH:''},{TLS_KEY_PATH:strCert}])
      assert.throws(()=>validateRuntime({...objEnvironment,...objChange}));
    const strDataKey=join(strData,'payment.json');writeFileSync(strDataKey,readFileSync(strPayment));chmodSync(strDataKey,0o600);
    assert.throws(()=>validateRuntime({...objEnvironment,DEMO_PAYMENT_KEYS_PATH:strDataKey}),/separate/);
    const objResult=spawnSync(process.execPath,['scripts/validate-runtime.js'],{env:{...objEnvironment,PORT:'bad'},encoding:'utf8'});
    assert.equal(objResult.status,1);assert.doesNotMatch(objResult.stdout+objResult.stderr,new RegExp(strSecret));
    assert.match(objResult.stderr,/preflight failed/);
  }finally{rmSync(strRoot,{recursive:true,force:true});}
});

