import {SIZES, TOPPINGS, DRINKS} from '../public/js/ordering/order-model.js';

/** Public view data uses the same current catalog as checkout, never a second price list. */
export function publicMenu(objCatalogService) {
  if (objCatalogService) return {...objCatalogService.readCatalog(), bLiveCatalog:true};
  // Unconfigured presentation still shows the approved baseline, without claiming
  // that ingredient availability was verified against a running restaurant.
  return {
    bLiveCatalog:false,
    arrSizes:Object.entries(SIZES).map(([strCode, objSize]) => ({strCode,
      strLabel:strCode[0].toUpperCase()+strCode.slice(1),
      intDiameter:{small:12,medium:14,large:18}[strCode],
      centsBase:objSize.centsBase, centsTopping:objSize.centsTopping, bAvailable:true})),
    arrToppings:Object.entries(TOPPINGS).map(([strCode, strLabel]) => ({strCode,strLabel,bAvailable:true})),
    arrCrusts:[{strLabel:'Regular',bAvailable:true},{strLabel:'New York-style',bAvailable:true}],
    arrBeverages:DRINKS.map(strLabel => ({strLabel,bAvailable:true})),
    arrDrinkSizes:Object.entries(SIZES).map(([strCode,objSize]) => ({strCode,
      strLabel:strCode[0].toUpperCase()+strCode.slice(1),centsPrice:objSize.centsDrink,bAvailable:true})),
    arrUnavailableBases:[],
  };
}
