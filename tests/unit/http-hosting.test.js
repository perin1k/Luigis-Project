import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import objApp from '../../src/app.js';

let objServer;
let intPort;
before(async () => {
  objServer = objApp.listen(0, '127.0.0.1');
  await new Promise((fnResolve, fnReject) => {
    objServer.once('listening', fnResolve);
    objServer.once('error', fnReject);
  });
  intPort = objServer.address().port;
});
after(async () => {
  if (objServer) await new Promise((fnResolve) => objServer.close(fnResolve));
});

function requestText(strPath, strEncoding, objOptions = {}) {
  return new Promise((fnResolve, fnReject) => {
    const objRequest = get({ hostname: '127.0.0.1', port: intPort, path: strPath,
      method: objOptions.strMethod ?? 'GET',
      headers: { 'Accept-Encoding': strEncoding, ...objOptions.objHeaders } }, (objResponse) => {
      const arrChunks = [];
      objResponse.on('data', (objChunk) => arrChunks.push(objChunk));
      objResponse.on('end', () => fnResolve({ intStatus: objResponse.statusCode,
        objHeaders: objResponse.headers, objBody: Buffer.concat(arrChunks) }));
      objResponse.on('error', fnReject);
    });
    objRequest.on('error', fnReject);
  });
}

test('gzip text responses decode to the same HTML, CSS and JavaScript as identity responses', async () => {
  for (const strPath of ['/', '/order', '/preview/confirmation', '/vendor/bootstrap.min.css',
    '/css/tokens.css', '/css/global.css', '/css/ordering.css', '/js/theme.js',
    '/js/ordering/order-wizard.js', '/js/ordering/order-model.js', '/js/checkout/payment.js']) {
    const objIdentity = await requestText(strPath, 'identity');
    const objGzip = await requestText(strPath, 'gzip');
    assert.equal(objGzip.intStatus, 200, strPath);
    assert.equal(objGzip.objHeaders['content-encoding'], 'gzip', strPath);
    assert.equal(objIdentity.objHeaders['content-encoding'], undefined, strPath);
    assert.match(objGzip.objHeaders.vary, /Accept-Encoding/i, strPath);
    assert.equal(objGzip.objHeaders['content-type'], objIdentity.objHeaders['content-type'], strPath);
    assert.deepEqual(gunzipSync(objGzip.objBody), objIdentity.objBody, strPath);
    assert.ok(objGzip.objBody.length < objIdentity.objBody.length, strPath);
    assert.equal(Number(objGzip.objHeaders['content-length']), objGzip.objBody.length, strPath);
  }
});

test('asset caching, HEAD and range responses preserve their HTTP semantics', async () => {
  const objGzip = await requestText('/css/global.css', 'gzip');
  assert.match(objGzip.objHeaders['cache-control'], /public, max-age=3600/);
  const objCached = await requestText('/css/global.css', 'gzip', {
    objHeaders: { 'If-None-Match': objGzip.objHeaders.etag } });
  assert.equal(objCached.intStatus, 304);
  assert.equal(objCached.objBody.length, 0);
  const objHead = await requestText('/css/global.css', 'gzip', { strMethod: 'HEAD' });
  assert.equal(objHead.objBody.length, 0);
  assert.equal(objHead.objHeaders['content-length'], objGzip.objHeaders['content-length']);
  const objIdentity = await requestText('/css/global.css', 'identity');
  const objRange = await requestText('/css/global.css', 'gzip', {
    objHeaders: { Range: 'bytes=0-15' } });
  assert.equal(objRange.intStatus, 206);
  assert.equal(objRange.objHeaders['content-encoding'], undefined);
  assert.deepEqual(objRange.objBody, objIdentity.objBody.subarray(0, 16));
  assert.match(objRange.objHeaders.vary, /Accept-Encoding/i);
});

test('encoding negotiation honors refusals and compression does not expose private files', async () => {
  const objRefused = await requestText('/order', 'gzip;q=0, identity;q=0, *;q=0');
  assert.equal(objRefused.intStatus, 406);
  const objIdentity = await requestText('/order', 'gzip;q=0, identity;q=1');
  assert.equal(objIdentity.intStatus, 200);
  assert.equal(objIdentity.objHeaders['content-encoding'], undefined);
  for (const strPath of ['/src/app.js', '/.env', '/node_modules/bootstrap/package.json']) {
    assert.equal((await requestText(strPath, 'gzip')).intStatus, 404);
  }
});

test('unconfigured availability stays unknown and error pages retain safe HTTP semantics', async () => {
  const objOrder = await requestText('/order', 'identity');
  assert.match(objOrder.objBody.toString(), /data-known="false"/);
  assert.equal(objOrder.objHeaders['cache-control'], 'no-store');
  const objMissing = await requestText('/missing', 'gzip');
  assert.equal(objMissing.intStatus, 404);
  assert.match(gunzipSync(objMissing.objBody).toString(), /This page isn’t on the menu/);
  assert.equal(objMissing.objHeaders['x-robots-tag'], 'noindex');
  assert.equal(objMissing.objHeaders['cache-control'], 'no-store');
  const fnPrevious = objApp.locals.fnGetAvailability;
  try {
    objApp.locals.fnGetAvailability = async () => { throw new Error('PRIVATE_TEST_ERROR'); };
    const objFailed = await requestText('/order', 'identity');
    assert.equal(objFailed.intStatus, 500);
    assert.match(objFailed.objBody.toString(), /A little trouble in the kitchen/);
    assert.doesNotMatch(objFailed.objBody.toString(), /PRIVATE_TEST_ERROR/);
    assert.equal(objFailed.objHeaders['x-robots-tag'], 'noindex');
    assert.equal(objFailed.objHeaders['cache-control'], 'no-store');
  } finally { objApp.locals.fnGetAvailability = fnPrevious; }
});

test('Brotli public assets preserve exact bytes, negotiation, caching and HEAD without changing private HTML encoding',async()=>{
  for(const strPath of ['/vendor/bootstrap.min.css','/css/staff-bundle.css','/css/tracking-bundle.css','/js/tracking.js']){
    const objIdentity=await requestText(strPath,'identity');const objBrotli=await requestText(strPath,'br, gzip');
    assert.equal(objBrotli.objHeaders['content-encoding'],'br');assert.deepEqual(brotliDecompressSync(objBrotli.objBody),objIdentity.objBody);assert.match(objBrotli.objHeaders.vary,/Accept-Encoding/i);
    assert.equal((await requestText(strPath,'br;q=0, gzip;q=1')).objHeaders['content-encoding'],'gzip');
    const objHead=await requestText(strPath,'br',{strMethod:'HEAD'});assert.equal(objHead.objBody.length,0);assert.equal(objHead.objHeaders['content-length'],objBrotli.objHeaders['content-length']);
    assert.equal((await requestText(strPath,'br',{objHeaders:{'If-None-Match':objBrotli.objHeaders.etag}})).intStatus,304);
  }
  const objGzip=await requestText('/order','br, gzip');assert.equal(objGzip.objHeaders['content-encoding'],'gzip');
  assert.equal((await requestText('/vendor/bootstrap.min.css','br;q=0, gzip;q=0, identity;q=0')).intStatus,406);
});

test('security headers cover public assets, pages and failures without exposing the framework',async()=>{
  for(const strPath of ['/','/order','/js/theme.js','/missing-security-fixture']){
    const objResponse=await requestText(strPath,'identity');
    assert.equal(objResponse.objHeaders['x-powered-by'],undefined,strPath);
    assert.equal(objResponse.objHeaders['x-content-type-options'],'nosniff',strPath);
    assert.match(objResponse.objHeaders['content-security-policy'],/default-src 'self'/,strPath);
    assert.match(objResponse.objHeaders['content-security-policy'],/frame-ancestors 'none'/,strPath);
    assert.match(objResponse.objHeaders['content-security-policy'],/object-src 'none'/,strPath);
    assert.match(objResponse.objHeaders['content-security-policy'],/form-action 'self'/,strPath);
    assert.ok(objResponse.objHeaders['referrer-policy'],strPath);
  }
});

test('private source, templates, database and encoded traversal paths are never served as assets',async()=>{
  for(const strPath of ['/.git/config','/package.json','/src/server.js','/src/views/pages/order.ejs',
    '/data/luigis.sqlite','/src/data/migrations/005-access-and-audit.sql',
    '/%2e%2e/package.json','/css/%2e%2e/%2e%2e/package.json','/%2eenv']){
    const objResponse=await requestText(strPath,'identity');
    assert.equal(objResponse.intStatus,404,strPath);
    assert.equal(objResponse.objHeaders['cache-control'],'no-store',strPath);
    assert.doesNotMatch(objResponse.objBody.toString(),/BEGIN PRIVATE KEY|CREATE TABLE audit_events|"dependencies"\s*:/,strPath);
  }
});

test('forwarded headers cannot enable staff access or alter public response security on an unconfigured HTTP server',async()=>{
  for(const strPath of ['/api/staff/orders','/api/auth/session','/staff/analytics']){
    const objResponse=await requestText(strPath,'identity',{objHeaders:{
      'X-Forwarded-Proto':'https','X-Forwarded-Host':'staff.example.invalid','X-Forwarded-For':'127.0.0.1',
      Cookie:'staff_session=forged-security-fixture',Origin:'https://staff.example.invalid'}});
    assert.equal(objResponse.intStatus,404,strPath);
    assert.equal(objResponse.objHeaders['cache-control'],'no-store',strPath);
    assert.match(objResponse.objHeaders['content-security-policy'],/frame-ancestors 'none'/,strPath);
  }
});
