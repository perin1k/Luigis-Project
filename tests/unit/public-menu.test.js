import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicMenu} from '../../src/ordering/public-menu.js';

test('unconfigured public menu uses all six approved beverages and baseline integer-cent prices', () => {
  const objMenu = publicMenu();
  assert.equal(objMenu.bLiveCatalog, false);
  assert.equal(objMenu.arrBeverages.length, 6);
  assert.deepEqual(objMenu.arrSizes.map(obj => obj.centsBase), [500,700,900]);
  assert.deepEqual(objMenu.arrDrinkSizes.map(obj => obj.centsPrice), [100,200,300]);
  assert.equal(objMenu.arrToppings.length, 9);
});

test('configured public menu reads current catalog on every request and preserves availability', () => {
  let centsBase = 700;
  const objService = {readCatalog() {return {arrSizes:[{centsBase}],arrToppings:[{strLabel:'Pepperoni',bAvailable:false}]};}};
  assert.equal(publicMenu(objService).arrSizes[0].centsBase,700);
  centsBase = 825;
  assert.equal(publicMenu(objService).arrSizes[0].centsBase,825);
  assert.equal(publicMenu(objService).arrToppings[0].bAvailable,false);
});
