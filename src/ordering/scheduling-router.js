/**
 * Exposes currently offered ready times; selecting an option here does not itself reserve capacity. Submission rechecks availability atomically.
 */
import express from 'express';
import { PricingError } from './catalog-service.js';
export function createSchedulingRouter(objSchedulingService) {
  const objRouter = express.Router();
  objRouter.get('/', (objRequest, objResponse) => {
    objResponse.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    try {
      if (Object.keys(objRequest.query).length !== 1 || typeof objRequest.query.pizzas !== 'string' || !/^[1-6]$/.test(objRequest.query.pizzas)) throw new PricingError('invalid_quantity', 'Choose between one and six pizzas.');
      objResponse.json(objSchedulingService.listOptions(Number(objRequest.query.pizzas)));
    } catch (objError) {
      objResponse.status(objError instanceof PricingError ? objError.intStatus : 503).json({ strCode: objError instanceof PricingError ? objError.strCode : 'schedule_unavailable',
        strMessage: objError instanceof PricingError ? objError.message : 'Pickup times are unavailable. Please try again.' });
    }
  });
  return objRouter;
}
