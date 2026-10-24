import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('DuckDNS helper rejects recorded/non-interactive input without echoing the supplied value',()=>{
  const strMarker='SyntheticTokenMustNotBeSavedOrPrinted';
  const objResult=spawnSync(process.execPath,['scripts/save-duckdns-token.js'],{input:strMarker,encoding:'utf8'});
  assert.equal(objResult.status,1);assert.equal((objResult.stdout+objResult.stderr).includes(strMarker),false);
  assert.match(objResult.stderr,/private terminal/);
});
