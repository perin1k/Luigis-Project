/** Reproducible, disposable HTTP load. Never accepts a hosted origin/database path. */
import assert from 'node:assert/strict';
import {createServer,request,Agent} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {createOrdersFixture} from '../fixtures/staff-orders-app.js';

const strJournal=process.argv[2]??'delete';
const intCustomers=Number(process.argv[3]??20),intRounds=Number(process.argv[4]??3);
assert.ok(['delete','wal'].includes(strJournal));
assert.ok([20,50,100].includes(intCustomers));assert.ok([1,3].includes(intRounds));
assert.ok(intCustomers*intRounds<=150,'Keep the isolated service day within its real kitchen capacity.');
assert.ok(process.argv.length<=5);
const strDirectory=mkdtempSync(join(tmpdir(),'luigis-concurrency-'));
assert.equal(dirname(resolve(strDirectory)),resolve(tmpdir()));
const objAgent=new Agent({keepAlive:true,maxSockets:64});
let objServer,objFixture;
const objLag=monitorEventLoopDelay({resolution:10});
const arrSamples=[];let intUnexpected=0;
try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(strDirectory,'key.pem'),'-out',join(strDirectory,'cert.pem'),'-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
  const numClock=Date.parse('2026-10-21T18:00:30.000Z');let numStarted=Date.now();
  objServer=createServer({key:readFileSync(join(strDirectory,'key.pem')),cert:readFileSync(join(strDirectory,'cert.pem'))},(objRequest,objResponse)=>{
    objFixture.advanceTo(new Date(numClock+Date.now()-numStarted).toISOString());
    objFixture.objApp(objRequest,objResponse);
  });
  await new Promise(fnDone=>objServer.listen(0,'127.0.0.1',fnDone));
  const intPort=objServer.address().port,strOrigin=`https://localhost:${intPort}`;
  objFixture=createOrdersFixture(strOrigin,{bCustomerCheckout:true,strDatabasePath:join(strDirectory,'load.sqlite')});numStarted=Date.now();
  const objDb=objFixture.objDatabase;
  assert.equal(objDb.prepare(`PRAGMA journal_mode=${strJournal}`).get().journal_mode,strJournal);
  objDb.exec('PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000');
  const arrInitialPromises=objDb.prepare('SELECT promised_at FROM fulfillment_bookings').all().map(obj=>obj.promised_at);
  const arrTokens=Array.from({length:4},(_,intIndex)=>{
    const strToken=randomBytes(32).toString('hex');
    objDb.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,expires_at) VALUES (?,?,?,?,?,?)').run(`load-${intIndex}`,'employee',createHash('sha256').update(strToken).digest('hex'),new Date(numClock).toISOString(),new Date(numClock).toISOString(),new Date(numClock+8*3600000).toISOString());
    return strToken;
  });
  async function call(strKind,strPath,objBody,arrExpected=[200],strToken,strPeer='127.0.0.1'){
    const numStart=performance.now();
    const objResult=await new Promise((fnDone,fnReject)=>{
      const objRequest=request({hostname:'127.0.0.1',localAddress:strPeer,port:intPort,path:strPath,method:objBody?'POST':'GET',agent:objAgent,rejectUnauthorized:false,
        headers:{Host:`localhost:${intPort}`,Origin:strOrigin,...(objBody?{'Content-Type':'application/json'}:{}),...(strToken?{Cookie:`__Host-luigis-session=${strToken}`}:{})}},objResponse=>{
        let strText='';objResponse.setEncoding('utf8');objResponse.on('data',str=>{strText+=str;});objResponse.on('end',()=>{try{fnDone({intStatus:objResponse.statusCode,objBody:JSON.parse(strText)});}catch{fnReject(new Error('Expected a JSON application response.'));}});
      });
      objRequest.setTimeout(15000,()=>objRequest.destroy(new Error('Bounded load request timed out.')));objRequest.on('error',fnReject);objRequest.end(objBody?JSON.stringify(objBody):undefined);
    });
    arrSamples.push({strKind,intStatus:objResult.intStatus,numMilliseconds:performance.now()-numStart});
    if(!arrExpected.includes(objResult.intStatus)){intUnexpected++;throw new Error(`Unexpected ${strKind} response ${objResult.intStatus}`);}
    return objResult;
  }
  const objMenu=(await call('catalog','/api/pricing/catalog')).objBody;
  const objPricing={strCatalogFingerprint:objMenu.strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:0};
  function draft(objPickup,intIndex,intQuantity=1){return {strRequestId:randomUUID(),strService:'carry-out',objContact:{strName:`Concurrency sample ${intIndex}`,strPhone:'2025550100',strEmail:'load@example.invalid'},objPricing:{...objPricing,arrPizzas:[{...objPricing.arrPizzas[0],intQuantity}]},objPickup};}
  const intBefore=objDb.prepare('SELECT count(*) AS n FROM orders').get().n;
  await new Promise(fnDone=>setTimeout(fnDone,25));objLag.enable();const numLoadStart=performance.now();
  for(let intRound=0;intRound<intRounds;intRound++){
    // Leave the final service slot unused for a separate last-place race, even
    // when a larger load distributes customers across every other offered slot.
    const arrSlots=(await call('schedule','/api/pickup-times?pizzas=1')).objBody.arrOptions.filter(obj=>obj.strSelectionType==='scheduled'&&!arrInitialPromises.includes(obj.dtPromisedAt)).slice(0,-1);
    assert.ok(arrSlots.length>=20);
    const arrDrafts=Array.from({length:intCustomers},(_,intIndex)=>draft(arrSlots[intIndex%arrSlots.length],intRound*intCustomers+intIndex));
    // Real duplicate writes and public/staff reads overlap; expected retries stay
    // in the timing denominator. No database write or kitchen rule is bypassed.
    await Promise.all([
      ...arrDrafts.map(async(objDraft,intIndex)=>{
        // Real loopback source addresses model distinct customers without spoofing
        // forwarded headers or bypassing the application's rate limiter.
        const strPeer=`127.0.0.${intIndex+2}`;
        const arrSaved=await Promise.all([call('order','/api/orders',objDraft,[200,201],undefined,strPeer),call('order-retry','/api/orders',objDraft,[200,201],undefined,strPeer)]);
        assert.equal(arrSaved.filter(obj=>obj.intStatus===201).length,1);
        const strRequestId=randomUUID();
        const arrPaid=await Promise.all([call('payment','/api/demo-payments',{strOrderId:objDraft.strRequestId,strRequestId,strMethod:'card'},[200,201],undefined,strPeer),call('payment-retry','/api/demo-payments',{strOrderId:objDraft.strRequestId,strRequestId,strMethod:'card'},[200,201],undefined,strPeer)]);
        assert.equal(arrPaid.filter(obj=>obj.intStatus===201).length,1);
      }),
      ...Array.from({length:intCustomers},async(_,intIndex)=>{for(let intRead=0;intRead<3;intRead++)await call('catalog','/api/pricing/catalog',undefined,[200],undefined,`127.0.0.${intIndex+2}`);}),
      ...arrTokens.map(async strToken=>{for(let intRead=0;intRead<5;intRead++)await call('staff','/api/staff/orders',undefined,[200],strToken);})
    ]);
  }
  const numLoadMilliseconds=performance.now()-numLoadStart;
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM orders').get().n-intBefore,intCustomers*intRounds);
  const intPaid=objDb.prepare("SELECT count(*) AS n FROM demo_payment_attempts WHERE state='succeeded'").get().n;
  assert.equal(intPaid,intBefore+intCustomers*intRounds);
  // Reserve five of six places, then let two customers race for the last place.
  const setOccupied=new Set(objDb.prepare('SELECT promised_at FROM fulfillment_bookings').all().map(obj=>obj.promised_at));
  const objLastSlot=(await call('schedule','/api/pickup-times?pizzas=5')).objBody.arrOptions.find(obj=>obj.strSelectionType==='scheduled'&&!setOccupied.has(obj.dtPromisedAt));assert.ok(objLastSlot);
  await call('capacity-setup','/api/orders',draft(objLastSlot,9000,5),[201]);
  const arrRace=await Promise.all([call('capacity-race','/api/orders',draft(objLastSlot,9001),[201,409]),call('capacity-race','/api/orders',draft(objLastSlot,9002),[201,409])]);
  assert.deepEqual(arrRace.map(obj=>obj.intStatus).sort(),[201,409]);
  assert.equal(objDb.prepare("SELECT sum(h.reserved_units) AS n FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id WHERE b.promised_at=? AND h.state IN ('active','confirmed')").get(objLastSlot.dtPromisedAt).n,6);
  await new Promise(fnDone=>setTimeout(fnDone,25));objLag.disable();
  assert.deepEqual(objDb.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(objDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const summarize=strKind=>{const arr=arrSamples.filter(obj=>obj.strKind===strKind).map(obj=>obj.numMilliseconds).sort((a,b)=>a-b);return {intCount:arr.length,numP95Milliseconds:arr[Math.ceil(arr.length*0.95)-1]??null};};
  const arrPlans=[['holds-by-booking',"SELECT id FROM capacity_holds WHERE booking_id=? AND state='confirmed'"],['reviews-by-order',"SELECT id FROM fulfillment_reviews WHERE order_id=? AND state='open'"],['allocations-by-payment','SELECT component,signed_cents FROM demo_financial_allocations WHERE payment_id=?']].map(([strQuery,strSql])=>({strQuery,arrPlan:objDb.prepare('EXPLAIN QUERY PLAN '+strSql).all('sample').map(obj=>obj.detail)}));
  console.log(JSON.stringify({bPassed:true,strNode:process.version,strSQLite:objDb.prepare('SELECT sqlite_version() AS v').get().v,strJournal,intCustomers,intRounds,intStaff:4,intUnexpected,numLoadMilliseconds,numEventLoopP95Milliseconds:objLag.percentile(95)/1e6,numEventLoopMaxMilliseconds:objLag.max/1e6,objMeasurements:Object.fromEntries(['catalog','staff','order','order-retry','payment','payment-retry','capacity-race'].map(str=>[str,summarize(str)])),bNoDuplicates:true,bCapacityRaceSafe:true,bIntegrity:true,arrPlans}));
}catch(objError){console.error(JSON.stringify({bPassed:false,intUnexpected,strFailure:/^Unexpected [a-z-]+ response \d+$/.test(objError.message)?objError.message:'Isolated concurrency assertion failed; no live data was accessed.'}));process.exitCode=1;}
finally{objLag.disable();objAgent.destroy();if(objServer)await new Promise(fnDone=>objServer.close(fnDone));objFixture?.close();rmSync(strDirectory,{recursive:true,force:true});}
