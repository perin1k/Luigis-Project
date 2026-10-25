/**
 * HTTP boundary for saving orders: checks origin, content type and optional customer cookie before calling the authoritative order service. Errors expose safe messages only.
 */
import express from 'express';
import { PricingError } from './catalog-service.js';
import {CUSTOMER_COOKIES,readCustomerCookies} from '../customer/customer-transport.js';
export function createOrderRouter(objOrderService,{objCustomerService}={}) {
  const objRouter = express.Router();
  objRouter.use((objRequest, objResponse, fnNext) => {
    objResponse.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
    const strHost = objRequest.headers.host;
    const strProtocol = objRequest.socket.encrypted ? 'https' : 'http';
    const bLoopback = /^127\.0\.0\.1:\d+$/.test(strHost ?? '') || /^localhost:\d+$/.test(strHost ?? '');
    if ((!objRequest.socket.encrypted && !bLoopback) || objRequest.headers.origin !== `${strProtocol}://${strHost}`
      || objRequest.headers['sec-fetch-site'] === 'cross-site') return objResponse.status(403).json({ strMessage: 'Use the ordering page on this site.' });
    if (!objRequest.is('application/json')) return objResponse.status(415).json({ strMessage: 'Use a JSON request.' });
    fnNext();
  });
  objRouter.use(express.json({ limit: '8kb', strict: true, inflate: false }));
  objRouter.post('/', (objRequest, objResponse) => {
    let strCustomerToken=null;
    if(objCustomerService){try{strCustomerToken=readCustomerCookies(objRequest.headers.cookie)[CUSTOMER_COOKIES.strSession]??null;}catch{return objResponse.status(400).json({strMessage:'Customer cookies could not be read. Sign in again before ordering.'});}}
    const objResult = objOrderService.submitOrder(objRequest.body,strCustomerToken);
    objResponse.status(objResult.bReplayed ? 200 : 201).json(objResult);
  });
  objRouter.use((objError, objRequest, objResponse, fnNext) => {
    if (objResponse.headersSent) return fnNext(objError);
    if (objError instanceof PricingError) return objResponse.status(objError.intStatus).json({ strCode: objError.strCode, strMessage: objError.message,
      ...(objError.objCatalog ? { objCatalog: objError.objCatalog } : {}) });
    const intStatus = objError.type === 'entity.too.large' ? 413 : objError.type === 'entity.parse.failed' ? 400 : objError.type === 'encoding.unsupported' ? 415 : 503;
    objResponse.status(intStatus).json({ strMessage: 'Unable to save your order. Your selections are preserved. Please try again.' });
  });
  return objRouter;
}
