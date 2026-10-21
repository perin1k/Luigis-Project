// Isolated browser-test server. This provider is never imported by src/server.js.
import objApp from '../../src/app.js';

objApp.locals.fnGetAvailability = async (objRequest) => {
  const strScenario = /(?:^|;\s*)availability=([a-z-]+)/.exec(objRequest.headers.cookie ?? '')?.[1];
  if (strScenario === 'error') throw new Error('PRIVATE_TEST_ERROR');
  if (strScenario === 'unknown') return null;
  return { bKnown: true,
    arrUnavailableToppings: strScenario === 'topping' ? ['pepperoni'] : [],
    arrUnavailableBases: strScenario === 'base' ? ['marinara'] : strScenario === 'crust' ? ['regular'] : [] };
};
await import('../../src/server.js');
