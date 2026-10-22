import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openSecureCheckout} from '../../src/public/js/checkout/payment.js';

test('payment throttling preserves recovery identity semantics while confirmed declines require review',async()=>{
  const fnFetch=globalThis.fetch;const objInput={strOrderId:'synthetic-order',strRequestId:'synthetic-request',strMethod:'card'};
  try{
    for(const intStatus of [429,402]){
      globalThis.fetch=async(strPath,objOptions)=>{
        assert.equal(strPath,'/api/demo-payments');assert.deepEqual(JSON.parse(objOptions.body),objInput);
        return new Response(JSON.stringify({strMessage:'Synthetic response'}),{status:intStatus,headers:{'Content-Type':'application/json'}});
      };
      await assert.rejects(openSecureCheckout(objInput),(objError)=>{
        assert.equal(objError.bKnownResponse,intStatus!==429);assert.equal(objError.bNeedsReview,intStatus===402);return true;
      });
    }
  }finally{globalThis.fetch=fnFetch;}
});
