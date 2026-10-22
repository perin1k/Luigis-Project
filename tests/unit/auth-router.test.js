import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import { openDatabase } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { hashPassword } from '../../src/auth/password-service.js';
import { createLoginService } from '../../src/auth/login-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createSessionService } from '../../src/auth/session-service.js';
import { createAuthRouter } from '../../src/auth/auth-router.js';
import { AUTH_COOKIES } from '../../src/auth/auth-transport.js';
import { createStaffAccountService } from '../../src/auth/staff-account-service.js';

// Disposable self-signed TLS materials, generated locally; never real credentials.
const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-auth-tls-'));
after(() => rmSync(strDirectory, { recursive: true, force: true }));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(strDirectory, 'key.pem'),
  '-out', join(strDirectory, 'cert.pem'), '-subj', '/CN=auth.example.test', '-days', '1'], { stdio: 'ignore' });
const objTls = { key: readFileSync(join(strDirectory, 'key.pem')), cert: readFileSync(join(strDirectory, 'cert.pem')) };
const PASSWORD = 'Synthetic router passphrase only';
const STR_HASH = await hashPassword(PASSWORD);
const ORIGIN = 'https://auth.example.test';

async function fixture({ bTls = true, bFailure = false } = {}) {
  const objDb = openDatabase(':memory:');
  applyMigrations(objDb);
  let numNow = Date.parse('2026-10-21T12:00:00.000Z');
  const fnNow = () => new Date(numNow);
  objDb.exec(`INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES
    ('employee', 'test-employee', 'employee', '2026-10-20T00:00:00.000Z'),
    ('admin', 'test-admin', 'admin', '2026-10-20T00:00:00.000Z')`);
  for (const strUser of ['employee', 'admin']) objDb.prepare(`INSERT INTO staff_credentials
    (user_id, username, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?)`)
    .run(strUser, strUser, STR_HASH, fnNow().toISOString(), fnNow().toISOString());
  const objMfa = createMfaService(objDb, { strEncryptionKeyHex: 'cd'.repeat(32), fnNow });
  const objEnrollment = objMfa.beginEnrollment('admin');
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  objMfa.confirmEnrollment('admin', objEnrollment.strEnrollmentId, objTotp.generate({ timestamp: numNow }));
  numNow += 30000;
  const objLogin = createLoginService(objDb, { objMfaService: objMfa, fnNow });
  const objSessions = createSessionService(objDb, { fnNow });
  const objApp = express();
  // Deliberately enable Express trust proxy: router must still reject plaintext/spoofed source.
  objApp.set('trust proxy', true);
  objApp.use('/auth', createAuthRouter({ objLoginService: bFailure ? { ...objLogin,
    beginSignIn() { throw new Error('synthetic-private-database-detail'); } } : objLogin,
  objSessionService: objSessions, objStaffAccountService: createStaffAccountService(objDb, { fnNow }), strOrigin: ORIGIN }));
  const objServer = bTls ? createServer(objTls, objApp) : objApp;
  const objListener = await new Promise((fnResolve) => { const objListening = objServer.listen(0, '127.0.0.1', () => fnResolve(objListening)); });
  const mapCookies = new Map();
  async function send(strPath, { strMethod = 'GET', objBody, strRawBody, objHeaders = {}, bStore = true } = {}) {
    const strBody = strRawBody ?? (objBody === undefined ? undefined : JSON.stringify(objBody));
    return new Promise((fnResolve, fnReject) => {
      const objReq = (bTls ? request : httpRequest)({ hostname: '127.0.0.1', port: objListener.address().port,
        path: `/auth${strPath}`, method: strMethod, rejectUnauthorized: false, // Isolated self-signed test server only.
        headers: { host: 'auth.example.test', cookie: [...mapCookies].map(([strKey, strValue]) => `${strKey}=${strValue}`).join(';'),
          ...(strBody !== undefined ? { 'content-type': 'application/json' } : {}), ...objHeaders } }, (objRes) => {
        let strText = '';
        objRes.setEncoding('utf8'); objRes.on('data', (strChunk) => { strText += strChunk; });
        objRes.on('end', () => {
          if (bStore) for (const strCookie of objRes.headers['set-cookie'] ?? []) {
            const [strPair] = strCookie.split(';'); const intEqual = strPair.indexOf('=');
            const strName = strPair.slice(0, intEqual); const strValue = strPair.slice(intEqual + 1);
            if (strValue) mapCookies.set(strName, strValue); else mapCookies.delete(strName);
          }
          fnResolve({ intStatus: objRes.statusCode, objHeaders: objRes.headers, strText,
            objBody: strText ? JSON.parse(strText) : null });
        });
      });
      objReq.on('error', fnReject); objReq.end(strBody);
    });
  }
  async function post(strPath, objBody, objHeaders = {}) {
    const objCsrf = await send('/csrf');
    return send(strPath, { strMethod: 'POST', objBody,
      objHeaders: { origin: ORIGIN, 'x-csrf-token': objCsrf.objBody.strCsrfToken, ...objHeaders } });
  }
  return { objDb, mapCookies, send, post, code: () => objTotp.generate({ timestamp: numNow }),
    advance: (intMilliseconds) => { numNow += intMilliseconds; },
    close: async () => { await new Promise((fnResolve) => objListener.close(fnResolve)); objMfa.destroy(); objDb.close(); } };
}

test('HTTPS sign-in keeps tokens in protected host cookies; session identity and logout use real services', async () => {
  const obj = await fixture();
  try {
    const objResult = await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    assert.equal(objResult.intStatus, 200);
    assert.deepEqual(objResult.objBody, { strState: 'authenticated' });
    const strCookie = objResult.objHeaders['set-cookie'].find((strValue) => strValue.startsWith(`${AUTH_COOKIES.strSession}=`));
    for (const strFlag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(strCookie.includes(strFlag));
    assert.ok(!strCookie.includes('Domain='));
    assert.equal(objResult.objHeaders['cache-control'], 'no-store');
    assert.equal(objResult.objHeaders['x-robots-tag'], 'noindex');
    assert.deepEqual((await obj.send('/session')).objBody, { strUserId: 'employee', strRole: 'employee' });
    assert.equal((await obj.post('/logout', {})).intStatus, 204);
    assert.equal((await obj.send('/session')).intStatus, 401);
    assert.equal(obj.mapCookies.size, 0);
    assert.ok(obj.objDb.prepare('SELECT revoked_at FROM staff_sessions').get().revoked_at);
  } finally { await obj.close(); }
});

test('admin challenge never becomes a session without MFA; CSRF is rebound after each stage', async () => {
  const obj = await fixture();
  try {
    const objOldCsrf = await obj.send('/csrf');
    assert.deepEqual((await obj.post('/login', { strUsername: 'admin', strPassword: PASSWORD })).objBody, { strState: 'mfa_required' });
    assert.equal((await obj.send('/session')).intStatus, 401);
    const strChallenge = obj.mapCookies.get(AUTH_COOKIES.strChallenge);
    assert.ok(strChallenge);
    assert.equal((await obj.send('/mfa', { strMethod: 'POST', objBody: { strCode: obj.code() },
      objHeaders: { origin: ORIGIN, 'x-csrf-token': objOldCsrf.objBody.strCsrfToken } })).intStatus, 403);
    assert.equal((await obj.post('/mfa', { strCode: obj.code() })).intStatus, 200);
    assert.equal(obj.mapCookies.has(AUTH_COOKIES.strChallenge), false);
    assert.equal((await obj.send('/session')).objBody.strRole, 'admin');
    assert.equal((await obj.post('/mfa', { strCode: obj.code() })).intStatus, 401);
  } finally { await obj.close(); }
});

test('missing/forged CSRF, hostile origin, fetch-site and duplicate cookies reject before sign-in', async () => {
  const obj = await fixture();
  try {
    const objBody = { strUsername: 'employee', strPassword: PASSWORD };
    assert.equal((await obj.send('/login', { strMethod: 'POST', objBody, objHeaders: { origin: ORIGIN } })).intStatus, 403);
    assert.equal((await obj.post('/login', objBody, { origin: 'https://hostile.test' })).intStatus, 403);
    assert.equal((await obj.post('/login', objBody, { 'x-csrf-token': '0'.repeat(64) })).intStatus, 403);
    assert.equal((await obj.post('/login', objBody, { 'sec-fetch-site': 'same-site' })).intStatus, 403);
    assert.equal((await obj.send('/csrf', { objHeaders: { cookie: `${AUTH_COOKIES.strSession}=${'a'.repeat(64)}; ${AUTH_COOKIES.strSession}=${'b'.repeat(64)}` } })).intStatus, 400);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions').get().total, 0);
  } finally { await obj.close(); }
});

test('plaintext and forwarded-proto spoofing cannot bypass direct TLS; host is pinned', async () => {
  const obj = await fixture({ bTls: false });
  try { assert.equal((await obj.send('/csrf', { objHeaders: { 'x-forwarded-proto': 'https' } })).intStatus, 403); }
  finally { await obj.close(); }
  const objTlsFixture = await fixture();
  try { assert.equal((await objTlsFixture.send('/csrf', { objHeaders: { host: 'hostile.test' } })).intStatus, 403); }
  finally { await objTlsFixture.close(); }
});

test('JSON body limits, content type, malformed payloads and claimed roles fail safely', async () => {
  const obj = await fixture();
  try {
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD, strRole: 'admin' })).intStatus, 400);
    assert.equal((await obj.post('/login', { strUsername: [], strPassword: PASSWORD })).intStatus, 400);
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD }, { 'content-type': 'text/plain' })).intStatus, 415);
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: 'x'.repeat(5000) })).intStatus, 413);
    const objCsrf = await obj.send('/csrf');
    assert.equal((await obj.send('/login', { strMethod: 'POST', strRawBody: '{invalid',
      objHeaders: { origin: ORIGIN, 'x-csrf-token': objCsrf.objBody.strCsrfToken } })).intStatus, 400);
  } finally { await obj.close(); }
});

test('repeated sign-in rotates and revokes old sessions; logout cancels pending MFA', async () => {
  const obj = await fixture();
  try {
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    const strOld = obj.mapCookies.get(AUTH_COOKIES.strSession);
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    assert.notEqual(obj.mapCookies.get(AUTH_COOKIES.strSession), strOld);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_sessions WHERE revoked_at IS NOT NULL').get().total, 1);
    await obj.post('/login', { strUsername: 'admin', strPassword: PASSWORD });
    await obj.post('/logout', {});
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM login_challenges').get().total, 0);
  } finally { await obj.close(); }
});

test('credential failures are generic, internal errors return safe service-unavailable responses', async () => {
  const obj = await fixture();
  try {
    const objWrong = await obj.post('/login', { strUsername: 'employee', strPassword: 'wrong' });
    const objUnknown = await obj.post('/login', { strUsername: 'unknown', strPassword: PASSWORD });
    assert.equal(objWrong.intStatus, 401); assert.deepEqual(objWrong.objBody, objUnknown.objBody);
  } finally { await obj.close(); }
  const objFailed = await fixture({ bFailure: true });
  try {
    const objResult = await objFailed.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    assert.equal(objResult.intStatus, 503); assert.ok(!objResult.strText.includes('private'));
  } finally { await objFailed.close(); }
});

test('idle expiry denies identity and forwarded addresses do not bypass account/source controls', async () => {
  const obj = await fixture();
  try {
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    obj.advance(30 * 60000);
    assert.equal((await obj.send('/session')).intStatus, 401);
    for (let intIndex = 0; intIndex < 5; intIndex++) await obj.post('/login',
      { strUsername: 'employee', strPassword: 'incorrect' }, { 'x-forwarded-for': `192.0.2.${intIndex}` });
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD },
      { 'x-forwarded-for': '192.0.2.99' })).intStatus, 401);
    // All five password attempts used one real socket source, despite distinct headers.
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM login_limits').get().total, 2);
  } finally { await obj.close(); }
});

test('logout blocks server-side reuse of a copied session cookie', async () => {
  const obj = await fixture();
  try {
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    const strCopiedCookie = `${AUTH_COOKIES.strSession}=${obj.mapCookies.get(AUTH_COOKIES.strSession)}`;
    await obj.post('/logout', {});
    assert.equal((await obj.send('/session', { objHeaders: { cookie: strCopiedCookie } })).intStatus, 401);
  } finally { await obj.close(); }
});

async function signInAdmin(objFixture) {
  assert.equal((await objFixture.post('/login', { strUsername: 'admin', strPassword: PASSWORD })).intStatus, 200);
  assert.equal((await objFixture.post('/mfa', { strCode: objFixture.code() })).intStatus, 200);
}

test('admin HTTPS deactivation revokes an existing employee session and repeats without duplicate audits', async () => {
  const obj = await fixture();
  try {
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    const strEmployeeCookie = `${AUTH_COOKIES.strSession}=${obj.mapCookies.get(AUTH_COOKIES.strSession)}`;
    // Separate browser identities: admin sign-in must not itself revoke the target's session.
    obj.mapCookies.delete(AUTH_COOKIES.strSession);
    await signInAdmin(obj);
    assert.equal((await obj.send('/session', { objHeaders: { cookie: strEmployeeCookie }, bStore: false })).intStatus, 200);
    const objResult = await obj.post('/employees/deactivate', { strEmployeeId: 'employee' });
    assert.equal(objResult.intStatus, 200); assert.deepEqual(objResult.objBody, { strState: 'disabled' });
    assert.equal(objResult.objHeaders['cache-control'], 'no-store');
    assert.equal((await obj.send('/session', { objHeaders: { cookie: strEmployeeCookie } })).intStatus, 401);
    assert.deepEqual((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).objBody, { strState: 'already_disabled' });
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM audit_events WHERE action='staff_change'").get().total, 1);
    assert.equal((await obj.send('/session')).objBody.strRole, 'admin');
  } finally { await obj.close(); }
});

test('deactivation denies unauthenticated, employee and MFA-pending callers without mutation', async () => {
  const obj = await fixture();
  try {
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 403);
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 403);
    await obj.post('/logout', {});
    await obj.post('/login', { strUsername: 'admin', strPassword: PASSWORD });
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 403);
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
  } finally { await obj.close(); }
});

test('deactivation rejects expired and revoked admin cookies', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj);
    const strCopied = obj.mapCookies.get(AUTH_COOKIES.strSession);
    obj.advance(30 * 60000);
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 403);
    obj.mapCookies.set(AUTH_COOKIES.strSession, strCopied);
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 403);
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
  } finally { await obj.close(); }
});

test('deactivation protects admin/unknown targets and rejects role injection and invalid bodies', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj);
    for (const strTarget of ['admin', 'unknown']) {
      assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: strTarget })).intStatus, 403);
    }
    for (const objBody of [{}, { strEmployeeId: '' }, { strEmployeeId: [] }, { strEmployeeId: 'x'.repeat(129) },
      { strEmployeeId: 'employee', strRole: 'admin' }, { strEmployeeId: 'employee', strActorId: 'admin' }]) {
      assert.equal((await obj.post('/employees/deactivate', objBody)).intStatus, 400);
    }
    assert.equal(obj.objDb.prepare("SELECT count(*) AS total FROM audit_events WHERE action='staff_change'").get().total, 0);
  } finally { await obj.close(); }
});

test('deactivation requires CSRF and POST, and audit failure returns a safe error with no partial changes', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj);
    assert.equal((await obj.send('/employees/deactivate', { strMethod: 'POST', objBody: { strEmployeeId: 'employee' },
      objHeaders: { origin: ORIGIN } })).intStatus, 403);
    assert.equal((await obj.send('/employees/deactivate')).intStatus, 404);
    obj.objDb.exec("CREATE TRIGGER synthetic_deactivation_failure BEFORE INSERT ON audit_events WHEN NEW.action='staff_change' BEGIN SELECT RAISE(ABORT, 'private audit failure'); END");
    const objResult = await obj.post('/employees/deactivate', { strEmployeeId: 'employee' });
    assert.equal(objResult.intStatus, 503); assert.ok(!objResult.strText.includes('private'));
    assert.equal(obj.objDb.prepare("SELECT state FROM staff_users WHERE id='employee'").get().state, 'active');
    assert.equal(obj.objDb.prepare("SELECT epoch FROM login_identity_versions WHERE user_id='employee'").get().epoch, 1);
    obj.objDb.exec('DROP TRIGGER synthetic_deactivation_failure');
    assert.equal((await obj.post('/employees/deactivate', { strEmployeeId: 'employee' })).intStatus, 200);
  } finally { await obj.close(); }
});
