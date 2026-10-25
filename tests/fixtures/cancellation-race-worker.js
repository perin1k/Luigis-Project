import {parentPort,workerData} from 'node:worker_threads';
import {openDatabase} from '../../src/data/database.js';
import {createSessionService} from '../../src/auth/session-service.js';
import {createOrderProgressService} from '../../src/staff/order-progress-service.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
if(!parentPort||workerData?.strFixture!=='qa03-cancellation-race')throw new Error('Disposable worker fixture required.');
const objDatabase=openDatabase(workerData.strPath);
try{
  const fnNow=()=>new Date('2026-10-21T15:00:00.000Z');
  const objSessions=createSessionService(objDatabase,{fnNow});
  parentPort.postMessage({strState:'ready'});
  Atomics.wait(new Int32Array(workerData.objBarrier),0,0,10000);
  if(Atomics.load(new Int32Array(workerData.objBarrier),0)!==1)throw new Error('Fixture barrier timed out.');
  try{
    if(workerData.strAction==='cancel'){
      const objResult=createTrackingService(objDatabase,objSessions,{fnNow}).requestCancellation(workerData.strGuestToken);
      if(objResult?.strState!=='pending')throw new Error('Fixture cancellation was not authorized.');
    }else{
      const objResult=createOrderProgressService(objDatabase,objSessions).advanceOrder(workerData.strStaffToken,workerData.strReference,{intRevision:workerData.intRevision,strStatus:'Preparing'});
      if(objResult?.strStatus!=='Preparing')throw new Error('Fixture preparation was not authorized.');
    }
    parentPort.postMessage({strState:'committed'});
  }catch(objError){
    if(objError.intStatus!==409)throw objError;
    parentPort.postMessage({strState:'conflict'});
  }
}finally{objDatabase.close();}
