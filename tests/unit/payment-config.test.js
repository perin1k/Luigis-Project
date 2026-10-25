import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {loadPaymentVault} from '../../src/payments/payment-config.js';
test('payment vault requires explicit valid external configuration and private permissions',()=>{
  assert.equal(loadPaymentVault(undefined),null);assert.throws(()=>loadPaymentVault(''));
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-key-test-'));const strPath=join(strDirectory,'key.json');
  try{
    writeFileSync(strPath,JSON.stringify({strActiveKeyId:'test',mapKeys:{test:randomBytes(32).toString('hex')}}),{mode:0o600});assert.equal(typeof loadPaymentVault(strPath).encrypt,'function');
    if(process.platform!=='win32'){chmodSync(strPath,0o644);assert.throws(()=>loadPaymentVault(strPath),/permissions/);chmodSync(strPath,0o600);const strLink=join(strDirectory,'link');symlinkSync(strPath,strLink);assert.throws(()=>loadPaymentVault(strLink));}
    writeFileSync(strPath,'{"strActiveKeyId":"missing","mapKeys":{}}');assert.throws(()=>loadPaymentVault(strPath),/configuration/);
  }finally{rmSync(strDirectory,{recursive:true,force:true});}
});
