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
import { createStaffEnrollmentService } from '../../src/auth/staff-enrollment-service.js';
import { createRecoveryService } from '../../src/auth/recovery-service.js';

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
  const objRecovery = createRecoveryService(objDb, { strEncryptionKeyHex: 'cd'.repeat(32), fnNow });
  const objApp = express();
  // Deliberately enable Express trust proxy: router must still reject plaintext/spoofed source.
  objApp.set('trust proxy', true);
  objApp.use('/auth', createAuthRouter({ objLoginService: bFailure ? { ...objLogin,
    beginSignIn() { throw new Error('synthetic-private-database-detail'); } } : objLogin,
  objSessionService: objSessions, objStaffAccountService: createStaffAccountService(objDb, { fnNow, objMfaService: objMfa }),
  objStaffEnrollmentService: createStaffEnrollmentService(objDb, { fnNow }), objRecoveryService: objRecovery, strOrigin: ORIGIN }));
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
    close: async () => { await new Promise((fnResolve) => objListener.close(fnResolve)); objRecovery.destroy(); objMfa.destroy(); objDb.close(); } };
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

test('HTTPS admin invitation handoff lets an anonymous employee choose a password, enroll once and sign in', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj);
    const objIssued = await obj.post('/employees/invitations', { strUsername: 'joined.employee' });
    assert.equal(objIssued.intStatus, 201); assert.ok(objIssued.objBody.strInvitationToken);
    assert.equal(objIssued.objHeaders['cache-control'], 'no-store');
    obj.mapCookies.clear(); // Separate invite recipient, not the issuing admin's browser.
    const objBody = { strInvitationToken: objIssued.objBody.strInvitationToken, strPassword: PASSWORD };
    assert.equal((await obj.post('/employees/enroll', { ...objBody, strRole: 'admin' })).intStatus, 400);
    assert.equal((await obj.post('/employees/enroll', objBody)).intStatus, 201);
    assert.equal((await obj.send('/session')).intStatus, 401); // Enrollment does not issue a session.
    assert.equal((await obj.post('/employees/enroll', objBody)).intStatus, 403);
    assert.equal((await obj.post('/login', { strUsername: 'joined.employee', strPassword: PASSWORD })).intStatus, 200);
    assert.equal((await obj.send('/session')).objBody.strRole, 'employee');
    assert.equal((await obj.post('/employees/invitations', { strUsername: 'blocked.employee' })).intStatus, 403);
  } finally { await obj.close(); }
});

test('HTTPS invitation revocation, CSRF and expiration protect enrollment', async () => {
  const obj = await fixture();
  try {
    assert.equal((await obj.post('/employees/invitations', { strUsername: 'joined.employee' })).intStatus, 403);
    await signInAdmin(obj);
    assert.equal((await obj.send('/employees/invitations', { strMethod: 'POST', objBody: { strUsername: 'joined.employee' },
      objHeaders: { origin: ORIGIN } })).intStatus, 403);
    const objIssued = await obj.post('/employees/invitations', { strUsername: 'joined.employee' });
    assert.equal((await obj.post('/employees/invitations/revoke', { strInvitationId: objIssued.objBody.strInvitationId })).intStatus, 200);
    const objNext = await obj.post('/employees/invitations', { strUsername: 'joined.employee' });
    obj.mapCookies.clear();
    assert.equal((await obj.post('/employees/enroll', { strInvitationToken: objIssued.objBody.strInvitationToken, strPassword: PASSWORD })).intStatus, 403);
    obj.advance(86400000);
    assert.equal((await obj.post('/employees/enroll', { strInvitationToken: objNext.objBody.strInvitationToken, strPassword: PASSWORD })).intStatus, 403);
    assert.equal(obj.objDb.prepare('SELECT count(*) AS total FROM staff_users').get().total, 2);
  } finally { await obj.close(); }
});

test('HTTPS admin lists are paginated, deny employees and never expose hashes or invitation tokens', async () => {
  const obj = await fixture();
  try {
    assert.equal((await obj.send('/employees')).intStatus, 403);
    await signInAdmin(obj);
    const objInvitation = await obj.post('/employees/invitations', { strUsername: 'joined.employee' });
    const objEmployees = await obj.send('/employees?intOffset=0&intLimit=1');
    assert.equal(objEmployees.intStatus, 200); assert.equal(objEmployees.objBody.arrEmployees.length, 1);
    const objInvites = await obj.send('/employees/invitations?intLimit=1');
    assert.equal(objInvites.intStatus, 200); assert.equal(objInvites.objBody.arrInvitations.length, 1);
    for (const strSecret of [STR_HASH, objInvitation.objBody.strInvitationToken, 'token_digest', 'password_hash']) {
      assert.ok(!objEmployees.strText.includes(strSecret)); assert.ok(!objInvites.strText.includes(strSecret));
    }
    for (const strQuery of ['intLimit=101', 'intOffset=-1', 'intLimit=1&intLimit=2', 'strRole=admin', 'intLimit=1%0a']) {
      assert.equal((await obj.send(`/employees?${strQuery}`)).intStatus, 400);
    }
    await obj.post('/logout', {});
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    assert.equal((await obj.send('/employees')).intStatus, 403);
    assert.equal((await obj.send('/employees/invitations')).intStatus, 403);
  } finally { await obj.close(); }
});

test('HTTPS own-password change clears cookies, revokes copied session and requires the new password', async () => {
  const obj = await fixture();
  try {
    await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD });
    const strCopied = `${AUTH_COOKIES.strSession}=${obj.mapCookies.get(AUTH_COOKIES.strSession)}`;
    const objBody = { strCurrentPassword: PASSWORD, strNewPassword: 'Synthetic replacement olive orchard', strCode: '' };
    assert.equal((await obj.post('/account/password', { ...objBody, strUserId: 'admin' })).intStatus, 400);
    assert.equal((await obj.send('/account/password', { strMethod: 'POST', objBody, objHeaders: { origin: ORIGIN } })).intStatus, 403);
    assert.equal((await obj.post('/account/password', objBody)).intStatus, 200);
    assert.equal(obj.mapCookies.size, 0);
    assert.equal((await obj.send('/session', { objHeaders: { cookie: strCopied } })).intStatus, 401);
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: PASSWORD })).intStatus, 401);
    assert.equal((await obj.post('/login', { strUsername: 'employee', strPassword: objBody.strNewPassword })).intStatus, 200);
  } finally { await obj.close(); }
});

test('HTTPS admin password change rejects reused MFA and accepts a fresh code without partial failure', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj);
    const objBody = { strCurrentPassword: PASSWORD, strNewPassword: 'Synthetic replacement olive orchard', strCode: obj.code() };
    assert.equal((await obj.post('/account/password', objBody)).intStatus, 403);
    assert.equal(obj.objDb.prepare("SELECT revision FROM staff_credentials WHERE user_id='admin'").get().revision, 1);
    obj.advance(30000);
    assert.equal((await obj.post('/account/password', { ...objBody, strCode: obj.code() })).intStatus, 200);
    assert.equal(obj.mapCookies.size, 0);
  } finally { await obj.close(); }
});

test('HTTPS recovery replaces admin MFA without issuing a session and returns replacement recovery codes once', async () => {
  const obj = await fixture();
  try {
    await signInAdmin(obj); obj.advance(30000);
    const objCodes = await obj.post('/recovery/codes', { strPassword: PASSWORD, strCode: obj.code() });
    assert.equal(objCodes.intStatus,200); assert.equal(objCodes.objBody.arrRecoveryCodes.length,10);
    assert.equal(objCodes.objHeaders['cache-control'],'no-store');
    const strOldSessionCookie = `${AUTH_COOKIES.strSession}=${obj.mapCookies.get(AUTH_COOKIES.strSession)}`;
    const objStart = await obj.post('/recovery/start', { strUsername:'admin',strPassword:PASSWORD,strRecoveryCode:objCodes.objBody.arrRecoveryCodes[0] });
    assert.equal(objStart.intStatus,200); assert.equal(objStart.objBody.strState,'reenrollment_required');
    assert.equal(Object.hasOwn(objStart.objBody,'strRecoveryToken'),false);
    const strRecoveryCookie=objStart.objHeaders['set-cookie'].find((strValue)=>strValue.startsWith(`${AUTH_COOKIES.strRecovery}=`));
    for(const strFlag of ['Secure','HttpOnly','SameSite=Strict','Path=/']) assert.ok(strRecoveryCookie.includes(strFlag));
    assert.equal((await obj.send('/session',{objHeaders:{cookie:strOldSessionCookie}})).intStatus,401);
    const objTotp=OTPAuth.URI.parse(objStart.objBody.strProvisioningUri);
    const strCode=objTotp.generate({timestamp:Date.parse('2026-10-21T12:01:00.000Z')});
    assert.equal((await obj.send('/recovery/confirm',{strMethod:'POST',objBody:{strCode},objHeaders:{origin:ORIGIN}})).intStatus,403);
    const objResult=await obj.post('/recovery/confirm',{strCode});
    assert.equal(objResult.intStatus,200);assert.equal(objResult.objBody.arrRecoveryCodes.length,10);
    assert.equal(obj.mapCookies.size,0);assert.equal((await obj.send('/session')).intStatus,401);
    assert.equal((await obj.post('/recovery/confirm',{strCode})).intStatus,403);
    obj.advance(30000);
    assert.equal((await obj.post('/login',{strUsername:'admin',strPassword:PASSWORD})).intStatus,200);
    assert.equal((await obj.post('/mfa',{strCode:objTotp.generate({timestamp:Date.parse('2026-10-21T12:01:30.000Z')})})).intStatus,200);
  } finally {await obj.close();}
});

test('HTTPS recovery rejects ordinary staff, missing authority, extra proof claims and public local recovery', async()=>{
  const obj=await fixture();
  try{
    assert.equal((await obj.post('/recovery/codes',{strPassword:PASSWORD,strCode:''})).intStatus,403);
    await obj.post('/login',{strUsername:'employee',strPassword:PASSWORD});
    assert.equal((await obj.post('/recovery/codes',{strPassword:PASSWORD,strCode:''})).intStatus,403);
    assert.equal((await obj.post('/recovery/start',{strUsername:'employee',strPassword:PASSWORD,strRecoveryCode:'a'.repeat(32)})).intStatus,403);
    assert.equal((await obj.post('/recovery/start',{strUsername:'admin',strPassword:PASSWORD,strRecoveryCode:'a'.repeat(32),bVerifiedByBrody:true})).intStatus,400);
    assert.equal((await obj.post('/recovery/local',{})).intStatus,404);
  }finally{await obj.close();}
});
