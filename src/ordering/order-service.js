import { createHash, randomUUID } from 'node:crypto';
import { runTransaction } from '../data/database.js';
import { PricingError } from './catalog-service.js';

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function invalid(strMessage) { throw new PricingError('invalid_order', strMessage); }
function exact(objValue, arrKeys) {
  return objValue && typeof objValue === 'object' && !Array.isArray(objValue)
    && Object.keys(objValue).length === arrKeys.length && arrKeys.every((strKey) => Object.hasOwn(objValue, strKey));
}
export function validateContact(objContact, strService) {
  if (!['carry-out', 'dine-in'].includes(strService)
    || !exact(objContact, ['strName', 'strPhone', 'strEmail'])) invalid('Choose a service type and provide contact details.');
  for (const strKey of ['strName', 'strPhone', 'strEmail']) {
    if (typeof objContact[strKey] !== 'string' || /[\p{Cc}\p{Cf}]/u.test(objContact[strKey])) invalid('Check your contact details.');
  }
  const objClean = Object.fromEntries(Object.entries(objContact).map(([strKey, strValue]) => [strKey, strValue.trim()]));
  if (!objClean.strName || objClean.strName.length > 100) invalid('Enter a name of 1–100 characters.');
  const strDigits = objClean.strPhone.replace(/[^0-9]/g, '');
  if (objClean.strPhone && (!/^[+()0-9 .-]{7,40}$/.test(objClean.strPhone) || strDigits.length < 7 || strDigits.length > 15)) invalid('Enter a usable phone number, including your area code.');
  if (objClean.strEmail && (objClean.strEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(objClean.strEmail))) invalid('Enter a usable email address.');
  if (strService === 'carry-out' ? !objClean.strPhone : !objClean.strPhone && !objClean.strEmail) invalid(strService === 'carry-out' ? 'Carry-out requires a phone number.' : 'Dine-in requires a phone number or email address.');
  return objClean;
}

/** Persist an unpaid accepted snapshot and, when configured, its atomic capacity hold. */
export function createOrderService(objDatabase, objCatalogService, objSchedulingService) {
  function submitOrder(objInput) {
    if (!exact(objInput, ['strRequestId', 'strService', 'objContact', 'objPricing', ...(objSchedulingService ? ['objPickup'] : [])])
      || typeof objInput.strRequestId !== 'string' || !UUID_PATTERN.test(objInput.strRequestId)) invalid('Use a valid order request identifier.');
    const objContact = validateContact(objInput.objContact, objInput.strService);
    // Keyed by an unguessable request UUID; the hash detects changed retries without storing raw requests.
    const strOrderId = objInput.strRequestId;
    const strQuoteId = createHash('sha256').update(JSON.stringify([strOrderId, objInput.strService, objContact, objInput.objPricing, ...(objSchedulingService ? [objInput.objPickup] : [])])).digest('hex');
    return runTransaction(objDatabase, () => {
      const objExisting = objDatabase.prepare('SELECT public_reference, accepted_quote_id FROM orders WHERE id=?').get(strOrderId);
      if (objExisting) {
        if (objExisting.accepted_quote_id !== strQuoteId) throw new PricingError('request_conflict', 'This request already saved a different order. Review your changes and try again.', 409);
        return result(objExisting.public_reference, true, strOrderId);
      }
      const objPrice = objCatalogService.priceOrder(objInput.objPricing, { bWithinTransaction: true });
      const strVersion = objPrice.strCatalogVersionId;
      const strReference = randomUUID();
      const dtNow = objSchedulingService?.now() ?? new Date().toISOString();
      const dtExpires = new Date(Date.parse(dtNow) + 30 * 60 * 1000).toISOString();
      objDatabase.prepare('INSERT INTO orders (id, public_reference, service_type, catalog_version_id, created_at) VALUES (?,?,?,?,?)')
        .run(strOrderId, strReference, objInput.strService, strVersion, dtNow);
      objDatabase.prepare('INSERT INTO order_contacts (order_id,customer_name,phone,email) VALUES (?,?,?,?)')
        .run(strOrderId, objContact.strName, objContact.strPhone || null, objContact.strEmail || null);
      function catalogOption(strTable, strCode) {
        return objDatabase.prepare(`SELECT * FROM ${strTable} WHERE catalog_version_id=? AND code=?`).get(strVersion, strCode);
      }
      let intLine = 0;
      for (const objPizza of objInput.objPricing.arrPizzas) {
        const objSize = catalogOption('pizza_sizes', objPizza.strSize);
        const objCrust = catalogOption('crust_options', objPizza.strCrust);
        const strLineId = randomUUID();
        const centsUnit = objSize.base_price_cents + objSize.topping_price_cents * objPizza.arrToppings.length;
        insertLine(strLineId, 'pizza', objPizza.intQuantity, `${objSize.display_name} pizza`, centsUnit);
        objDatabase.prepare('INSERT INTO pizza_line_details VALUES (?,?,?,?,?,?,?,?)')
          .run(strLineId, strVersion, objSize.id, objCrust.id, objSize.display_name, objCrust.display_name, objSize.base_price_cents, objSize.topping_price_cents);
        for (const strCode of objPizza.arrToppings) {
          const objTopping = catalogOption('toppings', strCode);
          objDatabase.prepare('INSERT INTO pizza_line_toppings VALUES (?,?,?,?,?)').run(strLineId, strVersion, objTopping.id, objTopping.display_name, objSize.topping_price_cents);
        }
      }
      for (const objDrink of objInput.objPricing.arrDrinks) {
        const objBeverage = catalogOption('beverages', objDrink.strBeverage);
        const objSize = catalogOption('drink_sizes', objDrink.strSize);
        const strLineId = randomUUID();
        insertLine(strLineId, 'drink', objDrink.intQuantity, `${objSize.display_name} ${objBeverage.display_name}`, objSize.price_cents);
        objDatabase.prepare('INSERT INTO drink_line_details VALUES (?,?,?,?,?,?)')
          .run(strLineId, strVersion, objBeverage.id, objSize.id, objBeverage.display_name, objSize.display_name);
      }
      function insertLine(strId, strType, intQuantity, strLabel, centsUnit) {
        objDatabase.prepare('INSERT INTO order_lines VALUES (?,?,?,?,?,?,?,?,?)')
          .run(strId, strOrderId, strVersion, ++intLine, strType, intQuantity, strLabel, centsUnit, centsUnit * intQuantity);
      }
      objDatabase.prepare(`INSERT INTO order_quotes (id,order_id,catalog_version_id,item_subtotal_cents,tax_cents,tip_cents,total_cents,currency,tax_policy_reference,rounding_policy_reference,created_at,expires_at)
        VALUES (?,?,?,?,?,?,?,'USD',?,?,?,?)`).run(strQuoteId, strOrderId, strVersion, objPrice.centsSubtotal, objPrice.centsTax, objPrice.centsTip, objPrice.centsTotal,
        objPrice.strTaxPolicy, 'invoice-half-up-v1', dtNow, dtExpires);
      if (objSchedulingService) objSchedulingService.reserve(strOrderId, objInput.objPickup, objInput.objPricing.arrPizzas.reduce((intSum, objPizza) => intSum + objPizza.intQuantity, 0), dtNow);
      objDatabase.prepare('UPDATE order_quotes SET accepted_at=? WHERE id=?').run(dtNow, strQuoteId);
      return result(strReference, false, strOrderId);
    });
  }
  function result(strReference, bReplayed, strOrderId) {
    const objPickup = objSchedulingService?.readReservation(strOrderId);
    return { strReference, strState: 'unpaid', bReplayed,
      ...(objPickup ? { objPickup } : {}),
      strMessage: objPickup?.strHoldState === 'active' ? 'Your order details and pickup hold are saved. Payment is still required; your order is not confirmed.'
        : objPickup ? 'Your order details are saved, but the pickup hold is no longer active. Refresh pickup times before starting a new checkout; your order is not confirmed.'
        : 'Your order details are saved. Payment and a pickup time are still required; your order is not confirmed.' };
  }
  return { submitOrder };
}
