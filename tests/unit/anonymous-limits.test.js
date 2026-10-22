import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAnonymousLimits} from '../../src/security/anonymous-limits.js';
function request(fnLimit,{strPath='/api/orders',strPeer='synthetic-peer',objHeaders={}}={}){
  let intStatus=200;let bPassed=false;const objResponse={objHeaders:{},set(objName,strValue){if(typeof objName==='string')this.objHeaders[objName]=strValue;else Object.assign(this.objHeaders,objName);return this;},status(intValue){intStatus=intValue;return this;},json(objValue){this.objBody=objValue;return this;}};
  fnLimit({path:strPath,socket:{remoteAddress:strPeer},headers:objHeaders},objResponse,()=>{bPassed=true;});
  return {intStatus,bPassed,...objResponse};
}
test('checkout limit shares order/payment attempts, ignores forwarded addresses and resets exactly at expiry',()=>{
  let numNow=0;const fnLimit=createAnonymousLimits({fnNow:()=>numNow});
  for(let intIndex=0;intIndex<60;intIndex++)assert.equal(request(fnLimit,{strPath:intIndex%2?'/api/demo-payments':'/api/orders'}).bPassed,true);
  const objBlocked=request(fnLimit,{strPath:'/API/ORDERS',objHeaders:{'x-forwarded-for':'different-peer'}});assert.equal(objBlocked.intStatus,429);assert.equal(objBlocked.objHeaders['Retry-After'],'60');assert.equal(objBlocked.objHeaders['Cache-Control'],'no-store');assert.equal(objBlocked.bPassed,false);
  assert.equal(request(fnLimit,{strPeer:'another-peer'}).bPassed,true);assert.equal(request(fnLimit,{strPath:'/api/tracking'}).bPassed,true);
  numNow=59999;assert.equal(request(fnLimit).objHeaders['Retry-After'],'1');numNow=60000;assert.equal(request(fnLimit).bPassed,true);
});
test('tracking and preview budgets are independent; public pages and staff authentication are unaffected',()=>{
  const fnLimit=createAnonymousLimits({fnNow:()=>0});
  for(let intIndex=0;intIndex<120;intIndex++)assert.equal(request(fnLimit,{strPath:'/api/tracking/cancellation'}).bPassed,true);
  assert.equal(request(fnLimit,{strPath:'/api/tracking'}).intStatus,429);
  assert.equal(request(fnLimit,{strPath:'/api/pricing/preview'}).bPassed,true);
  for(const strPath of ['/order','/track','/api/auth/login','/api/staff/orders','/api/orders-other'])assert.equal(request(fnLimit,{strPath}).bPassed,true);
});
test('bucket saturation fails closed without eviction that could reset an attacker budget; expired entries free capacity',()=>{
  let numNow=0;const fnLimit=createAnonymousLimits({fnNow:()=>numNow,intMaxBuckets:1});assert.equal(request(fnLimit).bPassed,true);
  assert.equal(request(fnLimit,{strPeer:'other-peer'}).intStatus,429);assert.equal(request(fnLimit).bPassed,true);
  numNow=60000;assert.equal(request(fnLimit,{strPeer:'other-peer'}).bPassed,true);
});
