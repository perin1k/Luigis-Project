import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,constants} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('DNS transfer encrypts for VM, bounds expiry, hides input and refuses overwrite',()=>{
  const strStage=mkdtempSync(join(tmpdir(),'luigis-dns-transfer-'));
  const strSynthetic='Synthetic-DNS-input-only-123456789';
  try{
    const {publicKey:objPublicKey,privateKey:objPrivateKey}=generateKeyPairSync('rsa',{modulusLength:4096});
    const strPublic=join(strStage,'public.pem');const strCipher=join(strStage,'transfer.bin');
    writeFileSync(strPublic,objPublicKey.export({type:'spki',format:'pem'}));
    const arrArguments=[resolve('scripts/encrypt-duckdns-transfer.js'),strPublic,strCipher];
    const intStart=Date.now();
    const objResult=spawnSync(process.execPath,arrArguments,{input:strSynthetic,encoding:'utf8'});
    assert.equal(objResult.status,0);assert.equal((objResult.stdout+objResult.stderr).includes(strSynthetic),false);
    const objCipher=readFileSync(strCipher);assert.equal(objCipher.includes(Buffer.from(strSynthetic)),false);
    const objTransfer=JSON.parse(privateDecrypt({key:objPrivateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},objCipher));
    assert.equal(objTransfer.strToken===strSynthetic,true);assert.equal(objTransfer.strDomain,'luigispizzeria');
    assert.equal(objTransfer.intExpiresAt>=intStart+600000&&objTransfer.intExpiresAt<=Date.now()+600000,true);
    assert.equal(spawnSync(process.execPath,arrArguments,{input:strSynthetic,encoding:'utf8'}).status,1);
    assert.equal(readFileSync(strCipher).equals(objCipher),true);
    const strInvalid=join(strStage,'invalid.bin');
    assert.equal(spawnSync(process.execPath,[arrArguments[0],strPublic,strInvalid],{input:'bad input',encoding:'utf8'}).status,1);
    assert.equal(existsSync(strInvalid),false);
  }finally{rmSync(strStage,{recursive:true,force:true});}
});
