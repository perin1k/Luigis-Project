import {createHmac,randomBytes} from 'node:crypto';
import {clientAddress} from './proxy-boundary.js';

const WINDOW_MS=60000;
const MAX_BUCKETS=10000;
/** Raw peers or authenticated proxy identity, never arbitrary forwarded headers. */
export function createAnonymousLimits({fnNow=Date.now,intMaxBuckets=MAX_BUCKETS}={}){
  const objKey=randomBytes(32);const mapBuckets=new Map();
  return function limitAnonymous(objRequest,objResponse,fnNext){
    const strPath=objRequest.path;
    const strGroup=/^\/health\/(live|ready|previews)\/?$/i.test(strPath)?'health'
      :/^\/api\/(orders|demo-payments)(\/|$)/i.test(strPath)?'checkout'
      :/^\/api\/tracking(\/|$)/i.test(strPath)?'tracking'
      :/^\/api\/(pricing|pickup-times)(\/|$)/i.test(strPath)?'preview':null;
    if(!strGroup)return fnNext();
    objResponse.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'});
    const numNow=fnNow();
    // Bounded memory even if many peers arrive; expired entries are not durable identifiers.
    for(const [strKey,objBucket] of mapBuckets)if(objBucket.numExpires<=numNow)mapBuckets.delete(strKey);
    const strPeer=clientAddress(objRequest);
    const strKey=createHmac('sha256',objKey).update(`${strGroup}\0${strPeer}`).digest('hex');
    let objBucket=mapBuckets.get(strKey);
    function reject(intSeconds){return objResponse.status(429).set('Retry-After',String(intSeconds)).json({strCode:'request_limit',strMessage:'Too many requests. Wait a minute, then retry with your current selections.'});}
    if(!objBucket){
      if(mapBuckets.size>=intMaxBuckets)return reject(60);
      objBucket={intCount:0,numExpires:numNow+WINDOW_MS};mapBuckets.set(strKey,objBucket);
    }
    const intLimit=strGroup==='checkout'?60:120;
    if(objBucket.intCount>=intLimit)return reject(Math.max(1,Math.ceil((objBucket.numExpires-numNow)/1000)));
    objBucket.intCount++;return fnNext();
  };
}
