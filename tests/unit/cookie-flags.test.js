import test from 'node:test';
import assert from 'node:assert/strict';
import { readCookieFlags } from '../helpers/cookie-flags.js';

const strSession='__Host-luigis-session=synthetic-only';
test('cookie flags survive an expiry comma fragmented into separate header rows',()=>{
 const arrHeaders=[
  {name:'set-cookie',value:strSession+'; Max-Age=28800; Path=/; Expires=Fri'},
  {name:'set-cookie',value:'23 Oct 2026 09:00:00 GMT; HttpOnly; Secure; SameSite=Strict'},
 ];
 const arrFlags=readCookieFlags(arrHeaders,'__Host-luigis-session');
 assert.ok(arrFlags.includes('secure'));assert.ok(arrFlags.includes('httponly'));
 assert.ok(arrFlags.includes('samesite=strict'));assert.ok(arrFlags.includes('path=/'));
});
test('cookie flags handle intact separate headers and combined cookie headers',()=>{
 const strCookie=strSession+'; Path=/; HttpOnly; Secure; SameSite=Strict';
 const arrExpected=['path=/','httponly','secure','samesite=strict'];
 assert.deepEqual(readCookieFlags([{name:'Set-Cookie',value:strCookie},{name:'Set-Cookie',value:'other=synthetic; Path=/'}],'__Host-luigis-session'),arrExpected);
 assert.deepEqual(readCookieFlags([{name:'set-cookie',value:'other=synthetic; Path=/, '+strCookie}],'__Host-luigis-session'),arrExpected);
});
test('another cookie cannot supply missing security flags for the session',()=>{
 const arrHeaders=[{name:'set-cookie',value:strSession+'; Path=/'},{name:'set-cookie',value:'other=synthetic; Secure; HttpOnly; SameSite=Strict'}];
 assert.deepEqual(readCookieFlags(arrHeaders,'__Host-luigis-session'),['path=/']);
});
test('an absent or similarly named cookie cannot satisfy the session assertion',()=>{
 assert.equal(readCookieFlags([{name:'set-cookie',value:'__Host-luigis-session-extra=synthetic; Secure'}],'__Host-luigis-session'),undefined);
 assert.equal(readCookieFlags([{name:'x-other',value:strSession+'; Secure'}],'__Host-luigis-session'),undefined);
});
