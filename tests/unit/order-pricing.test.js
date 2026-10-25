import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePizzaPrice, calculateSubtotal, formatCurrency, validatePizzaAvailability } from '../../src/public/js/ordering/order-model.js';

test('availability blocks only affected recipes and fails closed without verified flags', () => {
  const objPizza = { strSize: 'medium', strCrust: 'regular', arrToppings: ['onion'], intQuantity: 1 };
  const objAvailability = { bKnown: true, arrUnavailableToppings: ['pepperoni'], arrUnavailableBases: [] };
  assert.doesNotThrow(() => validatePizzaAvailability(objPizza, objAvailability));
  assert.throws(() => validatePizzaAvailability({ ...objPizza, arrToppings: ['pepperoni'] }, objAvailability), /Pepperoni.*unavailable/);
  for (const strBase of ['marinara', 'cheese', 'regular']) {
    assert.throws(() => validatePizzaAvailability(objPizza, { ...objAvailability, arrUnavailableBases: [strBase] }), /unavailable/);
  }
  assert.doesNotThrow(() => validatePizzaAvailability(objPizza, { ...objAvailability, arrUnavailableBases: ['new-york'] }));
  assert.throws(() => validatePizzaAvailability(objPizza, null), /confirm ingredient availability/);
  assert.throws(() => validatePizzaAvailability(objPizza, { bKnown: true }), /confirm ingredient availability/);
});

test('pizza previews use size-specific base and topping prices in integer cents', () => {
  assert.equal(calculatePizzaPrice({ strSize: 'small', arrToppings: [], intQuantity: 1 }), 500);
  assert.equal(calculatePizzaPrice({ strSize: 'medium', arrToppings: ['onion'], intQuantity: 2 }), 1800);
  assert.equal(calculatePizzaPrice({ strSize: 'large', arrToppings: ['onion', 'pineapple'], intQuantity: 1 }), 1500);
  assert.equal(formatCurrency(1500), '$15.00');
});

test('subtotal combines multiple pizzas and individual drink quantities', () => {
  assert.equal(calculateSubtotal({
    arrPizzas: [{ strSize: 'small', arrToppings: [], intQuantity: 2 }],
    arrDrinks: [{ strSize: 'large', strName: 'Sweet iced tea', intQuantity: 2 }],
  }), 1600);
});

test('invalid quantities and unsupported menu choices do not produce prices', () => {
  for (const intQuantity of [-1, 0, 1.5, NaN, Infinity]) {
    assert.throws(() => calculatePizzaPrice({ strSize: 'small', arrToppings: [], intQuantity }));
  }
  assert.throws(() => calculatePizzaPrice({ strSize: 'giant', arrToppings: [], intQuantity: 1 }));
  assert.throws(() => calculatePizzaPrice({ strSize: 'small', arrToppings: ['unknown'], intQuantity: 1 }));
});
