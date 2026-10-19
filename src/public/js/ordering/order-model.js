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
