import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import {createAuthenticatorQr} from '../../src/auth/authenticator-qr.js';

test('authenticator QR represents the complete local provisioning URI with bounded binary modules',()=>{
  const strUri='otpauth://totp/Luigis:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Luigis&algorithm=SHA1&digits=6&period=30';
  const objQr=createAuthenticatorQr(strUri);
  const objExpected=QRCode.create(strUri,{errorCorrectionLevel:'M'}).modules;
  assert.equal(objQr.intSize,objExpected.size);
  assert.equal(objQr.strModules,Array.from(objExpected.data).join(''));
  assert.equal(objQr.strModules.length,objQr.intSize**2);
  assert.match(objQr.strModules,/^[01]+$/);
  assert.equal(JSON.stringify(objQr).includes('JBSWY3DPEHPK3PXP'),false);
});

test('authenticator QR refuses external URLs, incomplete keys and oversized input',()=>{
  for(const strUri of ['https://example.test/?secret=private','otpauth://hotp/test?secret=JBSWY3DPEHPK3PXP',
    'otpauth://totp/test','otpauth://totp/test?secret=bad','x'.repeat(2049),null])
    assert.throws(()=>createAuthenticatorQr(strUri),/^Error: Invalid authenticator setup\.$/);
});
