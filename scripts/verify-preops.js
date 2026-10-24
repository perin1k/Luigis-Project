import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {release} from 'node:os';

console.log(JSON.stringify({strPlatform:process.platform,strArchitecture:process.arch,
  strOsRelease:release(),strNodeVersion:process.version}));
// Union of the existing QA-02/03 sets and John's changed payment retry contract.
// Explicit filenames keep Windows/macOS/Linux invocation identical.
const arrNames=['payment-privacy-acceptance','demo-payment','demo-payment-http',
  'payment-config','demo-refund-service','retention-service','cancellation-concurrency',
  'scheduling-concurrency','demo-payment-concurrency','disposable-recreation',
  'operations','notification-runtime','payment-retry'];
const objResult=spawnSync(process.execPath,['--test','--test-concurrency=1',
  ...arrNames.map(strName=>fileURLToPath(new URL(`../tests/unit/${strName}.test.js`,import.meta.url)))],
  {cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
if(objResult.error)console.error('Pre-OPS verification could not start.');
process.exitCode=objResult.status??1;
