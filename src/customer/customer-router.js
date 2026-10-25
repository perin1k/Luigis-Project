/**
 * HTTPS customer pages and native form submissions. This router never grants staff permissions.
 * Transport guards, CSRF, bounded attempts and hashing limits run before account mutations.
 */
import express from 'express';
import {clientAddress} from '../security/proxy-boundary.js';
import { randomBytes, createHmac } from 'node:crypto';
import { createCsrfProtection, COOKIE_OPTIONS } from '../auth/auth-transport.js';
import { CustomerError } from './customer-service.js';
import { CUSTOMER_COOKIES, readCustomerCookies, customerCsrfCookies } from './customer-transport.js';

export function createCustomerRouter({ objCustomerService, strOrigin, fnRender }) {
  const objOrigin = new URL(strOrigin);
  if (objOrigin.protocol !== 'https:' || objOrigin.origin !== strOrigin) throw new Error('Customer HTTPS origin required.');
  const objRouter = express.Router();
  const objCsrf = createCsrfProtection();
  const objLimitKey = randomBytes(32);
  const mapLimits = new Map();
  let intHashWork = 0;
  objRouter.use('/account',(objRequest, objResponse, fnNext) => {
    objResponse.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'same-origin'
    });
    if (!objRequest.socket.encrypted || objRequest.headers.host !== objOrigin.host || objRequest.headers.origin !== undefined && objRequest.headers.origin !== strOrigin
    || objRequest.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(objRequest.headers['sec-fetch-site'])) return objResponse.status(403).type('text').send('Open your account using this website’s secure address.');
    try {
      objResponse.locals.objCustomerCookies = readCustomerCookies(objRequest.headers.cookie);
    } catch {
      return objResponse.status(400).type('text').send('Account cookies could not be read. Clear this site’s cookies and sign in again.');
    }
    fnNext();
  });
  // The proof binds a browser nonce to this customer session; staff CSRF cookies are not reused.
  function csrf(objResponse) {
    const objCookies = objResponse.locals.objCustomerCookies;
    if (!objCookies[CUSTOMER_COOKIES.strCsrf]) {
      objCookies[CUSTOMER_COOKIES.strCsrf] = randomBytes(32).toString('hex');
      objResponse.cookie(CUSTOMER_COOKIES.strCsrf, objCookies[CUSTOMER_COOKIES.strCsrf], COOKIE_OPTIONS);
    }
    return objCsrf.token(customerCsrfCookies(objCookies));
  }
  // Read current authorized data for every account page; render failures without reflecting secrets.
  function render(objRequest, objResponse, fnNext, strMode, objExtra = {}) {
    let objAccount = null;
    let arrOrders = [];
    if (strMode === 'account') {
      try {
        objAccount = objCustomerService.readProfile(objResponse.locals.objCustomerCookies[CUSTOMER_COOKIES.strSession]);
        arrOrders = objCustomerService.orders(objResponse.locals.objCustomerCookies[CUSTOMER_COOKIES.strSession]);
      }
      catch (objError) {
        if (objError instanceof CustomerError && objError.intStatus === 401) {
          objResponse.clearCookie(CUSTOMER_COOKIES.strSession, COOKIE_OPTIONS);
          return objResponse.redirect(303, '/account/sign-in');
        }
        throw objError;
      }
      if (objExtra.strError && objResponse.statusCode === 400 && objRequest.params.action === 'profile') {
        objAccount.objProfile = Object.fromEntries(['strName', 'strPhone', 'strEmail'].map(strKey => [strKey, typeof objRequest.body[strKey] === 'string' ? objRequest.body[strKey]: '']));
      }
    }
    return fnRender(objRequest, objResponse, fnNext, 'pages/customer', {
      strTitle: 'Your customer account | Luigi’s Pizza',
      strDescription: 'Manage your customer account and follow your orders.',
      strMode,
      strCsrfToken: csrf(objResponse),
      objAccount,
      arrOrders,
      arrRecoveryCodes: [],
      strError: '',
      strNotice: '',
      ...objExtra
    });
  }
  for (const [strPath, strMode] of[['/account', 'account'], ['/account/register', 'register'], ['/account/sign-in', 'sign-in'], ['/account/recover', 'recover']]) objRouter.get(strPath,(objRequest, objResponse, fnNext) => {
    const objNotices = {
      saved: 'Your contact details were saved.',
      deleted: 'Your account was deleted. Existing orders were not cancelled.'
    };
    const strNotice = typeof objRequest.query.notice === 'string' && Object.hasOwn(objNotices, objRequest.query.notice) ? objNotices[objRequest.query.notice]: '';
    try {
      return render(objRequest, objResponse, fnNext, strMode, { strNotice });
    } catch {
      fnNext(new Error('Customer page unavailable.'));
    }
  });
  objRouter.post('/account/:action', express.urlencoded({ extended: false, limit: '6kb', parameterLimit: 10, inflate: false }), async(objRequest, objResponse, fnNext) => {
    const strAction = objRequest.params.action;
    const objBody = objRequest.body;
    const strMode =({ register: 'register', 'sign-in': 'sign-in', recover: 'recover' }) [strAction] ?? 'account';
    let bHashing = false;
    try {
      if (!['register', 'sign-in', 'recover', 'profile', 'delete', 'sign-out'].includes(strAction)) throw new CustomerError('Choose an action shown on your account page.', 404);
      if (objRequest.headers.origin !== strOrigin || !objRequest.is('application/x-www-form-urlencoded') || !objBody || !objCsrf.verify(customerCsrfCookies(objResponse.locals.objCustomerCookies), objBody.strCsrfToken)) throw new CustomerError('Refresh this page before trying again.', 403);
      // Bound password hashing and peer/account attempts without retaining raw addresses.
      const numNow = Date.now();
      for (const [strKey, objEntry] of mapLimits) if (objEntry.numExpires <= numNow) mapLimits.delete(strKey);
      for (const strValue of[`peer:${clientAddress(objRequest) }`, ...(typeof objBody.strUsername === 'string' ? [`name:${objBody.strUsername.toLowerCase() }`]: [])]) {
        const strKey = createHmac('sha256', objLimitKey).update(strValue).digest('hex');
        let objEntry = mapLimits.get(strKey);
        if (!objEntry) {
          if (mapLimits.size >= 5000) throw new CustomerError('Please wait a minute before trying again.', 429);
          objEntry = { intCount: 0, numExpires: numNow + 60000 };
          mapLimits.set(strKey, objEntry);
        }
        if (++objEntry.intCount > 20) throw new CustomerError('Please wait a minute before trying again.', 429);
      }
      // Expensive password operations have a small concurrency budget instead of an unbounded queue.
      if (['register', 'sign-in', 'recover', 'delete'].includes(strAction)) {
        if (intHashWork >= 2) throw new CustomerError('Account sign-in is busy. Wait a moment, then try again.', 429);
        intHashWork++;
        bHashing = true;
      }
      const strToken = objResponse.locals.objCustomerCookies[CUSTOMER_COOKIES.strSession];
      let objResult;
      if (strAction === 'register' || strAction === 'sign-in') {
        objResult = await objCustomerService[strAction === 'register' ? 'register': 'login'](objBody.strUsername, objBody.strPassword);
        objCustomerService.logout(strToken);
        objResponse.cookie(CUSTOMER_COOKIES.strSession, objResult.strToken, { ...COOKIE_OPTIONS, maxAge: 8 * 3600000 });
        objResponse.locals.objCustomerCookies[CUSTOMER_COOKIES.strSession] = objResult.strToken;
        if (strAction === 'register') return render(objRequest, objResponse, fnNext, 'account', {
          arrRecoveryCodes: objResult.arrRecoveryCodes,
          strNotice: 'Your account is ready. Save your recovery codes privately.'
        });
        return objResponse.redirect(303, '/account');
      }
      // Recovery replaces all backup codes and clears the browser session; the user signs in again.
      if (strAction === 'recover') {
        objResult = await objCustomerService.recover(objBody.strUsername, objBody.strRecoveryCode, objBody.strNewPassword);
        objCustomerService.logout(strToken);
        objResponse.clearCookie(CUSTOMER_COOKIES.strSession, COOKIE_OPTIONS);
        delete objResponse.locals.objCustomerCookies[CUSTOMER_COOKIES.strSession];
        return render(objRequest, objResponse, fnNext, 'sign-in', {
          arrRecoveryCodes: objResult.arrRecoveryCodes,
          strNotice: 'Password changed. Save these replacement recovery codes, then sign in. Old codes no longer work.'
        });
      }
      if (strAction === 'profile') objCustomerService.updateProfile(strToken, { strName: objBody.strName, strPhone: objBody.strPhone, strEmail: objBody.strEmail }, Number(objBody.strRevision));
      else if (strAction === 'delete') {
        await objCustomerService.deleteAccount(strToken, objBody.strPassword);
        objResponse.clearCookie(CUSTOMER_COOKIES.strSession, COOKIE_OPTIONS);
        return objResponse.redirect(303, '/account/sign-in?notice=deleted');
      }
      else if (strAction === 'sign-out') {
        objCustomerService.logout(strToken);
        objResponse.clearCookie(CUSTOMER_COOKIES.strSession, COOKIE_OPTIONS);
        return objResponse.redirect(303, '/account/sign-in');
      }
      else throw new CustomerError('Choose an action shown on your account page.', 404);
      return objResponse.redirect(303, '/account?notice=saved');
    } catch (objError) {
      if (objError instanceof CustomerError) {
        objResponse.status(objError.intStatus);
        if (objError.intStatus === 429) objResponse.set('Retry-After', '60');
        try {
          return render(objRequest, objResponse, fnNext, strMode, { strError: objError.message });
        } catch { /* Fixed generic response below. */ }
      }
      return objResponse.status(503).type('text').send('Your account request could not finish. Return to the account page and check before trying again.');
    } finally {
      if (bHashing) intHashWork--;
    }
  });
  objRouter.use('/account',(objError, objRequest, objResponse, fnNext) => {
    if (objResponse.headersSent) return fnNext(objError);
    objResponse.status(objError.status === 413 ? 413: 400).type('text').send('Account request could not be read. Return to the account page and try again.');
  });
  return objRouter;
}
