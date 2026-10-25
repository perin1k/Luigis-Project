/**
 * Encrypts a short-lived DNS transfer for the VM public key. Reads secret input from a
 * pipe, writes a new ciphertext file and clears temporary buffers; never pass tokens as
 * command arguments.
 */
import {publicEncrypt,constants} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
let objInput;let objPayload;
try{
  if(process.stdin.isTTY||process.argv.length!==4)throw new Error();
  objInput=readFileSync(0);
  const strToken=objInput.toString('utf8').trim();
  if(!/^[A-Za-z0-9-]{16,256}$/.test(strToken))throw new Error();
  objPayload=Buffer.from(JSON.stringify({strDomain:'luigispizzeria',strToken,intExpiresAt:Date.now()+600000}));
  const objCiphertext=publicEncrypt({key:readFileSync(process.argv[2]),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},objPayload);
  writeFileSync(process.argv[3],objCiphertext,{flag:'wx',mode:0o600});
  console.log('VM-encrypted DNS transfer prepared.');
}catch{console.error('Encrypted DNS transfer preparation failed; existing files are never overwritten.');process.exitCode=1;}
finally{objInput?.fill(0);objPayload?.fill(0);}
