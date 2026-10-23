import express from 'express';
import { randomBytes } from 'node:crypto';
import { AUTH_COOKIES, COOKIE_OPTIONS, createCsrfProtection, readAuthCookies } from './auth-transport.js';
import { validPage } from './staff-account-service.js';

/** JSON authentication boundary; runtime mounting requires direct TLS and a pinned origin. */
export function createAuthRouter({ objLoginService, objSessionService, objStaffAccountService, objStaffEnrollmentService, objRecoveryService, strOrigin }) {
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
  for (const strMethod of ['updateStaff', 'listEmployees', 'changeOwnPassword']) {
    if (typeof objStaffAccountService?.[strMethod] !== 'function') throw new TypeError('Staff account service required.');
  }
  for (const strMethod of ['issueInvitation', 'revokeInvitation', 'acceptInvitation', 'listInvitations']) {
    if (typeof objStaffEnrollmentService?.[strMethod] !== 'function') throw new TypeError('Staff enrollment service required.');
  }
  for (const strMethod of ['regenerateCodes', 'beginRecovery', 'beginPromotionEnrollment', 'confirmRecovery']) {
    if (typeof objRecoveryService?.[strMethod] !== 'function') throw new TypeError('Recovery service required.');
  }
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
  function page(objQuery) {
    if (Object.keys(objQuery).some((strKey) => !['intOffset', 'intLimit'].includes(strKey))) return null;
    const strOffset = objQuery.intOffset ?? '0'; const strLimit = objQuery.intLimit ?? '50';
    if (typeof strOffset !== 'string' || typeof strLimit !== 'string'
      || !/^(0|[1-9][0-9]{0,6})$/.test(strOffset) || !/^[1-9][0-9]{0,2}$/.test(strLimit)) return null;
    const intOffset = Number(strOffset); const intLimit = Number(strLimit);
    return validPage(intOffset, intLimit) && String(intOffset) === strOffset && String(intLimit) === strLimit
      ? { intOffset, intLimit } : null;
  }
  objRouter.get('/employees', (objRequest, objResponse) => {
    const objPage = page(objRequest.query);
    if (!objPage) return reject(objResponse, 400);
    const objResult = objStaffAccountService.listEmployees(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objPage.intOffset, objPage.intLimit);
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json(objResult);
  });
  objRouter.get('/employees/invitations', (objRequest, objResponse) => {
    const objPage = page(objRequest.query);
    if (!objPage) return reject(objResponse, 400);
    const objResult = objStaffEnrollmentService.listInvitations(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objPage.intOffset, objPage.intLimit);
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json(objResult);
  });
  objRouter.post('/recovery/codes', async (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strPassword', 'strCode'])) return reject(objResponse, 400);
    const objResult = await objRecoveryService.regenerateCodes(objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession],
      objRequest.body.strPassword, objRequest.body.strCode, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json(objResult);
  });
  objRouter.post('/recovery/start', async (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strUsername', 'strPassword', 'strRecoveryCode'])) return reject(objResponse, 400);
    const objResult = await objRecoveryService.beginRecovery(objRequest.body.strUsername, objRequest.body.strPassword,
      objRequest.body.strRecoveryCode, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 403);
    clearCookie(objResponse, AUTH_COOKIES.strSession); clearCookie(objResponse, AUTH_COOKIES.strChallenge);
    objResponse.cookie(AUTH_COOKIES.strRecovery, objResult.strRecoveryToken, { ...COOKIE_OPTIONS, maxAge: 600000 });
    freshCsrf(objResponse);
    return objResponse.json({ strState: 'reenrollment_required', strProvisioningUri: objResult.strProvisioningUri });
  });
  objRouter.post('/promotion/start', async (objRequest,objResponse)=>{
    if(!validBody(objRequest.body,['strUsername','strPassword']))return reject(objResponse,400);
    const objResult=await objRecoveryService.beginPromotionEnrollment(objRequest.body.strUsername,objRequest.body.strPassword,objRequest.socket.remoteAddress);
    if(!objResult)return reject(objResponse,403);
    clearCookie(objResponse,AUTH_COOKIES.strSession);clearCookie(objResponse,AUTH_COOKIES.strChallenge);
    objResponse.cookie(AUTH_COOKIES.strRecovery,objResult.strRecoveryToken,{...COOKIE_OPTIONS,maxAge:600000});freshCsrf(objResponse);
    return objResponse.json({strState:'enrollment_required',strProvisioningUri:objResult.strProvisioningUri});
  });
  objRouter.post('/recovery/confirm', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strCode'])) return reject(objResponse, 400);
    const objResult = objRecoveryService.confirmRecovery(objResponse.locals.objAuthCookies[AUTH_COOKIES.strRecovery], objRequest.body.strCode);
    if (!objResult) return reject(objResponse, 403);
    for (const strName of Object.values(AUTH_COOKIES)) clearCookie(objResponse, strName);
    return objResponse.json(objResult);
  });
  objRouter.post('/account/password', async (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strCurrentPassword', 'strNewPassword', 'strCode'])) return reject(objResponse, 400);
    const objResult = await objStaffAccountService.changeOwnPassword(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objRequest.body.strCurrentPassword,
      objRequest.body.strNewPassword, objRequest.body.strCode, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 403);
    for (const strName of Object.values(AUTH_COOKIES)) clearCookie(objResponse, strName);
    return objResponse.json(objResult);
  });
  objRouter.post('/employees/invitations', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strUsername']) && !validBody(objRequest.body,['strUsername','strRole'])) return reject(objResponse, 400);
    const objResult = objStaffEnrollmentService.issueInvitation(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objRequest.body.strUsername,objRequest.body.strRole??'employee');
    if (!objResult) return reject(objResponse, 403);
    return objResponse.status(201).json(objResult);
  });
  objRouter.post('/employees/invitations/revoke', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strInvitationId'])) return reject(objResponse, 400);
    const objResult = objStaffEnrollmentService.revokeInvitation(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objRequest.body.strInvitationId);
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json(objResult);
  });
  objRouter.post('/employees/enroll', async (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strInvitationToken', 'strPassword'])) return reject(objResponse, 400);
    const objResult = await objStaffEnrollmentService.acceptInvitation(
      objRequest.body.strInvitationToken, objRequest.body.strPassword, objRequest.socket.remoteAddress);
    if (!objResult) return reject(objResponse, 403);
    return objResponse.status(201).json(objResult);
  });
  objRouter.post('/employees/deactivate', (objRequest, objResponse) => {
    if (!validBody(objRequest.body, ['strEmployeeId','strRevision']) || !objRequest.body.strEmployeeId.length
      || objRequest.body.strEmployeeId.length > 128 || !/^[1-9][0-9]{0,15}$/.test(objRequest.body.strRevision)) return reject(objResponse, 400);
    const objResult = objStaffAccountService.updateStaff(
      objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession], objRequest.body.strEmployeeId,Number(objRequest.body.strRevision),'state','disabled');
    // Use one denial for missing permission/session and protected/unknown targets.
    if (!objResult) return reject(objResponse, 403);
    return objResponse.json({strState:objResult.strState==='unchanged'?'already_disabled':'disabled'});
  });
  objRouter.post('/staff/update',(objRequest,objResponse)=>{
    if(!validBody(objRequest.body,['strUserId','strRevision','strField','strValue'])||!/^[1-9][0-9]{0,15}$/.test(objRequest.body.strRevision))return reject(objResponse,400);
    const objResult=objStaffAccountService.updateStaff(objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession],objRequest.body.strUserId,Number(objRequest.body.strRevision),objRequest.body.strField,objRequest.body.strValue);
    return objResult?objResponse.json(objResult):reject(objResponse,403);
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
