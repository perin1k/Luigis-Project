import { runTransaction } from './database.js';

const CATALOG_ID = 'luigis:menu:v1';
const SIZES = [
  ['small', 'Small', 12, 500, 100, 1],
  ['medium', 'Medium', 14, 700, 200, 2],
  ['large', 'Large', 18, 900, 300, 4],
];
const CRUSTS = [['regular', 'Regular'], ['new-york', 'New York-style']];
const DRINK_SIZES = [['small', 'Small', 100], ['medium', 'Medium', 200], ['large', 'Large', 300]];
const TOPPINGS = [
  ['pepperoni', 'Pepperoni'], ['sausage', 'Sausage'], ['beef', 'Beef crumbles'],
  ['peppers', 'Green peppers'], ['jalapenos', 'Jalapeños'], ['pineapple', 'Pineapple'],
  ['onion', 'Onion'], ['olives', 'Black olives'], ['tomatoes', 'Diced tomatoes'],
];
const BEVERAGES = [
  ['coca-cola', 'Coca-Cola'], ['diet-coke', 'Diet Coke'], ['sprite', 'Sprite'],
  ['dr-pepper', 'Dr Pepper'], ['sweet-tea', 'Sweet iced tea'], ['unsweet-tea', 'Unsweet iced tea'],
];

function ingredientId(strCode) { return `luigis:ingredient:${strCode}`; }
function optionId(strTable, strCode) { return `${CATALOG_ID}:${strTable}:${strCode}`; }

// Table/column identifiers come only from this module's fixed schema descriptors.
// Record keys preserve the approved database naming contract.
function insertRecord(objDatabase, strTable, objValues) {
  const arrColumns = Object.keys(objValues);
  objDatabase.prepare(`INSERT INTO ${strTable} (${arrColumns.join(', ')}) VALUES (${arrColumns.map(() => '?').join(', ')})`)
    .run(...Object.values(objValues));
}

function verifyRecord(objDatabase, strTable, objIdentity) {
  const objRow = objDatabase.prepare(`SELECT * FROM ${strTable} WHERE id = ?`).get(objIdentity.id);
  if (!objRow || Object.entries(objIdentity).some(([strColumn, objExpected]) => objRow[strColumn] !== objExpected)) {
    throw new Error('Seed identity mismatch');
  }
}

function describeOptions() {
  const arrRecords = [];
  for (const [strCode, strName, intDiameter, centsBase, centsTopping, intQuarterCups] of SIZES) {
    arrRecords.push({ strTable: 'pizza_sizes', objValues: {
      id: optionId('pizza_sizes', strCode), catalog_version_id: CATALOG_ID, code: strCode,
      display_name: strName, diameter_inches: intDiameter, base_price_cents: centsBase,
      topping_price_cents: centsTopping, marinara_quarter_cups: intQuarterCups,
    } });
  }
  for (const [strCode, strName, centsPrice] of DRINK_SIZES) {
    arrRecords.push({ strTable: 'drink_sizes', objValues: {
      id: optionId('drink_sizes', strCode), catalog_version_id: CATALOG_ID, code: strCode,
      display_name: strName, price_cents: centsPrice,
    } });
  }
  for (const [strTable, arrOptions] of [['crust_options', CRUSTS], ['toppings', TOPPINGS], ['beverages', BEVERAGES]]) {
    for (const [strCode, strName] of arrOptions) {
      arrRecords.push({ strTable, objValues: {
        id: optionId(strTable, strCode), catalog_version_id: CATALOG_ID, code: strCode, display_name: strName,
      } });
    }
  }
  return arrRecords;
}

function describeRequirements() {
  const arrRecords = [];
  function addRequirement(strTable, strColumn, strOption, strIngredient) {
    arrRecords.push({ id: `${CATALOG_ID}:requires:${strTable}:${strOption}:${strIngredient}`,
      catalog_version_id: CATALOG_ID, [strColumn]: optionId(strTable, strOption), ingredient_id: ingredientId(strIngredient) });
  }
  for (const [strCode] of SIZES) {
    for (const strIngredient of ['marinara', 'cheese']) addRequirement('pizza_sizes', 'pizza_size_id', strCode, strIngredient);
  }
  for (const [strTable, strColumn, arrOptions] of [
    ['crust_options', 'crust_option_id', CRUSTS], ['toppings', 'topping_id', TOPPINGS], ['beverages', 'beverage_id', BEVERAGES],
  ]) {
    for (const [strCode] of arrOptions) addRequirement(strTable, strColumn, strCode, strCode);
  }
  return arrRecords;
}

/** Initialize one approved baseline atomically; later runs verify structure only. */
export function seedMenu(objDatabase) {
  try {
    return runTransaction(objDatabase, () => {
      const bExists = Boolean(objDatabase.prepare('SELECT id FROM catalog_versions WHERE id = ?').get(CATALOG_ID));
      if (bExists) verifyRecord(objDatabase, 'catalog_versions', { id: CATALOG_ID, revision: 1 });
      else insertRecord(objDatabase, 'catalog_versions', { id: CATALOG_ID, revision: 1 });

      for (const [strCode, strName] of [['marinara', 'Marinara'], ['cheese', 'Cheese'], ...CRUSTS, ...TOPPINGS, ...BEVERAGES]) {
        const objIngredient = { id: ingredientId(strCode), code: strCode, display_name: strName };
        const arrExisting = objDatabase.prepare('SELECT id FROM ingredients WHERE id = ? OR code = ?').all(objIngredient.id, strCode);
        if (arrExisting.length || bExists) verifyRecord(objDatabase, 'ingredients', { id: objIngredient.id, code: strCode });
        else insertRecord(objDatabase, 'ingredients', objIngredient);
      }
      for (const { strTable, objValues } of describeOptions()) {
        if (bExists) verifyRecord(objDatabase, strTable, {
          id: objValues.id, catalog_version_id: CATALOG_ID, code: objValues.code,
        });
        else insertRecord(objDatabase, strTable, objValues);
      }
      for (const objRequirement of describeRequirements()) {
        if (bExists) verifyRecord(objDatabase, 'catalog_ingredient_requirements', objRequirement);
        else insertRecord(objDatabase, 'catalog_ingredient_requirements', objRequirement);
      }
      return { bCreated: !bExists, strCatalogVersionId: CATALOG_ID };
    });
  } catch (objError) {
    throw new Error('Menu seed conflict or unavailable schema. Run db:migrate first; review conflicting identities without overwriting them. No seed changes were saved.', { cause: objError });
  }
}
