import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { gunzipSync } from 'node:zlib';
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
