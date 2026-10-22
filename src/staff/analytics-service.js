import {chicagoDate} from '../ordering/scheduling-service.js';
import {StaffOrderError} from './orders-service.js';
const objHourFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'});
function validDate(strValue){return typeof strValue==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(strValue)&&Number.isFinite(Date.parse(strValue))&&new Date(strValue).toISOString().slice(0,10)===strValue;}
function safeCents(numValue){if(!Number.isSafeInteger(numValue))throw new StaffOrderError('Report total exceeds supported precision.',422);return numValue;}
function halfUpAverage(centsTotal,intCount){const numTotal=BigInt(centsTotal),numCount=BigInt(intCount);return Number((numTotal*2n+numCount)/(numCount*2n));}
export function createAnalyticsService(objDatabase,objSessions){
  function read(strToken,objInput){return objSessions.executeAuthorized(strToken,'analytics.read',()=>{
    if(!objInput||Object.keys(objInput).length!==2||!validDate(objInput.from)||!validDate(objInput.to)||objInput.from>objInput.to||Date.parse(objInput.to)-Date.parse(objInput.from)>365*86400000)throw new StaffOrderError('Choose a valid date range of at most 366 days.',400);
    const fnInPeriod=(dtValue)=>Boolean(dtValue&&chicagoDate(dtValue)>=objInput.from&&chicagoDate(dtValue)<=objInput.to);
    // Current application adapter only. Never invent provider records or processing costs.
    const arrPayments=objDatabase.prepare("SELECT p.id,p.order_id,p.paid_at,o.fulfillment_status,o.received_at,o.ready_at,q.item_subtotal_cents,b.promised_at FROM demo_payment_attempts p JOIN orders o ON o.id=p.order_id JOIN order_quotes q ON q.id=p.quote_id LEFT JOIN fulfillment_bookings b ON b.order_id=o.id WHERE p.state='succeeded'").all();
    const arrAllocations=objDatabase.prepare('SELECT a.*,p.order_id FROM demo_financial_allocations a JOIN demo_payment_attempts p ON p.id=a.payment_id').all();
    const objPeriod={centsItems:0,centsTax:0,centsTips:0,centsRefunds:0,centsNetRecorded:0,centsProcessorCosts:0,centsRetainedCancellationRecovery:0};
    for(const objRow of arrAllocations)if(fnInPeriod(objRow.effective_at)){
      const strField={item:'centsItems',tax:'centsTax',tip:'centsTips'}[objRow.component];objPeriod[strField]=safeCents(objPeriod[strField]+objRow.signed_cents);objPeriod.centsNetRecorded=safeCents(objPeriod.centsNetRecorded+objRow.signed_cents);if(objRow.refund_id)objPeriod.centsRefunds=safeCents(objPeriod.centsRefunds-objRow.signed_cents);
    }
    const arrCohort=arrPayments.filter((objRow)=>fnInPeriod(objRow.paid_at)&&objRow.fulfillment_status!=='Cancelled');
    const setCohort=new Set(arrCohort.map((objRow)=>objRow.id));let centsCohortItems=0;
    for(const objRow of arrAllocations)if(setCohort.has(objRow.payment_id)&&objRow.component==='item')centsCohortItems=safeCents(centsCohortItems+objRow.signed_cents);
    const mapItems=new Map();
    for(const objPayment of arrPayments){
      const bPurchased=fnInPeriod(objPayment.paid_at);const bRefunded=Boolean(objDatabase.prepare("SELECT confirmed_at FROM demo_refund_attempts WHERE payment_id=? AND state='succeeded'").all(objPayment.id).find((objRefund)=>fnInPeriod(objRefund.confirmed_at)));if(!bPurchased&&!bRefunded)continue;
      for(const objLine of objDatabase.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY line_number').all(objPayment.order_id)){
        let strLabel=objLine.display_name_snapshot;
        if(objLine.item_type==='pizza'){const objPizza=objDatabase.prepare('SELECT size_name_snapshot,crust_name_snapshot FROM pizza_line_details WHERE order_line_id=?').get(objLine.id);const arrToppings=objDatabase.prepare('SELECT name_snapshot FROM pizza_line_toppings WHERE order_line_id=? ORDER BY name_snapshot').all(objLine.id).map((objTopping)=>objTopping.name_snapshot);strLabel=`${objPizza.size_name_snapshot} pizza · ${objPizza.crust_name_snapshot} · ${arrToppings.join(', ')||'Marinara & cheese'}`;}
        else {const objDrink=objDatabase.prepare('SELECT size_name_snapshot,beverage_name_snapshot FROM drink_line_details WHERE order_line_id=?').get(objLine.id);strLabel=`${objDrink.size_name_snapshot} ${objDrink.beverage_name_snapshot}`;}
        const strKey=JSON.stringify([objLine.item_type,strLabel]);const objItem=mapItems.get(strKey)??{strType:objLine.item_type,strLabel,intPurchased:0,intRefunded:0,intNet:0};if(bPurchased)objItem.intPurchased=safeCents(objItem.intPurchased+objLine.quantity);if(bRefunded)objItem.intRefunded=safeCents(objItem.intRefunded+objLine.quantity);objItem.intNet=objItem.intPurchased-objItem.intRefunded;mapItems.set(strKey,objItem);
      }
    }
    const arrPickup=arrPayments.filter((objRow)=>fnInPeriod(objRow.promised_at));const mapHours=new Map();let intReadyCoverage=0,intOnTime=0,numElapsedMinutes=0,intElapsedCoverage=0;
    for(const objRow of arrPickup){
      const intHour=Number(objHourFormat.format(new Date(objRow.promised_at)));const objHour=mapHours.get(intHour)??{intHour,intOrders:0,intCancelled:0,intNotCollected:0};objHour.intOrders++;if(objRow.fulfillment_status==='Cancelled')objHour.intCancelled++;if(objRow.fulfillment_status==='Not collected')objHour.intNotCollected++;mapHours.set(intHour,objHour);
      if(objRow.fulfillment_status==='Cancelled')continue;
      if(objRow.ready_at){intReadyCoverage++;if(objRow.ready_at<=objRow.promised_at)intOnTime++;}
      if(objRow.ready_at&&objRow.received_at&&objRow.ready_at>=objRow.received_at){intElapsedCoverage++;numElapsedMinutes+=(Date.parse(objRow.ready_at)-Date.parse(objRow.received_at))/60000;}
    }
    return {arrBestSellers:[...mapItems.values()].sort((objLeft,objRight)=>objRight.intNet-objLeft.intNet||objLeft.strLabel.localeCompare(objRight.strLabel)),strAdapter:'luigis-demo-v1',strTimeZone:'America/Chicago',strFrom:objInput.from,strTo:objInput.to,objPeriod,
      objPaymentCohort:{intEligibleOrders:arrCohort.length,centsNetItems:centsCohortItems,centsAverageItems:arrCohort.length?halfUpAverage(centsCohortItems,arrCohort.length):null},
      objPickup:{intOrders:arrPickup.length,intReadyEligibleOrders:arrPickup.filter((objRow)=>objRow.fulfillment_status!=='Cancelled').length,intMissingReadyTimes:arrPickup.filter((objRow)=>objRow.fulfillment_status!=='Cancelled'&&!objRow.ready_at).length,intMissingPickupTimes:arrPayments.filter((objRow)=>fnInPeriod(objRow.paid_at)&&!objRow.promised_at).length,intReadyCoverage,intOnTime,intElapsedCoverage,numAverageElapsedMinutes:intElapsedCoverage?numElapsedMinutes/intElapsedCoverage:null,arrHours:[...mapHours.values()].sort((objLeft,objRight)=>objLeft.intHour-objRight.intHour)},
      intCancelledAwaitingRefund:arrPayments.filter((objRow)=>objRow.fulfillment_status==='Cancelled'&&fnInPeriod(objRow.paid_at)&&!objDatabase.prepare("SELECT id FROM demo_refund_attempts WHERE payment_id=? AND state='succeeded'").get(objRow.id)).length};
  });}
  return {read};
}
