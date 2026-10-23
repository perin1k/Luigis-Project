import {createOperationalRecorder} from './telemetry.js';
import {types} from 'node:util';
const WORKERS=new Set(['retention','previews']);
/** Fixed-vocabulary transition events: no caller data or exception text is logged. */
export function createWorkerMonitor(strWorker,fnWork,{fnWrite=(strLine)=>console.error(strLine),fnNow=()=>new Date()}={}){
  if(!WORKERS.has(strWorker)||typeof fnWork!=='function'||types.isAsyncFunction(fnWork))throw new TypeError('Known synchronous worker required.');
  let bHealthy=true;const objRecorder=createOperationalRecorder({fnWrite,fnNow});
  function event(strState){objRecorder.record(`${strWorker}_${strState}`);}
  function run(){try{const objResult=fnWork();if(objResult&&typeof objResult.then==='function')throw new TypeError('Worker must be synchronous.');if(!bHealthy)event('recovered');bHealthy=true;return true;}catch{if(bHealthy)event('failed');bHealthy=false;return false;}}
  return {run,isHealthy(){return bHealthy;}};
}
