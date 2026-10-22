import express from 'express';
import { randomBytes } from 'node:crypto';
import { AUTH_COOKIES, COOKIE_OPTIONS, createCsrfProtection, readAuthCookies } from './auth-transport.js';

/** Isolated JSON router. Not mounted by app.js; requires direct TLS and a pinned origin. */
export function createAuthRouter({ objLoginService, objSessionService, objStaffAccountService, strOrigin }) {
  const objOrigin = new URL(strOrigin);
  if (objOrigin.protocol !== 'https:' || objOrigin.origin !== strOrigin || objOrigin.username || objOrigin.password) {
    throw new TypeError('An exact HTTPS origin is required.');
  }
  for (const strMethod of ['beginSignIn', 'completeMfa', 'revokeChallenge']) {
    if (typeof objLoginService?.[strMethod] !== 'function') throw new TypeError('Login service required.');
  }
  for (const strMethod of ['validateSession', 'revokeSession']) {
    if (typeof objSessionService?.[strMethod] !== 'function') throw new TypeError('Session service required.');
  }
  if (typeof objStaffAccountService?.deactivateEmployee !== 'function') throw new TypeError('Staff account service required.');
  const objRouter = express.Router();
  const objCsrf = createCsrfProtection();
  function reject(objResponse, intStatus) {
    return objResponse.status(intStatus).json({ strMessage: 'Unable to complete authentication.' });
  }
  function clearCookie(objResponse, strName) { objResponse.clearCookie(strName, COOKIE_OPTIONS); }
  function freshCsrf(objResponse) {
    objResponse.cookie(AUTH_COOKIES.strCsrf, randomBytes(32).toString('hex'), { ...COOKIE_OPTIONS, maxAge: 600000 });
  }
  objRouter.use((objRequest, objResponse, fnNext) => {
    objResponse.set({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie, Origin' });
    // Do not trust Express trust-proxy settings or X-Forwarded-* for this boundary.
    if (!objRequest.socket.encrypted || objRequest.headers.host !== objOrigin.host) return reject(objResponse, 403);
    if (objRequest.headers.origin !== undefined && objRequest.headers.origin !== strOrigin) return reject(objResponse, 403);
    if (objRequest.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(objRequest.headers['sec-fetch-site'])) return reject(objResponse, 403);
    try { objResponse.locals.objAuthCookies = readAuthCookies(objRequest.headers.cookie); }
    catch { return reject(objResponse, 400); }
    if (objRequest.method === 'POST') {
      if (objRequest.headers.origin !== strOrigin
        || !objCsrf.verify(objResponse.locals.objAuthCookies, objRequest.headers['x-csrf-token'])) return reject(objResponse, 403);
      if (!objRequest.is('application/json')) return reject(objResponse, 415);
    }
    fnNext();
  });
  objRouter.use(express.json({ limit: '4kb', strict: true, inflate: false }));
  function validBody(objBody, arrKeys) {
    return objBody && !Array.isArray(objBody) && Object.keys(objBody).length === arrKeys.length
      && arrKeys.every((strKey) => typeof objBody[strKey] === 'string');
  }
  function finishSession(objRequest, objResponse, objResult) {
    const objCookies = objResponse.locals.objAuthCookies;
    // Tokens are internal service results only. Never accept a request's role/token as proof.
    const strOldToken = objCookies[AUTH_COOKIES.strSession];
    try {
      if (strOldToken) objSessionService.revokeSession(strOldToken);
      objLoginService.revokeChallenge(objCookies[AUTH_COOKIES.strChallenge]);
    } catch (objError) {
      objSessionService.revokeSession(objResult.strSessionToken);
      throw objError;
    }
    objResponse.cookie(AUTH_COOKIES.strSession, objResult.strSessionToken, { ...COOKIE_OPTIONS, maxAge: 8 * 3600000 });
    clearCookie(objResponse, AUTH_COOKIES.strChallenge);
    freshCsrf(objResponse);
    return objResponse.json({ strState: 'authenticated' });
  }
  objRouter.get('/csrf', (objRequest, objResponse) => {
    const objCookies = objResponse.locals.objAuthCookies;
    if (!objCookies[AUTH_COOKIES.strCsrf]) {
      objCookies[AUTH_COOKIES.strCsrf] = randomBytes(32).toString('hex');
      objResponse.cookie(AUTH_COOKIES.strCsrf, objCookies[AUTH_COOKIES.strCsrf], { ...COOKIE_OPTIONS, maxAge: 600000 });
    }
    objResponse.json({ strCsrfToken: objCsrf.token(objCookies) });
  });
  objRouter.post('/login', async (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strUsername', 'strPassword'])) return reject(objResponse, 400);
    const objResult = await objLoginService.beginSignIn(objRequest.body.strUsername, objRequest.body.strPassword, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 401);
    if (objResult.strSessionToken) return finishSession(objRequest, objResponse, objResult);
    objLoginService.revokeChallenge(objResponse.locals.objAuthCookies[AUTH_COOKIES.strChallenge]);
    objResponse.cookie(AUTH_COOKIES.strChallenge, objResult.strMfaChallenge, { ...COOKIE_OPTIONS, maxAge: 300000 });
    freshCsrf(objResponse);
    objResponse.json({ strState: 'mfa_required' });
  });
  objRouter.post('/mfa', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strCode'])) return reject(objResponse, 400);
    const objResult = objLoginService.completeMfa(objResponse.locals.objAuthCookies[AUTH_COOKIES.strChallenge],
      objRequest.body.strCode, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 401);
    return finishSession(objRequest, objResponse, objResult);
  });
  objRouter.get('/session', (objRequest, objResponse) => {
    const objIdentity = objSessionService.validateSession(objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession]);
    if (!objIdentity) return reject(objResponse, 401);
    objResponse.json({ strUserId: objIdentity.strUserId, strRole: objIdentity.strRole });
  });
  objRouter.post('/employees/deactivate', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strEmployeeId']) || !objRequest.body.strEmployeeId.length
      || objRequest.body.strEmployeeId.length > 128) return reject(objResponse, 400);
    const objResult = objStaffAccountService.deactivateEmployee(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objRequest.body.strEmployeeId);
    // Use one denial for missing permission/session and protected/unknown targets.
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json(objResult);
  });
  objRouter.post('/logout', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, [])) return reject(objResponse, 400);
    objSessionService.revokeSession(objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession]);
    objLoginService.revokeChallenge(objResponse.locals.objAuthCookies[AUTH_COOKIES.strChallenge]);
    for (const strName of Object.values(AUTH_COOKIES)) clearCookie(objResponse, strName);
    objResponse.status(204).end();
  });
  objRouter.use((objRequest, objResponse) => reject(objResponse, 404));
  objRouter.use((objError, objRequest, objResponse, fnNext) => {
    if (objResponse.headersSent) return fnNext(objError);
    const intStatus = objError.type === 'entity.too.large' ? 413
      : objError.type === 'encoding.unsupported' ? 415 : objError.type === 'entity.parse.failed' ? 400 : 503;
    return reject(objResponse, intStatus);
  });
  return objRouter;
}
