/**
 * Connects staff order, progress, review, refund, notification and analytics APIs to
 * their authorized services. Browser-supplied roles do not grant access.
 */
import express from 'express';
import { randomBytes } from 'node:crypto';
import { AUTH_COOKIES, COOKIE_OPTIONS, createCsrfProtection, readAuthCookies } from '../auth/auth-transport.js';
import { StaffOrderError } from './orders-service.js';

export function createStaffOrdersRouter({ objStaffOrdersService, objOrderProgressService, objTrackingService, objOrderExceptionService, objDemoRefundService, objNotificationService, objAnalyticsService, strOrigin, fnRender, bPrivacy = false }) {
  const objOrigin = new URL(strOrigin);
  if (objOrigin.protocol !== 'https:' || objOrigin.origin !== strOrigin) throw new Error('Exact staff HTTPS origin required.');
  const objRouter = express.Router();
  const objCsrf = createCsrfProtection();
  objRouter.use(['/staff/orders', '/api/staff/orders', '/api/staff/analytics', '/staff/analytics'],(objRequest, objResponse, fnNext) => {
    objResponse.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie, Origin'
    });
    if (!objRequest.socket.encrypted || objRequest.headers.host !== objOrigin.host ||(objRequest.headers.origin !== undefined && objRequest.headers.origin !== strOrigin)
    ||(objRequest.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(objRequest.headers['sec-fetch-site']))) return objResponse.status(403).type('text').send('A secure staff connection is required.');
    try {
      objResponse.locals.objAuthCookies = readAuthCookies(objRequest.headers.cookie);
      objResponse.locals.strSessionToken = objResponse.locals.objAuthCookies[AUTH_COOKIES.strSession];
    } catch {
      return objResponse.status(400).type('text').send('Unable to read this session.');
    }
    fnNext();
  });
  function serve(objRequest, objResponse, fnNext, bJson, bDetail) {
    try {
      const objResult = bDetail ? objStaffOrdersService.readOrder(objResponse.locals.strSessionToken, objRequest.params.reference): objStaffOrdersService.listOrders(objResponse.locals.strSessionToken, objRequest.query);
      if (!objResult) return bJson ? objResponse.status(401).json({ strMessage: 'Your staff session expired. Sign in again.' }): objResponse.redirect(303, '/staff/sign-in');
      if (bJson) return objResponse.json(objResult);
      fnRender(objRequest, objResponse, fnNext, 'pages/staff-orders', {
        strTitle: bDetail ? 'Order details | Luigi’s Pizza': 'Order queue | Luigi’s Pizza',
        strDescription: 'Authorized staff order preparation queue.',
        objQueue: bDetail ? null: objResult,
        objOrder: bDetail ? objResult: null,
        bOrderProgress: Boolean(objOrderProgressService),
        bPrivacy
      });
    } catch (objError) {
      const intStatus = objError instanceof StaffOrderError ? objError.intStatus: 503;
      const strMessage = objError instanceof StaffOrderError ? objError.message: 'Orders could not be loaded. Please try again.';
      if (bJson) return objResponse.status(intStatus).json({ strMessage });
      objResponse.status(intStatus);
      fnRender(objRequest, objResponse, fnNext, 'pages/error', {
        strTitle: 'Order queue | Luigi’s Pizza',
        strDescription: 'Staff order access.',
        intStatus,
        strHeading: 'Orders could not be loaded.',
        strMessage
      });
    }
  }
  if (objOrderProgressService) {
    objRouter.get('/api/staff/orders/csrf',(objRequest, objResponse) => {
      if (!objStaffOrdersService.listOrders(objResponse.locals.strSessionToken)) return objResponse.status(401).json({ strMessage: 'Sign in again.' });
      const objCookies = objResponse.locals.objAuthCookies;
      if (!objCookies[AUTH_COOKIES.strCsrf]) {
        objCookies[AUTH_COOKIES.strCsrf] = randomBytes(32).toString('hex');
        objResponse.cookie(AUTH_COOKIES.strCsrf, objCookies[AUTH_COOKIES.strCsrf], { ...COOKIE_OPTIONS, maxAge: 600000 });
      }
      return objResponse.json({ strCsrfToken: objCsrf.token(objCookies) });
    });
    objRouter.post('/api/staff/orders/:reference/progress',(objRequest, objResponse, fnNext) => {
      if (objRequest.headers.origin !== strOrigin || !objCsrf.verify(objResponse.locals.objAuthCookies, objRequest.headers['x-csrf-token'])) return objResponse.status(403).json({ strMessage: 'Refresh this page before updating.' });
      if (!objRequest.is('application/json')) return objResponse.status(415).json({ strMessage: 'JSON is required.' });
      fnNext();
    }, express.json({ limit: '1kb', strict: true, inflate: false }),(objRequest, objResponse) => {
      try {
        const objResult = objOrderProgressService.advanceOrder(objResponse.locals.strSessionToken, objRequest.params.reference, objRequest.body);
        return objResult ? objResponse.json(objResult): objResponse.status(401).json({ strMessage: 'Your staff session expired. Sign in again.' });
      } catch (objError) {
        return objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'Order could not be updated. Refresh before trying again.' });
      }
    });
    for (const strAction of['exception', 'tracking-replacement', 'refund']) objRouter.post(`/api/staff/orders/:reference/${strAction }`,(objRequest, objResponse, fnNext) => {
      if (objRequest.headers.origin !== strOrigin || !objCsrf.verify(objResponse.locals.objAuthCookies, objRequest.headers['x-csrf-token'])) return objResponse.status(403).json({ strMessage: 'Refresh before deciding.' });
      if (!objRequest.is('application/json')) return objResponse.status(415).json({ strMessage: 'JSON is required.' });
      fnNext();
    }, express.json({ limit: '1kb', strict: true, inflate: false }),(objRequest, objResponse) => {
      try {
        if (strAction === 'tracking-replacement' &&(!objRequest.body || Object.keys(objRequest.body).length !== 1 || objRequest.body.bReviewed !== true)) throw new StaffOrderError('Review the order first.', 400);
        const objResult = strAction === 'refund' ? objDemoRefundService?.refund(objResponse.locals.strSessionToken, objRequest.params.reference, objRequest.body): strAction === 'exception' ? objOrderExceptionService?.decide(objResponse.locals.strSessionToken, objRequest.params.reference, objRequest.body): objTrackingService?.replaceGrant(objResponse.locals.strSessionToken, objRequest.params.reference);
        return objResult ? objResponse.json(objResult): objResponse.status(403).json({ strMessage: 'Administrative access is required.' });
      } catch (objError) {
        return objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'The decision could not be confirmed. Refresh before retrying.' });
      }
    });
    objRouter.use(['/api/staff/orders/:reference/progress', '/api/staff/orders/:reference/exception', '/api/staff/orders/:reference/tracking-replacement', '/api/staff/orders/:reference/refund'],(objError, objRequest, objResponse, fnNext) => {
      if (!objError) return fnNext();
      return objResponse.status(objError.status === 413 ? 413: 400).json({ strMessage: 'Check the order update request.' });
    });
  }
  if (objNotificationService) {
    objRouter.get('/api/staff/orders/:reference/notifications',(objRequest, objResponse) => {
      try {
        const objResult = objNotificationService.read(objResponse.locals.strSessionToken, objRequest.params.reference);
        return objResult ? objResponse.json(objResult): objResponse.status(401).json({ strMessage: 'Your staff session expired. Sign in again.' });
      }
      catch (objError) {
        return objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'Previews could not be loaded.' });
      }
    });
    objRouter.post('/api/staff/orders/:reference/notifications/retry',(objRequest, objResponse, fnNext) => {
      if (objRequest.headers.origin !== strOrigin || !objCsrf.verify(objResponse.locals.objAuthCookies, objRequest.headers['x-csrf-token'])) return objResponse.status(403).json({ strMessage: 'Refresh before retrying.' });
      if (!objRequest.is('application/json')) return objResponse.status(415).json({ strMessage: 'JSON is required.' });
      fnNext();
    }, express.json({ limit: '1kb', strict: true, inflate: false }),(objRequest, objResponse) => {
      try {
        const objResult = objNotificationService.retry(objResponse.locals.strSessionToken, objRequest.params.reference, objRequest.body);
        return objResult ? objResponse.json(objResult): objResponse.status(403).json({ strMessage: 'Administrative access is required.' });
      }
      catch (objError) {
        return objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'Retry could not be confirmed. Refresh before retrying.' });
      }
    });
    objRouter.use('/api/staff/orders/:reference/notifications/retry',(objError, objRequest, objResponse, fnNext) => {
      if (!objError) return fnNext();
      return objResponse.status(objError.status === 413 ? 413: 400).json({ strMessage: 'Check the preview request.' });
    });
  }
  if (objAnalyticsService) objRouter.get('/staff/analytics',(objRequest, objResponse, fnNext) => {
    let objRanges;
    let objFilter = objRequest.query;
    function denySalesReport() {
      objResponse.status(403);
      return fnRender(objRequest, objResponse, fnNext, 'pages/error', {
        strTitle: 'Manager or Owner access required | Luigi’s Pizza',
        strDescription: 'Private staff sales access.',
        intStatus: 403,
        strHeading: 'Manager or Owner access required.',
        strMessage: 'Sign in with your individual Admin or Owner account to view sales.'
      });
    }
    try {
      objRanges = objAnalyticsService.readDateRanges(objResponse.locals.strSessionToken);
      if (!objRanges) return denySalesReport();
      objFilter = Object.keys(objRequest.query).length ? objRequest.query: { from: objRanges.strToday, to: objRanges.strToday };
      const objReport = objAnalyticsService.read(objResponse.locals.strSessionToken, objFilter);
      if (!objReport) return denySalesReport();
      fnRender(objRequest, objResponse, fnNext, 'pages/staff-analytics', {
        strTitle: 'Sales & analytics | Luigi’s Pizza',
        strDescription: 'Private manager and owner sales reporting.',
        objReport,
        objFilter,
        objRanges,
        strError: ''
      });
    } catch (objError) {
      const intStatus = objError instanceof StaffOrderError ? objError.intStatus: 503;
      objResponse.status(intStatus);
      fnRender(objRequest, objResponse, fnNext, 'pages/staff-analytics', {
        strTitle: 'Sales & analytics | Luigi’s Pizza',
        strDescription: 'Private manager and owner sales reporting.',
        objReport: null,
        objFilter,
        objRanges,
        strError: objError instanceof StaffOrderError ? objError.message: 'Sales could not be loaded. Try again.'
      });
    }
  });
  if (objAnalyticsService) objRouter.get('/api/staff/analytics',(objRequest, objResponse) => {
    try {
      const objResult = objAnalyticsService.read(objResponse.locals.strSessionToken, objRequest.query);
      return objResult ? objResponse.json(objResult): objResponse.status(403).json({ strMessage: 'Administrative access is required.' });
    }
    catch (objError) {
      return objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'Analytics could not be loaded.' });
    }
  });
  objRouter.get('/api/staff/orders',(objRequest, objResponse, fnNext) => serve(objRequest, objResponse, fnNext, true, false));
  objRouter.get('/api/staff/orders/:reference',(objRequest, objResponse, fnNext) => serve(objRequest, objResponse, fnNext, true, true));
  objRouter.get('/staff/orders',(objRequest, objResponse, fnNext) => serve(objRequest, objResponse, fnNext, false, false));
  objRouter.get('/staff/orders/:reference',(objRequest, objResponse, fnNext) => serve(objRequest, objResponse, fnNext, false, true));
  return objRouter;
}
