import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSecureCheckout} from '../../src/public/js/checkout/payment.js';

test('payment timeouts, throttling and server errors preserve recovery identity while definitive rejections remain known',async()=>{
  const fnFetch=globalThis.fetch;const objInput={strOrderId:'synthetic-order',strRequestId:'synthetic-request',strMethod:'card'};
  try{
    for(const intStatus of [408,429,500,503,402,404,409,422]){
      globalThis.fetch=async(strPath,objOptions)=>{
        assert.equal(strPath,'/api/demo-payments');assert.deepEqual(JSON.parse(objOptions.body),objInput);
        return new Response(JSON.stringify({strMessage:'Synthetic response'}),{status:intStatus,headers:{'Content-Type':'application/json'}});
      };
      await assert.rejects(openSecureCheckout(objInput),(objError)=>{
        const bUncertain=[408,429,500,503].includes(intStatus);
        assert.equal(objError.bKnownResponse,!bUncertain);assert.equal(objError.bNeedsReview,[402,404,409].includes(intStatus));
        if(bUncertain)assert.match(objError.message,/Keep this page open/);
        return true;
      });
    }
  }finally{globalThis.fetch=fnFetch;}
});
