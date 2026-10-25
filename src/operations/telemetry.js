/**
 * Sanitized operational measurements and fixed outcome labels. Do not add request
 * bodies, customer details, passwords or private tracking URLs to telemetry.
 */
import {randomUUID} from 'node:crypto';
const EVENTS=new Set(['retention_failed','retention_recovered','previews_failed','previews_recovered','order_request_succeeded','order_request_rejected','order_request_failed','payment_request_succeeded','payment_request_rejected','payment_request_failed','application_failed']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Only fixed events and server-generated IDs/status are accepted; never serialize requests/errors. */
export function createOperationalRecorder({fnWrite=(strLine)=>console.error(strLine),fnNow=()=>new Date()}={}){
  function record(strEvent,strEventId=randomUUID(),intHttpStatus){
    if(!EVENTS.has(strEvent)||!UUID.test(strEventId)||(intHttpStatus!==undefined&&(!Number.isInteger(intHttpStatus)||intHttpStatus<100||intHttpStatus>599)))throw new TypeError('Invalid operational event.');
    const objEvent={strEventId,dtOccurredAt:fnNow().toISOString(),strEvent,strLevel:strEvent.endsWith('_failed')?'error':strEvent.endsWith('_rejected')?'warn':'info'};
    if(intHttpStatus!==undefined)objEvent.intHttpStatus=intHttpStatus;fnWrite(JSON.stringify(objEvent));
  }
  function requests(objRequest,objResponse,fnNext){
    const strFamily=/^\/api\/orders\/?$/i.test(objRequest.path)?'order':/^\/api\/demo-payments\/?$/i.test(objRequest.path)?'payment':null;
    if(strFamily){const strId=randomUUID();objResponse.locals.strOperationalId=strId;objResponse.set('X-Request-Id',strId);objResponse.once('finish',()=>{const intStatus=objResponse.statusCode;record(`${strFamily}_request_${intStatus>=500?'failed':intStatus>=400?'rejected':'succeeded'}`,strId,intStatus);});}
    fnNext();
  }
  return {record,requests};
}
