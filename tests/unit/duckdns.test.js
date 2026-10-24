import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateDuckdns} from '../../scripts/update-duckdns.js';

test('DNS updater uses only the approved HTTPS endpoint and confirms an actual OK response',async()=>{
  let intCalls=0;
  assert.equal(await updateDuckdns('Synthetic-Token-Only','192.0.2.10',async(objUrl,objOptions)=>{
    intCalls++;assert.equal(objUrl.origin,'https://www.duckdns.org');assert.equal(objUrl.pathname,'/update');
    assert.equal(objUrl.searchParams.get('domains'),'luigispizzeria');assert.equal(objOptions.redirect,'error');
    return {ok:true,text:async()=>'OK\n'};
  }),true);assert.equal(intCalls,1);
  for(const objResponse of [{ok:false,text:async()=>'OK'},{ok:true,text:async()=>'KO'}])
    await assert.rejects(updateDuckdns('Synthetic-Token-Only','192.0.2.10',async()=>objResponse),/^Error: Private DNS update failed\.$/);
});
test('DNS updater rejects invalid input and never exposes a token-bearing network exception',async()=>{
  await assert.rejects(updateDuckdns('bad','999.0.0.1',async()=>{throw new Error('must not call');}),/Private DNS update failed/);
  await assert.rejects(updateDuckdns('Synthetic-Token-Only','192.0.2.10',async()=>{throw new Error('Synthetic-Token-Only');}),/^Error: Private DNS update failed\.$/);
});
