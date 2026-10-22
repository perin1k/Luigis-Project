import { createHash } from 'node:crypto';

export class PricingError extends Error {
  constructor(strCode, strMessage, intStatus = 422) { super(strMessage); this.strCode = strCode; this.intStatus = intStatus; }
}
function fail(strMessage) { throw new PricingError('invalid_order', strMessage); }
function hasExactKeys(objValue, arrKeys) {
  return objValue && typeof objValue === 'object' && !Array.isArray(objValue)
    && Object.keys(objValue).length === arrKeys.length && arrKeys.every((strKey) => Object.hasOwn(objValue, strKey));
}
function validateCatalogCents(centsAmount) {
  if (!Number.isSafeInteger(centsAmount) || centsAmount < 0) throw new Error('Invalid catalog money.');
  return centsAmount;
}
function roundedRatio(centsAmount, intNumerator, intDenominator) {
  const centsResult = Number((BigInt(centsAmount) * BigInt(intNumerator) * 2n + BigInt(intDenominator)) / (2n * BigInt(intDenominator)));
  if (!Number.isSafeInteger(centsResult)) fail('The amount is too large.');
  return centsResult;
}

/** Read-only current-menu pricing. Never accepts a client price or creates a paid order. */
export function createCatalogService(objDatabase) {
  function readCatalogSnapshot() {
    // Unpublished future drafts are never exposed. The reviewed v1 seed is the demo baseline.
    const objVersion = objDatabase.prepare(`SELECT id,revision FROM catalog_versions WHERE published_at IS NOT NULL
      ORDER BY revision DESC LIMIT 1`).get()
      ?? objDatabase.prepare("SELECT id,revision FROM catalog_versions WHERE id='luigis:menu:v1' AND revision=1").get();
    if (!objVersion) throw new PricingError('menu_unavailable', 'The menu is unavailable. Please try again.', 503);
    const strVersion = objVersion.id;
    function options(strTable) {
      return objDatabase.prepare(`SELECT * FROM ${strTable} WHERE catalog_version_id=? ORDER BY code`).all(strVersion);
    }
    const arrRequirements = objDatabase.prepare(`SELECT r.*, i.is_available, i.code AS strIngredientCode FROM catalog_ingredient_requirements r
      JOIN ingredients i ON i.id=r.ingredient_id WHERE r.catalog_version_id=? ORDER BY r.id`).all(strVersion);
    function available(objRow, strColumn) {
      const arrMatches = arrRequirements.filter((objRequirement) => objRequirement[strColumn] === objRow.id);
      // Drink sizes have no ingredient mapping; all other options require explicit mappings.
      return objRow.is_active === 1 && (strColumn === null || arrMatches.length > 0
        && (strColumn !== 'pizza_size_id' || ['marinara', 'cheese'].every((strCode) => arrMatches.some((objRequirement) => objRequirement.strIngredientCode === strCode)))
        && arrMatches.every((objRequirement) => objRequirement.is_available === 1));
    }
    const objCatalog = { strCatalogVersionId: strVersion, intRevision: objVersion.revision,
      arrSizes: options('pizza_sizes').sort((objLeft, objRight) => objLeft.diameter_inches - objRight.diameter_inches).map((objRow) => ({ strCode: objRow.code, strLabel: objRow.display_name,
        intDiameter: objRow.diameter_inches, centsBase: validateCatalogCents(objRow.base_price_cents), centsTopping: validateCatalogCents(objRow.topping_price_cents), bAvailable: available(objRow, 'pizza_size_id') })),
      arrCrusts: options('crust_options').map((objRow) => ({ strCode: objRow.code, strLabel: objRow.display_name, bAvailable: available(objRow, 'crust_option_id') })),
      arrToppings: options('toppings').map((objRow) => ({ strCode: objRow.code, strLabel: objRow.display_name, bAvailable: available(objRow, 'topping_id') })),
      arrBeverages: options('beverages').map((objRow) => ({ strCode: objRow.code, strLabel: objRow.display_name, bAvailable: available(objRow, 'beverage_id') })),
      arrDrinkSizes: options('drink_sizes').sort((objLeft, objRight) => objLeft.price_cents - objRight.price_cents).map((objRow) => ({ strCode: objRow.code, strLabel: objRow.display_name,
        centsPrice: validateCatalogCents(objRow.price_cents), bAvailable: available(objRow, null) })),
      strTaxPolicy: 'cookeville-demo-tn-prepared-food-975bp-invoice-half-up-v1', intTaxBasisPoints: 975 };
    if (!objCatalog.arrSizes.length || !objCatalog.arrCrusts.length || !objCatalog.arrBeverages.length || !objCatalog.arrDrinkSizes.length) {
      throw new PricingError('menu_unavailable', 'The menu is unavailable. Please try again.', 503);
    }
    objCatalog.arrUnavailableBases = [
      ...objDatabase.prepare("SELECT code FROM ingredients WHERE code IN ('marinara','cheese') AND is_available=0 ORDER BY code").all().map((objRow) => objRow.code),
      ...objCatalog.arrCrusts.filter((objItem) => !objItem.bAvailable).map((objItem) => objItem.strCode),
    ];
    objCatalog.strFingerprint = createHash('sha256').update(JSON.stringify(objCatalog)).digest('hex');
    return objCatalog;
  }
  function priceOrder(objInput, { bWithinTransaction = false } = {}) {
    if (!hasExactKeys(objInput, ['strCatalogFingerprint', 'arrPizzas', 'arrDrinks', 'intTipPercent'])
      || typeof objInput.strCatalogFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(objInput.strCatalogFingerprint)
      || !Array.isArray(objInput.arrPizzas) || objInput.arrPizzas.length < 1 || objInput.arrPizzas.length > 6
      || !Array.isArray(objInput.arrDrinks) || objInput.arrDrinks.length > 10
      || !Number.isSafeInteger(objInput.intTipPercent) || objInput.intTipPercent < 0) fail('Check the order options, quantities and optional tip.');
    // One synchronous read transaction gives a coherent catalog/availability snapshot.
    if (!bWithinTransaction) objDatabase.exec('BEGIN');
    try {
      const objCatalog = readCatalogSnapshot();
      if (objInput.strCatalogFingerprint !== objCatalog.strFingerprint) {
        const objError = new PricingError('menu_changed', 'The menu changed. Review the updated prices before continuing.', 409);
        objError.objCatalog = objCatalog; throw objError;
      }
      function option(arrOptions, strCode) {
        const objOption = arrOptions.find((objItem) => objItem.strCode === strCode);
        if (!objOption) fail('Choose supported menu options.');
        if (!objOption.bAvailable) throw new PricingError('unavailable_item', `${objOption.strLabel} is unavailable. Edit your order before continuing.`);
        return objOption;
      }
      function quantity(intQuantity) { if (!Number.isSafeInteger(intQuantity) || intQuantity < 1) fail('Enter positive whole-number quantities.'); }
      let intPizzas = 0; let intDrinks = 0;
      const arrLines = [];
      for (const objPizza of objInput.arrPizzas) {
        if (!hasExactKeys(objPizza, ['strSize', 'strCrust', 'arrToppings', 'intQuantity']) || !Array.isArray(objPizza.arrToppings)
          || objPizza.arrToppings.length > objCatalog.arrToppings.length || new Set(objPizza.arrToppings).size !== objPizza.arrToppings.length) fail('Choose each supported topping once.');
        quantity(objPizza.intQuantity); intPizzas += objPizza.intQuantity;
        if (intPizzas > 6) fail('Choose no more than six pizzas per order.');
        const objSize = option(objCatalog.arrSizes, objPizza.strSize);
        option(objCatalog.arrCrusts, objPizza.strCrust);
        for (const strTopping of objPizza.arrToppings) option(objCatalog.arrToppings, strTopping);
        const centsLine = (BigInt(objSize.centsBase) + BigInt(objSize.centsTopping) * BigInt(objPizza.arrToppings.length)) * BigInt(objPizza.intQuantity);
        if (centsLine > BigInt(Number.MAX_SAFE_INTEGER)) fail('The amount is too large.');
        arrLines.push({ strType: 'pizza', intQuantity: objPizza.intQuantity, centsTotal: Number(centsLine) });
      }
      for (const objDrink of objInput.arrDrinks) {
        if (!hasExactKeys(objDrink, ['strBeverage', 'strSize', 'intQuantity'])) fail('Choose supported drink options.');
        quantity(objDrink.intQuantity); intDrinks += objDrink.intQuantity;
        if (intDrinks > 10) fail('Choose no more than ten drinks per order.');
        option(objCatalog.arrBeverages, objDrink.strBeverage);
        const objSize = option(objCatalog.arrDrinkSizes, objDrink.strSize);
        const centsLine = BigInt(objSize.centsPrice) * BigInt(objDrink.intQuantity);
        if (centsLine > BigInt(Number.MAX_SAFE_INTEGER)) fail('The amount is too large.');
        arrLines.push({ strType: 'drink', intQuantity: objDrink.intQuantity, centsTotal: Number(centsLine) });
      }
      const centsSubtotalBigInt = arrLines.reduce((centsSum, objLine) => centsSum + BigInt(objLine.centsTotal), 0n);
      if (centsSubtotalBigInt > BigInt(Number.MAX_SAFE_INTEGER)) fail('The amount is too large.');
      const centsSubtotal = Number(centsSubtotalBigInt);
      const centsTax = roundedRatio(centsSubtotal, 975, 10000);
      if (!Number.isSafeInteger(centsSubtotal + centsTax)) fail('The amount is too large.');
      const centsTip = roundedRatio(centsSubtotal + centsTax, objInput.intTipPercent, 100);
      const centsTotal = centsSubtotal + centsTax + centsTip;
      if (!Number.isSafeInteger(centsTotal)) fail('The amount is too large.');
      if (!bWithinTransaction) objDatabase.exec('COMMIT');
      return { strCatalogFingerprint: objCatalog.strFingerprint, strCatalogVersionId: objCatalog.strCatalogVersionId,
        strTaxPolicy: objCatalog.strTaxPolicy, intTaxBasisPoints: 975, centsSubtotal, centsTax, centsTip, centsTotal, arrLines };
    } catch (objError) { if (!bWithinTransaction) objDatabase.exec('ROLLBACK'); throw objError; }
  }
  function readCatalog({ bWithinTransaction = false } = {}) {
    if (!bWithinTransaction) objDatabase.exec('BEGIN');
    try { const objCatalog = readCatalogSnapshot(); if (!bWithinTransaction) objDatabase.exec('COMMIT'); return objCatalog; }
    catch (objError) { if (!bWithinTransaction) objDatabase.exec('ROLLBACK'); throw objError; }
  }
  return { readCatalog, priceOrder };
}
