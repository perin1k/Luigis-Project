import { chicagoDate } from '../ordering/scheduling-service.js';
const ACTIVE_STATES=['Received','Preparing','Baking','Ready'];
const PAGE_SIZE=20;
const PAID_SQL=`(EXISTS (SELECT 1 FROM demo_payment_attempts p WHERE p.order_id=o.id AND p.quote_id=o.accepted_quote_id AND p.state='succeeded')
  OR EXISTS (SELECT 1 FROM payment_attempts p WHERE p.order_id=o.id AND p.quote_id=o.accepted_quote_id AND p.state='succeeded'))`;
export class StaffOrderError extends Error { constructor(strMessage,intStatus=400){super(strMessage);this.intStatus=intStatus;} }
export function createStaffOrdersService(objDatabase,objSessionService){
  function parseFilters(objInput={}){
    if(!objInput||typeof objInput!=='object'||Object.keys(objInput).some((strKey)=>!['date','status','page'].includes(strKey)))throw new StaffOrderError('Check the queue filters.');
    const strDate=objInput.date??'';const strStatus=objInput.status??'active';const strPage=objInput.page??'0';
    if(typeof strDate!=='string'||(strDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(strDate)||!Number.isFinite(Date.parse(`${strDate}T12:00:00Z`))||new Date(`${strDate}T12:00:00Z`).toISOString().slice(0,10)!==strDate))
      ||typeof strStatus!=='string'||!['active',...ACTIVE_STATES].includes(strStatus)||typeof strPage!=='string'||!/^\d{1,5}$/.test(strPage))throw new StaffOrderError('Check the date, status and page.');
    return {strDate,strStatus,intPage:Number(strPage)};
  }
  function warnings(strOrderId,strHoldState){
    const arrWarnings=[];
    if(objDatabase.prepare("SELECT id FROM cancellation_requests WHERE order_id=? AND state='pending'").get(strOrderId))arrWarnings.push('Cancellation review pending. Do not begin preparation.');
    for(const objReview of objDatabase.prepare("SELECT DISTINCT trigger_type FROM fulfillment_reviews WHERE order_id=? AND state='open' ORDER BY trigger_type").all(strOrderId))arrWarnings.push({hours_change:'Hours-change review pending.',inventory_change:'Inventory review pending. Do not begin preparation.',late_payment:'Late-payment review pending. Do not begin preparation.'}[objReview.trigger_type]);
    if(strHoldState!=='confirmed')arrWarnings.push('Booking capacity is not confirmed. Staff review is needed.');
    return arrWarnings;
  }
  function summary(objRow,dtNow){
    const arrWarnings=warnings(objRow.id,objRow.hold_state);
    return {strReference:objRow.public_reference,strService:objRow.service_type,strStatus:objRow.fulfillment_status,
      strCustomerName:objRow.redacted_at?'Contact removed':objRow.customer_name??'Contact unavailable',dtReadyAt:objRow.promised_at??null,
      strServiceDate:objRow.service_date??null,bReadyTimePassed:Boolean(objRow.promised_at&&objRow.promised_at<dtNow.toISOString()),
      intPizzaQuantity:objRow.pizza_quantity,intDrinkQuantity:objRow.drink_quantity,arrWarnings};
  }
  const SELECT_SQL=`SELECT o.id,o.public_reference,o.service_type,o.fulfillment_status,c.order_id AS contact_order_id,c.customer_name,c.phone,c.email,c.redacted_at,
    b.promised_at,d.service_date,(SELECT h.state FROM capacity_holds h WHERE h.booking_id=b.id ORDER BY h.created_at DESC LIMIT 1) AS hold_state,
    (SELECT coalesce(sum(l.quantity),0) FROM order_lines l WHERE l.order_id=o.id AND l.item_type='pizza') AS pizza_quantity,
    (SELECT coalesce(sum(l.quantity),0) FROM order_lines l WHERE l.order_id=o.id AND l.item_type='drink') AS drink_quantity
    FROM orders o LEFT JOIN order_contacts c ON c.order_id=o.id LEFT JOIN fulfillment_bookings b ON b.order_id=o.id
    LEFT JOIN service_days d ON d.id=b.service_day_id`;
  function listOrders(strToken,objInput={}){
    return objSessionService.executeAuthorized(strToken,'orders.read',(objIdentity,dtNow)=>{
      const objFilter=parseFilters(objInput);
      const arrRows=objDatabase.prepare(`${SELECT_SQL} WHERE ${PAID_SQL} AND o.fulfillment_status IN ('Received','Preparing','Baking','Ready')
        AND (?='' OR d.service_date=?) AND (?='active' OR o.fulfillment_status=?)
        ORDER BY coalesce(b.promised_at,'9999'),o.id LIMIT ? OFFSET ?`).all(objFilter.strDate,objFilter.strDate,objFilter.strStatus,objFilter.strStatus,PAGE_SIZE+1,objFilter.intPage*PAGE_SIZE);
      return {...objFilter,intPageSize:PAGE_SIZE,bHasNext:arrRows.length>PAGE_SIZE,strToday:chicagoDate(dtNow.toISOString()),dtCheckedAt:dtNow.toISOString(),
        arrOrders:arrRows.slice(0,PAGE_SIZE).map((objRow)=>summary(objRow,dtNow))};
    });
  }
  function readOrder(strToken,strReference){
    return objSessionService.executeAuthorized(strToken,'orders.read',(objIdentity,dtNow)=>{
      if(typeof strReference!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(strReference))throw new StaffOrderError('Order not found.',404);
      const objRow=objDatabase.prepare(`${SELECT_SQL} WHERE o.public_reference=? AND ${PAID_SQL} AND o.fulfillment_status IS NOT NULL`).get(strReference);
      if(!objRow)throw new StaffOrderError('Order not found.',404);
      const arrItems=objDatabase.prepare('SELECT id,item_type,quantity,display_name_snapshot FROM order_lines WHERE order_id=? ORDER BY line_number').all(objRow.id).map((objLine)=>{
        let strDescription=objLine.display_name_snapshot;
        if(objLine.item_type==='pizza'){
          const objPizza=objDatabase.prepare('SELECT size_name_snapshot,crust_name_snapshot FROM pizza_line_details WHERE order_line_id=?').get(objLine.id);
          const arrToppings=objDatabase.prepare('SELECT name_snapshot FROM pizza_line_toppings WHERE order_line_id=? ORDER BY name_snapshot').all(objLine.id).map((objTopping)=>objTopping.name_snapshot);
          strDescription=`${objPizza.size_name_snapshot} pizza · ${objPizza.crust_name_snapshot} · ${arrToppings.join(', ')||'Marinara & cheese'}`;
        }return {intQuantity:objLine.quantity,strDescription};
      });
      return {...summary(objRow,dtNow),dtCheckedAt:dtNow.toISOString(),arrItems,
        objContact:objRow.redacted_at||!objRow.contact_order_id?null:{strName:objRow.customer_name??'',strPhone:objRow.phone??'',strEmail:objRow.phone?'':objRow.email??''}};
    });
  }
  return {listOrders,readOrder};
}
