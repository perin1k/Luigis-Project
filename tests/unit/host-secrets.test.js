import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,lstatSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createHostSecretFiles,preparePaymentRotation} from '../../scripts/setup-host-secrets.js';
import {loadPaymentVault} from '../../src/payments/payment-config.js';

function fixture(fnWork){const strRoot=mkdtempSync(join(tmpdir(),'luigis-custody-'));
  const strData=join(strRoot,'data');const strRelease=join(strRoot,'release');mkdirSync(strData);mkdirSync(strRelease);
  const objOptions={strDataDirectory:strData,strReleaseDirectory:strRelease,strOrigin:'https://localhost:3443',strHost:'127.0.0.1',strEnvironment:'ci-demo'};
  try{fnWork({strRoot,strData,strRelease,objOptions});}finally{rmSync(strRoot,{recursive:true,force:true});}}

test('separate environments get fresh independent private keys without overwrite',()=>fixture(({strRoot,objOptions})=>{
  const strA=join(strRoot,'keys-a');const strB=join(strRoot,'keys-b');
  createHostSecretFiles(strA,objOptions);createHostSecretFiles(strB,objOptions);
  const objA=JSON.parse(readFileSync(join(strA,'payment-keys.json')));const objB=JSON.parse(readFileSync(join(strB,'payment-keys.json')));
  const strEnv=readFileSync(join(strA,'runtime.env'),'utf8');const strMfa=strEnv.match(/^MFA_ENCRYPTION_KEY_HEX=([a-f0-9]{64})$/m)?.[1];
  assert.equal(Boolean(strMfa),true);assert.equal(Object.values(objA.mapKeys)[0]===strMfa,false);
  assert.equal(Object.values(objA.mapKeys)[0]===Object.values(objB.mapKeys)[0],false);
  assert.match(strEnv,/LUIGIS_ENVIRONMENT=ci-demo/);assert.match(strEnv,/PORT=3443/);
  const objBefore=readFileSync(join(strA,'runtime.env'));
  assert.throws(()=>createHostSecretFiles(strA,objOptions));assert.equal(readFileSync(join(strA,'runtime.env')).equals(objBefore),true);
  if(process.platform!=='win32')for(const strName of ['runtime.env','payment-keys.json'])assert.equal(lstatSync(join(strA,strName)).mode&0o777,0o600);
}));

test('setup rejects source/data placement and environment-line injection before creating secrets',()=>fixture(({strRoot,strData,strRelease,objOptions})=>{
  for(const strPath of [join(strData,'keys'),join(strRelease,'keys')])assert.throws(()=>createHostSecretFiles(strPath,objOptions));
  for(const objChange of [{strOrigin:'http://localhost'},{strOrigin:'https://localhost/path'},
    {strHost:'127.0.0.1\nBAD=1'},{strEnvironment:'live'},{strDataDirectory:strData+'\nBAD=1'}])
    assert.throws(()=>createHostSecretFiles(join(strRoot,'invalid'),{...objOptions,...objChange}));
}));

test('payment rotation stages a new active version while retaining old decryptability and source bytes',()=>fixture(({strRoot,objOptions})=>{
  const strDirectory=join(strRoot,'keys');createHostSecretFiles(strDirectory,objOptions);
  const strSource=join(strDirectory,'payment-keys.json');const strCandidate=join(strDirectory,'next-payment.json');
  const objBefore=readFileSync(strSource);const objIdentity={strPaymentId:'p',strOrderId:'o',strQuoteId:'q'};
  const strSynthetic='0000123456789012';const objRecord=loadPaymentVault(strSource).encrypt(strSynthetic,objIdentity);
  preparePaymentRotation(strSource,strCandidate);
  assert.equal(readFileSync(strSource).equals(objBefore),true);
  const objVault=loadPaymentVault(strCandidate);assert.equal(objVault.decrypt(objRecord,objIdentity)===strSynthetic,true);
  const objNew=objVault.encrypt(strSynthetic,objIdentity);assert.notEqual(objNew.strKeyId,objRecord.strKeyId);
  assert.throws(()=>preparePaymentRotation(strSource,strCandidate));
  const objRing=JSON.parse(readFileSync(strCandidate));delete objRing.mapKeys[objRecord.strKeyId];
  writeFileSync(strCandidate,JSON.stringify(objRing));
  assert.throws(()=>loadPaymentVault(strCandidate).decrypt(objRecord,objIdentity),/Unable to verify/);
}));

test('rotation refuses a full key ring without discarding any existing version',()=>fixture(({strRoot,objOptions})=>{
  const strDirectory=join(strRoot,'keys');createHostSecretFiles(strDirectory,objOptions);
  const strSource=join(strDirectory,'payment-keys.json');
  const mapKeys=Object.fromEntries(Array.from({length:8},(_,intIndex)=>['v'+intIndex,randomBytes(32).toString('hex')]));
  writeFileSync(strSource,JSON.stringify({strActiveKeyId:'v7',mapKeys}));const objBefore=readFileSync(strSource);
  assert.throws(()=>preparePaymentRotation(strSource,join(strDirectory,'next.json')),/old ciphertext/);
  assert.equal(readFileSync(strSource).equals(objBefore),true);
}));
