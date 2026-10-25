/**
 * Staff HTTP boundary for menu operations. Transport authentication/CSRF checks precede
 * service-owned permissions and business validation.
 */
import express from 'express';
import { randomBytes } from 'node:crypto';
import { AUTH_COOKIES, COOKIE_OPTIONS, createCsrfProtection, readAuthCookies } from '../auth/auth-transport.js';
import { StaffOrderError } from './orders-service.js';

export function createMenuRouter({ objMenuService, strOrigin, fnRender }) {
  const objOrigin = new URL(strOrigin);
  if (objOrigin.protocol !== 'https:' || objOrigin.origin !== strOrigin) throw new Error('Exact menu HTTPS origin required.');
  const objRouter = express.Router();
  const objCsrf = createCsrfProtection();
  objRouter.use(['/staff/menu', '/api/staff/menu'],(objRequest, objResponse, fnNext) => {
    objResponse.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie, Origin'
    });
    if (!objRequest.socket.encrypted || objRequest.headers.host !== objOrigin.host ||(objRequest.headers.origin !== undefined && objRequest.headers.origin !== strOrigin) ||(objRequest.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(objRequest.headers['sec-fetch-site']))) return objResponse.status(403).type('text').send('A secure staff connection is required.');
    try {
      objResponse.locals.objMenuCookies = readAuthCookies(objRequest.headers.cookie);
      objResponse.locals.strMenuToken = objResponse.locals.objMenuCookies[AUTH_COOKIES.strSession];
    } catch {
      return objResponse.status(400).type('text').send('Unable to read this session.');
    }
    fnNext();
  });
  objRouter.get('/staff/menu',(objRequest, objResponse, fnNext) => {
    try {
      const objMenu = objMenuService.read(objResponse.locals.strMenuToken);
      if (!objMenu) return objResponse.redirect(303, '/staff/sign-in');
      fnRender(objRequest, objResponse, fnNext, 'pages/staff-menu', {
        strTitle: 'Menu management | Luigi’s Pizza',
        strDescription: 'Manage menu prices, ingredient availability and service hours.',
        objMenu
      });
    } catch {
      objResponse.status(503).type('text').send('Menu management could not be loaded.');
    }
  });
  objRouter.get('/api/staff/menu/csrf',(objRequest, objResponse) => {
    if (!objMenuService.read(objResponse.locals.strMenuToken)) return objResponse.status(401).json({ strMessage: 'Sign in again.' });
    const objCookies = objResponse.locals.objMenuCookies;
    if (!objCookies[AUTH_COOKIES.strCsrf]) {
      objCookies[AUTH_COOKIES.strCsrf] = randomBytes(32).toString('hex');
      objResponse.cookie(AUTH_COOKIES.strCsrf, objCookies[AUTH_COOKIES.strCsrf], { ...COOKIE_OPTIONS, maxAge: 600000 });
    }
    objResponse.json({ strCsrfToken: objCsrf.token(objCookies) });
  });
  objRouter.get('/api/staff/menu/hours',(objRequest, objResponse) => {
    try {
      if (Object.keys(objRequest.query).length !== 1) throw new StaffOrderError('Choose a service date.');
      const objResult = objMenuService.readHours(objResponse.locals.strMenuToken, objRequest.query.date);
      return objResult ? objResponse.json(objResult): objResponse.status(403).json({ strMessage: 'Administrative access is required.' });
    } catch (objError) {
      objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'Hours could not be loaded.' });
    }
  });
  for (const strAction of['availability', 'prices', 'hours']) objRouter.post(`/api/staff/menu/${strAction }`,(objRequest, objResponse, fnNext) => {
    if (objRequest.headers.origin !== strOrigin || !objCsrf.verify(objResponse.locals.objMenuCookies, objRequest.headers['x-csrf-token'])) return objResponse.status(403).json({ strMessage: 'Refresh before saving.' });
    if (!objRequest.is('application/json')) return objResponse.status(415).json({ strMessage: 'JSON is required.' });
    fnNext();
  }, express.json({ limit: '8kb', strict: true, inflate: false }),(objRequest, objResponse) => {
    const objResult = objMenuService[strAction](objResponse.locals.strMenuToken, objRequest.body);
    return objResult ? objResponse.json(objResult): objResponse.status(403).json({ strMessage: 'Your session does not permit this change. Sign in again or ask an admin.' });
  });
  objRouter.use(['/staff/menu', '/api/staff/menu'],(objError, objRequest, objResponse, fnNext) => {
    if (objResponse.headersSent) return fnNext(objError);
    objResponse.status(objError instanceof StaffOrderError ? objError.intStatus: objError.status === 413 ? 413: objError.type === 'entity.parse.failed' ? 400: objError.type === 'encoding.unsupported' ? 415: 503).json({ strMessage: objError instanceof StaffOrderError ? objError.message: 'The change could not be saved. Your entered values remain available; refresh before retrying.' });
  });
  return objRouter;
}
