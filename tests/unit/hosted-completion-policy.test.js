import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMeasurements} from '../../scripts/hosted-completion-policy.js';
test('p95 uses nearest rank and includes failures and slow observations',()=>{
  const arrSamples=Array.from({length:20},(_,intIndex)=>({numMilliseconds:intIndex+1,intStatus:200}));
  arrSamples[18]={numMilliseconds:3000,intStatus:503};
  assert.deepEqual(summarizeMeasurements(arrSamples),{intCount:20,numP95Milliseconds:20,intUnexpectedResponses:1});
  assert.equal(summarizeMeasurements([{numMilliseconds:5000,intStatus:500}]).numP95Milliseconds,5000);
  for(const objBad of [[],null,[{numMilliseconds:NaN,intStatus:200}],[{numMilliseconds:-1,intStatus:200}]])assert.throws(()=>summarizeMeasurements(objBad));
});
