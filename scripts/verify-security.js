/**
 * Runs the selected security/privacy regression files with explicit paths and bounded
 * concurrency. A passing suite is scoped evidence, not legal or exhaustive security
 * certification.
 */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {release} from 'node:os';
console.log(JSON.stringify({strPlatform:process.platform,strArchitecture:process.arch,strOsRelease:release(),strNodeVersion:process.version}));
const arrNames=['privacy-service','privacy-migration','security-privacy-http','database','order-storage','access-storage','retention-service',
  'auth-router','staff-orders-http','menu-http','anonymous-limits','http-hosting','operations','demo-payment-http','payment-retry','secret-patterns'];
const objResult=spawnSync(process.execPath,['--test','--test-concurrency=1',...arrNames.map(strName=>fileURLToPath(new URL(`../tests/unit/${strName}.test.js`,import.meta.url)))],
  {cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
if(objResult.error)console.error('Security verification could not start.');
process.exitCode=objResult.status??1;
