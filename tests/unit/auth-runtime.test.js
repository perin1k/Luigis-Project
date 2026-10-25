import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:https';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaffFixture } from '../fixtures/staff-app.js';
import { createAuthRuntime } from '../../src/auth/auth-runtime.js';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';

test('mounted staff pages are private, escaped and require a real persisted session', async () => {
  const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-runtime-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(strDirectory, 'key.pem'),
    '-out', join(strDirectory, 'cert.pem'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
  const objFixture = createStaffFixture('https://localhost');
  const objServer = createServer({ key: readFileSync(join(strDirectory, 'key.pem')), cert: readFileSync(join(strDirectory, 'cert.pem')) }, objFixture.objApp);
  await new Promise((fnResolve) => objServer.listen(0, '127.0.0.1', fnResolve));
  function get(strPath, strHost = 'localhost', objHeaders = {}) {
    return new Promise((fnResolve, fnReject) => {
      const objRequest = request({ hostname: '127.0.0.1', port: objServer.address().port, path: strPath,
        headers: { Host: strHost, ...objHeaders }, rejectUnauthorized: false }, (objResponse) => {
        let strBody = ''; objResponse.on('data', (objChunk) => { strBody += objChunk; });
        objResponse.on('end', () => fnResolve({ intStatus: objResponse.statusCode, objHeaders: objResponse.headers, strBody }));
      }); objRequest.on('error', fnReject); objRequest.end();
    });
  }
  try {
    for (const strPath of ['/staff/sign-in', '/staff/enroll', '/staff/recovery']) {
      const objResponse = await get(strPath);
      assert.equal(objResponse.intStatus, 200); assert.equal(objResponse.objHeaders['cache-control'], 'no-store');
      assert.equal(objResponse.objHeaders['referrer-policy'], 'no-referrer'); assert.equal(objResponse.objHeaders['x-robots-tag'], 'noindex');
      assert.match(objResponse.strBody, /method="post" action="\/auth\/unavailable"/);
      assert.doesNotMatch(objResponse.strBody, /Synthetic staff browser passphrase/);
      assert.equal((objResponse.strBody.match(/rel="stylesheet"/g) ?? []).length, 1);
      assert.match(objResponse.strBody, /href="\/css\/tracking-bundle.css\?v=[a-f0-9]{12}"/);
    }
    const objStyles = await get('/css/staff-bundle.css', 'localhost', { Range: 'bytes=0-9' });
    assert.equal(objStyles.intStatus, 200); assert.match(objStyles.objHeaders['content-type'], /text\/css/);
    assert.match(objStyles.strBody, /--color-paper/); assert.match(objStyles.strBody, /staff-page/);
    const objAccount = await get('/staff/account'); assert.equal(objAccount.intStatus, 303);
    assert.equal(objAccount.objHeaders.location, '/staff/sign-in');
    assert.equal((await get('/staff/sign-in', 'attacker.test')).intStatus, 403);
    assert.equal((await get('/staff/sign-in', 'localhost')).intStatus, 200);
    assert.equal((await get('/auth/session')).intStatus, 401);
  } finally { await new Promise((fnResolve) => objServer.close(fnResolve)); objFixture.close(); rmSync(strDirectory, { recursive: true, force: true }); }
});
test('auth composition rejects missing key and malformed origin without creating accounts', () => {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase);
  try {
    assert.throws(() => createAuthRuntime(objDatabase, { strOrigin: 'https://localhost' }));
    assert.throws(() => createAuthRuntime(objDatabase, { strOrigin: 'http://localhost', strEncryptionKeyHex: 'ab'.repeat(32) }));
    assert.equal(objDatabase.prepare('SELECT count(*) AS intCount FROM staff_users').get().intCount, 0);
  } finally { objDatabase.close(); }
});

test('partial auth configuration fails startup without HTTP downgrade or private details', () => {
  const objResult = spawnSync(process.execPath, ['src/server.js'], { encoding: 'utf8',
    env: { PATH: process.env.PATH, AUTH_ORIGIN: 'https://localhost:3443', PORT: '3443' } });
  assert.equal(objResult.status, 1); assert.equal(objResult.stdout, '');
  assert.match(objResult.stderr, /Unable to start: check the private database, key and HTTPS configuration/);
  assert.doesNotMatch(objResult.stderr, /ENOENT|Error:|strEncryptionKeyHex/);
});
