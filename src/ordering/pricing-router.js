import express from 'express';
import { PricingError } from './catalog-service.js';
export function createPricingRouter(objCatalogService) {
  const objRouter = express.Router();
  objRouter.use((objRequest, objResponse, fnNext) => {
    objResponse.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' });
    if (objRequest.method === 'POST' && (!objRequest.is('application/json')
      || objRequest.headers['sec-fetch-site'] === 'cross-site')) return objResponse.status(415).json({ strMessage: 'Use a same-site JSON request.' });
    fnNext();
  });
  objRouter.use(express.json({ limit: '8kb', strict: true, inflate: false }));
  objRouter.get('/catalog', (objRequest, objResponse) => objResponse.json(objCatalogService.readCatalog()));
  objRouter.post('/preview', (objRequest, objResponse) => objResponse.json(objCatalogService.priceOrder(objRequest.body)));
  objRouter.use((objError, objRequest, objResponse, fnNext) => {
    if (objResponse.headersSent) return fnNext(objError);
    if (objError instanceof PricingError) return objResponse.status(objError.intStatus).json({
      strCode: objError.strCode, strMessage: objError.message, ...(objError.objCatalog ? { objCatalog: objError.objCatalog } : {}) });
    const intStatus = objError.type === 'entity.too.large' ? 413 : objError.type === 'entity.parse.failed' ? 400 : objError.type === 'encoding.unsupported' ? 415 : 503;
    objResponse.status(intStatus).json({ strMessage: intStatus === 503 ? 'Pricing is unavailable. Your selections are preserved. Please try again.' : 'Invalid pricing request.' });
  });
  return objRouter;
}
