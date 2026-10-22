import {randomUUID} from 'node:crypto';
import {createCatalogService} from '../ordering/catalog-service.js';
import {chicagoDate,localHour} from '../ordering/scheduling-service.js';
import {StaffOrderError} from './orders-service.js';
const OPTION_TABLES=['pizza_sizes','crust_options','toppings','beverages','drink_sizes'];
const REFERENCE_COLUMNS=['pizza_size_id','crust_option_id','topping_id','beverage_id'];
function exact(objValue,arrKeys){return objValue&&typeof objValue==='object'&&!Array.isArray(objValue)&&Object.keys(objValue).length===arrKeys.length&&arrKeys.every((strKey)=>Object.hasOwn(objValue,strKey));}
function invalid(strMessage){throw new StaffOrderError(strMessage,422);}
function conflict(){throw new StaffOrderError('Another team member changed this record. Refresh and review before saving.',409);}
export function createMenuService(objDatabase,objSessions){
  const objCatalog=createCatalogService(objDatabase);
  function audit(objIdentity,dtNow,strAction,strType,strId,strSummary){const strEventId=randomUUID();objDatabase.prepare('INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary) VALUES (?,?,?,?,?,?,?,\'operator_request\',?)').run(strEventId,objIdentity.strUserId,strAction,strType,strId,dtNow.toISOString(),strEventId,strSummary);}
  function reviews(arrOrders,strType,strReference,dtNow){let intReviews=0;for(const objOrder of arrOrders){objDatabase.prepare('INSERT INTO fulfillment_reviews (id,order_id,trigger_type,trigger_reference,opened_at) VALUES (?,?,?,?,?)').run(randomUUID(),objOrder.id,strType,strReference,dtNow.toISOString());objDatabase.prepare('UPDATE orders SET revision=revision+1 WHERE id=?').run(objOrder.id);intReviews++;}return intReviews;}
  function snapshot(objIdentity){return {bAdmin:objIdentity.strRole==='admin',objCatalog:objCatalog.readCatalog({bWithinTransaction:true}),arrIngredients:objDatabase.prepare('SELECT id AS strId,display_name AS strLabel,is_available AS bAvailable,revision AS intRevision FROM ingredients ORDER BY display_name').all()};}
  function read(strToken){return objSessions.executeAuthorized(strToken,'availability.update',(objIdentity)=>snapshot(objIdentity));}
  function availability(strToken,objInput){return objSessions.executeAuthorized(strToken,'availability.update',(objIdentity,dtNow)=>{
    if(!exact(objInput,['strId','intRevision','bAvailable'])||typeof objInput.strId!=='string'||!Number.isSafeInteger(objInput.intRevision)||typeof objInput.bAvailable!=='boolean')invalid('Choose an ingredient and its availability.');
    const objIngredient=objDatabase.prepare('SELECT * FROM ingredients WHERE id=?').get(objInput.strId);if(!objIngredient)invalid('Ingredient unavailable.');if(objIngredient.revision!==objInput.intRevision)conflict();
    let intReviews=0;
    if(objIngredient.is_available!==Number(objInput.bAvailable)){
      objDatabase.prepare('UPDATE ingredients SET is_available=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=?').run(Number(objInput.bAvailable),dtNow.toISOString(),objIdentity.strUserId,objInput.strId);
      if(!objInput.bAvailable){const arrOrders=objDatabase.prepare(`SELECT DISTINCT o.id FROM orders o JOIN order_lines l ON l.order_id=o.id
        LEFT JOIN pizza_line_details p ON p.order_line_id=l.id LEFT JOIN pizza_line_toppings t ON t.order_line_id=l.id LEFT JOIN drink_line_details d ON d.order_line_id=l.id
        JOIN catalog_ingredient_requirements r ON r.catalog_version_id=l.catalog_version_id AND (r.pizza_size_id=p.pizza_size_id OR r.crust_option_id=p.crust_option_id OR r.topping_id=t.topping_id OR r.beverage_id=d.beverage_id)
        WHERE r.ingredient_id=? AND o.fulfillment_status IN ('Received','Preparing','Baking','Ready')`).all(objInput.strId);
        intReviews=reviews(arrOrders,'inventory_change',`${objInput.strId}:${objInput.intRevision+1}`,dtNow);}
      audit(objIdentity,dtNow,'availability_change','ingredient',objInput.strId,'Availability changed');
    }
    return {...snapshot(objIdentity),intReviews};
  });}
  function prices(strToken,objInput){return objSessions.executeAuthorized(strToken,'menu.edit',(objIdentity,dtNow)=>{
    if(!exact(objInput,['strFingerprint','arrSizes','arrDrinkSizes'])||!Array.isArray(objInput.arrSizes)||!Array.isArray(objInput.arrDrinkSizes))invalid('Review every size price before saving.');
    const objCurrent=objCatalog.readCatalog({bWithinTransaction:true});if(objCurrent.strFingerprint!==objInput.strFingerprint)conflict();
    function validateRows(arrInput,arrCurrent,arrAmounts){if(arrInput.length!==arrCurrent.length||new Set(arrInput.map((objRow)=>objRow?.strCode)).size!==arrCurrent.length)invalid('Include each current size exactly once.');for(const objRow of arrInput){if(!exact(objRow,['strCode',...arrAmounts])||!arrCurrent.some((objItem)=>objItem.strCode===objRow.strCode)||arrAmounts.some((strKey)=>!Number.isSafeInteger(objRow[strKey])||objRow[strKey]<0||objRow[strKey]>1000000))invalid('Prices must be whole cents from 0 to 1000000.');}}
    validateRows(objInput.arrSizes,objCurrent.arrSizes,['centsBase','centsTopping']);validateRows(objInput.arrDrinkSizes,objCurrent.arrDrinkSizes,['centsPrice']);
    const strVersion=randomUUID();const intRevision=objDatabase.prepare('SELECT max(revision) AS n FROM catalog_versions').get().n+1;
    objDatabase.prepare('INSERT INTO catalog_versions (id,revision) VALUES (?,?)').run(strVersion,intRevision);
    const mapIds=new Map();
    function insert(strTable,objRow){const arrColumns=Object.keys(objRow);objDatabase.prepare(`INSERT INTO ${strTable} (${arrColumns.join(',')}) VALUES (${arrColumns.map(()=>'?').join(',')})`).run(...Object.values(objRow));}
    for(const strTable of OPTION_TABLES)for(const objOld of objDatabase.prepare(`SELECT * FROM ${strTable} WHERE catalog_version_id=?`).all(objCurrent.strCatalogVersionId)){
      const strId=randomUUID();mapIds.set(objOld.id,strId);const objNew={...objOld,id:strId,catalog_version_id:strVersion};
      if(strTable==='pizza_sizes'){const objPrice=objInput.arrSizes.find((objRow)=>objRow.strCode===objOld.code);objNew.base_price_cents=objPrice.centsBase;objNew.topping_price_cents=objPrice.centsTopping;}
      if(strTable==='drink_sizes')objNew.price_cents=objInput.arrDrinkSizes.find((objRow)=>objRow.strCode===objOld.code).centsPrice;
      insert(strTable,objNew);
    }
    for(const objOld of objDatabase.prepare('SELECT * FROM catalog_ingredient_requirements WHERE catalog_version_id=?').all(objCurrent.strCatalogVersionId)){
      const objNew={...objOld,id:randomUUID(),catalog_version_id:strVersion};for(const strColumn of REFERENCE_COLUMNS)if(objNew[strColumn])objNew[strColumn]=mapIds.get(objNew[strColumn]);insert('catalog_ingredient_requirements',objNew);
    }
    objDatabase.prepare('UPDATE catalog_versions SET published_at=?,published_by=? WHERE id=?').run(dtNow.toISOString(),objIdentity.strUserId,strVersion);
    audit(objIdentity,dtNow,'menu_change','catalog',strVersion,'Menu changed');return snapshot(objIdentity);
  });}
  function readHours(strToken,strDate){return objSessions.executeAuthorized(strToken,'hours.manage',()=>{validateDate(strDate);return {objDay:objDatabase.prepare('SELECT * FROM service_days WHERE service_date=?').get(strDate)??{service_date:strDate,revision:0,is_closed:0,opens_at:localHour(strDate,10),closes_at:localHour(strDate,23)}};});}
  function validateDate(strDate){if(typeof strDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(strDate)||!Number.isFinite(Date.parse(strDate))||new Date(strDate).toISOString().slice(0,10)!==strDate)invalid('Choose a valid service date.');}
  function hours(strToken,objInput){return objSessions.executeAuthorized(strToken,'hours.manage',(objIdentity,dtNow)=>{
    if(!exact(objInput,['strDate','intRevision','bClosed','intOpens','intCloses'])||!Number.isSafeInteger(objInput.intRevision)||typeof objInput.bClosed!=='boolean')invalid('Review the service date and hours.');validateDate(objInput.strDate);
    if(objInput.strDate<chicagoDate(dtNow))invalid('Past service hours cannot be changed.');
    if(!Number.isSafeInteger(objInput.intOpens)||!Number.isSafeInteger(objInput.intCloses)||objInput.intOpens<4||objInput.intCloses>23||objInput.intCloses<=objInput.intOpens)invalid('Use same-day whole-hour opening/closing times between 4 AM and 11 PM.');
    const objDay=objDatabase.prepare('SELECT * FROM service_days WHERE service_date=?').get(objInput.strDate);if((objDay?.revision??0)!==objInput.intRevision)conflict();
    const strId=objDay?.id??`service-day:${objInput.strDate}`;const dtOpen=objInput.bClosed?null:localHour(objInput.strDate,objInput.intOpens);const dtClose=objInput.bClosed?null:localHour(objInput.strDate,objInput.intCloses);
    const dtCutoff=dtClose?new Date(Date.parse(dtClose)-30*60000).toISOString():null;const dtLatest=dtClose?new Date(Date.parse(dtClose)-10*60000).toISOString():null;
    const intRevision=(objDay?.revision??0)+1;
    objDatabase.prepare(`INSERT INTO service_days (id,service_date,opens_at,closes_at,cutoff_at,latest_pickup_at,is_closed,revision,changed_by) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET opens_at=excluded.opens_at,closes_at=excluded.closes_at,cutoff_at=excluded.cutoff_at,latest_pickup_at=excluded.latest_pickup_at,is_closed=excluded.is_closed,revision=excluded.revision,changed_by=excluded.changed_by`).run(strId,objInput.strDate,dtOpen,dtClose,dtCutoff,dtLatest,Number(objInput.bClosed),intRevision,objIdentity.strUserId);
    const arrOrders=objDatabase.prepare(`SELECT o.id FROM orders o JOIN fulfillment_bookings b ON b.order_id=o.id WHERE b.service_day_id=? AND o.fulfillment_status IN ('Received','Preparing','Baking','Ready') AND (?=1 OR b.promised_at<? OR b.promised_at>?)`).all(strId,Number(objInput.bClosed),dtOpen,dtLatest);
    const intReviews=reviews(arrOrders,'hours_change',`${strId}:${intRevision}`,dtNow);audit(objIdentity,dtNow,'hours_change','service_day',strId,'Hours changed');return {objDay:objDatabase.prepare('SELECT * FROM service_days WHERE id=?').get(strId),intReviews};
  });}
  return {read,availability,prices,readHours,hours};
}
