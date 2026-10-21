// Display data and browser price previews only; not authoritative checkout logic.
export const SIZES = {
  small: { strLabel: 'Small · 12 inch', centsBase: 500, centsTopping: 100, centsDrink: 100 },
  medium: { strLabel: 'Medium · 14 inch', centsBase: 700, centsTopping: 200, centsDrink: 200 },
  large: { strLabel: 'Large · 18 inch', centsBase: 900, centsTopping: 300, centsDrink: 300 },
};
export const TOPPINGS = {
  pepperoni: 'Pepperoni', sausage: 'Sausage', beef: 'Beef crumbles',
  peppers: 'Green peppers', jalapenos: 'Jalapeños', pineapple: 'Pineapple',
  onion: 'Onion', olives: 'Black olives', tomatoes: 'Diced tomatoes',
};
export const DRINKS = ['Coca-Cola fountain drink', 'Iced tea', 'Dr Pepper'];

// Presentation contract only. Unknown/malformed data never means "in stock".
export function normalizeAvailability(objAvailability) {
  const arrBases = ['marinara', 'cheese', 'regular', 'new-york'];
  if (objAvailability?.bKnown !== true
    || !Array.isArray(objAvailability.arrUnavailableToppings)
    || !Array.isArray(objAvailability.arrUnavailableBases)
    || objAvailability.arrUnavailableToppings.some((strId) => !Object.hasOwn(TOPPINGS, strId))
    || objAvailability.arrUnavailableBases.some((strId) => !arrBases.includes(strId))) {
    return { bKnown: false, arrUnavailableToppings: [], arrUnavailableBases: [] };
  }
  return { bKnown: true,
    arrUnavailableToppings: [...new Set(objAvailability.arrUnavailableToppings)],
    arrUnavailableBases: [...new Set(objAvailability.arrUnavailableBases)] };
}

export function validatePizzaAvailability(objPizza, objSuppliedAvailability) {
  const objAvailability = normalizeAvailability(objSuppliedAvailability);
  if (!objAvailability.bKnown) throw new Error('We can’t confirm ingredient availability right now. Your selections are still here. Please try again later.');
  if (objAvailability.arrUnavailableBases.some((strId) => ['marinara', 'cheese', objPizza.strCrust].includes(strId))) {
    throw new Error('A required ingredient for this pizza is unavailable. Please choose another available pizza.');
  }
  const strUnavailable = objPizza.arrToppings.find((strId) => objAvailability.arrUnavailableToppings.includes(strId));
  if (strUnavailable) throw new Error(`${TOPPINGS[strUnavailable]} is unavailable. Please edit this pizza before continuing.`);
}

export function formatCurrency(centsAmount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(centsAmount / 100);
}

function validateQuantity(intQuantity, bAllowZero = false) {
  if (!Number.isSafeInteger(intQuantity) || intQuantity < (bAllowZero ? 0 : 1)) {
    throw new Error('Enter a whole-number quantity.');
  }
}

export function calculatePizzaPrice(objPizza) {
  const objSize = Object.hasOwn(SIZES, objPizza.strSize) ? SIZES[objPizza.strSize] : null;
  if (!objSize || !Array.isArray(objPizza.arrToppings)
    || objPizza.arrToppings.some((strTopping) => !Object.hasOwn(TOPPINGS, strTopping))) {
    throw new Error('Choose supported pizza options.');
  }
  validateQuantity(objPizza.intQuantity);
  const centsPrice = (objSize.centsBase + objSize.centsTopping * new Set(objPizza.arrToppings).size) * objPizza.intQuantity;
  if (!Number.isSafeInteger(centsPrice)) throw new Error('Quantity is too large.');
  return centsPrice;
}

export function calculateSubtotal(objOrder) {
  const centsPizzas = objOrder.arrPizzas.reduce((centsSum, objPizza) => centsSum + calculatePizzaPrice(objPizza), 0);
  const centsDrinks = objOrder.arrDrinks.reduce((centsSum, objDrink) => {
    validateQuantity(objDrink.intQuantity, true);
    if (!Object.hasOwn(SIZES, objDrink.strSize) || !DRINKS.includes(objDrink.strName)) {
      throw new Error('Choose a supported drink.');
    }
    return centsSum + SIZES[objDrink.strSize].centsDrink * objDrink.intQuantity;
  }, 0);
  if (!Number.isSafeInteger(centsPizzas + centsDrinks)) throw new Error('Quantity is too large.');
  return centsPizzas + centsDrinks;
}
