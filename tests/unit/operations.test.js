import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../../src/app.js';
import {createWorkerMonitor} from '../../src/operations/worker-monitor.js';
test('worker monitoring logs one redacted failure transition and one recovery without flooding retries',()=>{
  const arrLines=[];let bFail=true;const objMonitor=createWorkerMonitor('retention',()=>{if(bFail)throw new Error('PRIVATE fixture contact/token/key');},{fnWrite:(strLine)=>arrLines.push(strLine),fnNow:()=>new Date('2026-10-22T15:00:00.000Z')});
  assert.equal(objMonitor.run(),false);assert.equal(objMonitor.isHealthy(),false);assert.equal(objMonitor.run(),false);assert.equal(arrLines.length,1);bFail=false;assert.equal(objMonitor.run(),true);assert.equal(objMonitor.isHealthy(),true);assert.equal(objMonitor.run(),true);assert.equal(arrLines.length,2);
  const arrEvents=arrLines.map(JSON.parse);assert.deepEqual(arrEvents.map((objRow)=>objRow.strEvent),['retention_failed','retention_recovered']);assert.equal(new Set(arrEvents.map((objRow)=>objRow.strEventId)).size,2);assert.doesNotMatch(arrLines.join(''),/PRIVATE|contact|token|key/);assert.deepEqual(Object.keys(arrEvents[0]).sort(),['dtOccurredAt','strEvent','strEventId','strLevel']);
  assert.throws(()=>createWorkerMonitor('arbitrary-secret',()=>{}),/Known/);assert.throws(()=>createWorkerMonitor('previews',async()=>{}),/Known/);
});
test('public health probes separate liveness/readiness, fail closed and never disclose diagnostic details',async()=>{
  let strState='missing';const objServer=createServer(createApp({fnReadiness:()=>{if(strState==='error')throw new Error('PRIVATE database path/key');return strState==='ready';}}));await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));const strOrigin=`http://127.0.0.1:${objServer.address().port}`;
  try{
    for(const strNext of ['missing','ready','error','ready']){strState=strNext;const objResponse=await fetch(`${strOrigin}/health/ready`);assert.equal(objResponse.status,strNext==='ready'?200:503);assert.equal(objResponse.headers.get('cache-control'),'no-store');assert.equal(objResponse.headers.get('x-robots-tag'),'noindex');const objBody=await objResponse.json();assert.deepEqual(objBody,{strStatus:strNext==='ready'?'ready':'not_ready'});assert.equal((await fetch(`${strOrigin}/health/live`)).status,200);}
    const objHead=await fetch(`${strOrigin}/health/ready`,{method:'HEAD'});assert.equal(objHead.status,200);assert.equal(await objHead.text(),'');assert.equal((await fetch(`${strOrigin}/health/ready`,{method:'POST'})).status,404);
  }finally{await new Promise((fnResolve)=>objServer.close(fnResolve));}
});

test('preview health reports only a private-data-free boolean outcome independent of overall readiness',async()=>{
  let bHealthy=true;const objServer=createServer(createApp({fnReadiness:()=>false,fnPreviewReadiness:()=>{if(!bHealthy)throw new Error('PRIVATE preview detail');return true;}}));
  await new Promise(fnResolve=>objServer.listen(0,'127.0.0.1',fnResolve));
  try{
    const strOrigin=`http://127.0.0.1:${objServer.address().port}`;
    for(const bNext of [true,false,true]){bHealthy=bNext;const objResponse=await fetch(strOrigin+'/health/previews');
      assert.equal(objResponse.status,bNext?200:503);assert.equal(objResponse.headers.get('cache-control'),'no-store');
      assert.deepEqual(await objResponse.json(),{strStatus:bNext?'ready':'not_ready'});}
    assert.equal((await fetch(strOrigin+'/health/ready')).status,503);
  }finally{await new Promise(fnResolve=>objServer.close(fnResolve));}
});
test('request telemetry correlates safe outcomes and page errors without accepting spoofed IDs or private payloads',async()=>{
  const arrLines=[];let bFail=true;const objApp=createApp({fnWriteOperational:(strLine)=>arrLines.push(strLine),objOrderService:{submitOrder(){if(bFail)throw new Error('PRIVATE contact/token/key');return {strState:'unpaid',bReplayed:false};}}});objApp.locals.fnGetAvailability=async()=>{throw new Error('PRIVATE stack/path');};
  const objServer=createServer(objApp);await new Promise((fnResolve)=>objServer.listen(0,'127.0.0.1',fnResolve));const strOrigin=`http://127.0.0.1:${objServer.address().port}`;
  try{
    for(const bNext of [true,false]){bFail=bNext;const objResponse=await fetch(`${strOrigin}/api/orders?contact=PRIVATE`,{method:'POST',headers:{Origin:strOrigin,'Content-Type':'application/json','X-Request-Id':'PRIVATE-spoof'},body:JSON.stringify({strPrivate:'PRIVATE'})});assert.equal(objResponse.status,bNext?503:201);const strId=objResponse.headers.get('x-request-id');assert.match(strId,/^[0-9a-f-]{36}$/);assert.notEqual(strId,'PRIVATE-spoof');await objResponse.text();assert.equal(JSON.parse(arrLines.at(-1)).strEventId,strId);}
    const objFailed=await fetch(`${strOrigin}/order`);assert.equal(objFailed.status,500);await objFailed.text();assert.equal(JSON.parse(arrLines.at(-1)).strEvent,'application_failed');assert.equal(JSON.parse(arrLines.at(-1)).strEventId,objFailed.headers.get('x-request-id'));
    assert.deepEqual(arrLines.map((strLine)=>JSON.parse(strLine).strEvent),['order_request_failed','order_request_succeeded','application_failed']);assert.doesNotMatch(arrLines.join(''),/PRIVATE|contact|token|key|stack|path/);
  }finally{await new Promise((fnResolve)=>objServer.close(fnResolve));}
});
