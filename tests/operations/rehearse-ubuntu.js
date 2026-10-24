// Disposable CI host only. Never run this against a developer or hosted machine.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,writeFileSync,readFileSync,chmodSync,chownSync,symlinkSync,renameSync,
  existsSync,unlinkSync,mkdtempSync,rmSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {request} from 'node:https';
import {DatabaseSync} from 'node:sqlite';

if(process.platform!=='linux'||process.getuid()!==0||process.env.GITHUB_ACTIONS!=='true'||
  process.env.LUIGIS_OPS_REHEARSAL!=='disposable-runner'||!process.env.GITHUB_SHA)
  throw new Error('Only an explicitly opted-in disposable Linux Actions runner is permitted.');
const strWorkspace=process.cwd();const strRoot='/opt/luigis';const strData='/var/lib/luigis-data';
const strConfig='/etc/luigis';const strUnit='/etc/systemd/system/luigis.service';
for(const strPath of [strRoot,strData,strConfig,strUnit])if(existsSync(strPath))throw new Error('Refusing an existing installation.');
const strScratch=mkdtempSync(join(tmpdir(),'luigis-ops-'));let bMounted=false;let bUser=false;
const objOptBefore=lstatSync('/opt');
let strStage='isolated host preparation';
const strDatabase=join(strData,'luigis-demo.sqlite');const strNode=join(strRoot,'runtime/bin/node');
function run(strCommand,arrArgs,objOptions={}){
  try{return execFileSync(strCommand,arrArgs,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...objOptions});}
  catch(objError){if(strCommand==='systemctl')console.error(String(objError.stderr??''));throw objError;}
}
function node(arrArgs,objOptions={}){return run(strNode,arrArgs,objOptions);}
function asService(arrArgs,objOptions={}){
  return run('runuser',['-u','luigis','--',strNode,...arrArgs],{...objOptions,
    env:{PATH:process.env.PATH,DATABASE_PATH:strDatabase,NODE_ENV:'production'}});
}
// systemctl is-active exits nonzero for inactive units, so use its bounded result.
function stopped(){const objResult=spawnSync('systemctl',['is-active','luigis.service'],{encoding:'utf8'});
  assert.ok(['inactive','failed'].includes(objResult.stdout.trim()));}
function switchStopped(strRelease){stopped();symlinkSync(strRelease,join(strRoot,'next'));
  renameSync(join(strRoot,'next'),join(strRoot,'current'));}
function protect(strDirectory){run('chown',['-R','root:root',strDirectory]);run('chmod',['-R','go-w',strDirectory]);}
function check(strRelease,strMode){return asService([join(strRelease,'scripts/release.js'),'check',strRelease,strMode]);}
async function get(strPath){return new Promise((fnResolve,fnReject)=>{
  const objRequest=request({hostname:'127.0.0.1',port:443,servername:'localhost',path:strPath,
    headers:{Host:'localhost'},ca:readFileSync(join(strConfig,'tls/fullchain.pem'))},objResponse=>{
    let strBody='';objResponse.on('data',objChunk=>{strBody+=objChunk;});
    objResponse.on('end',()=>fnResolve({intStatus:objResponse.statusCode,objHeaders:objResponse.headers,strBody}));
  });objRequest.on('error',fnReject);objRequest.setTimeout(3000,()=>objRequest.destroy(new Error('Probe timeout')));objRequest.end();
});}
async function start(){
  const objReset=spawnSync('systemctl',['reset-failed','luigis.service'],{encoding:'utf8'});
  if(objReset.status!==0){
    if(!/not loaded/.test(objReset.stderr))throw new Error('Unable to reset the disposable unit.');
    console.log('Initial unit is not loaded yet; no failed state exists to reset.');
  }
  run('systemctl',['start','luigis.service']);
  const intDeadline=Date.now()+10000;
  while(Date.now()<intDeadline){try{if((await get('/health/ready')).intStatus===200)return;}catch{}
    await new Promise(fnResolve=>setTimeout(fnResolve,100));}
  throw new Error('Disposable service did not become ready.');}
function stop(){run('systemctl',['stop','luigis.service']);stopped();}
function expectPreflightBlock(){
  const objReset=spawnSync('systemctl',['reset-failed','luigis.service'],{encoding:'utf8'});
  if(objReset.status!==0&&!/not loaded/.test(objReset.stderr))throw new Error('Unable to reset disposable failure state.');
  assert.throws(()=>run('systemctl',['start','luigis.service']));
  assert.equal(run('systemctl',['show','luigis.service','--property=Result','--value']).trim(),'exit-code');
  stop();
}
const strA=join(strRoot,'releases',process.env.GITHUB_SHA);const strB=join(strRoot,'releases','b'.repeat(40));
const strC=join(strRoot,'releases','c'.repeat(40));
try{
  run('useradd',['--system','--user-group','--home-dir','/nonexistent','--shell','/usr/sbin/nologin','luigis']);bUser=true;
  const intUid=Number(run('id',['-u','luigis']).trim());const intGid=Number(run('id',['-g','luigis']).trim());
  mkdirSync(dirname(strNode),{recursive:true});cpSync(realpathSync(process.execPath),strNode,{dereference:true});
  chownSync(strNode,0,0);chmodSync(strNode,0o755);
  mkdirSync(strA,{recursive:true});
  for(const strName of ['src','scripts','deploy','package.json','package-lock.json'])cpSync(join(strWorkspace,strName),join(strA,strName),{recursive:true});
  // Independent production-only lockfile install, no dev tools or inherited modules.
  const strNpm=process.env.LUIGIS_NPM_CLI;if(!strNpm)throw new Error('Pinned npm CLI path required.');
  run(process.execPath,[strNpm,'ci','--omit=dev','--ignore-scripts'],{cwd:strA});
  node([join(strA,'scripts/release.js'),'manifest',strA,process.env.GITHUB_SHA]);
  cpSync(strA,strB,{recursive:true,verbatimSymlinks:true});unlinkSync(join(strB,'release-manifest.json'));
  writeFileSync(join(strB,'src/public/css/ordering.css'),readFileSync(join(strB,'src/public/css/ordering.css'),'utf8')+'\n/* OPS isolated release B */\n');
  node([join(strB,'scripts/release.js'),'manifest',strB,'b'.repeat(40)]);
  mkdirSync(strData);run('mount',['-t','tmpfs','-o','size=64m,mode=0700','luigis-ops-rehearsal',strData]);bMounted=true;
  chownSync(strData,intUid,intGid);asService([join(strA,'scripts/migrate.js')]);asService([join(strA,'scripts/seed-menu.js')]);chmodSync(strDatabase,0o600);
  const objDatabase=new DatabaseSync(strDatabase);objDatabase.prepare('UPDATE pizza_sizes SET base_price_cents=base_price_cents+100').run();objDatabase.close();
  strStage='private environment creation';
  node([join(strA,'scripts/setup-host-secrets.js'),'create',strConfig,strData,strA,'https://localhost','ci-demo']);
  assert.throws(()=>node([join(strA,'scripts/setup-host-secrets.js'),'create',strConfig,strData,strA,'https://localhost','ci-demo']));
  const strFixtureKey=join(strScratch,'fixture-key.pem');const strFixtureCert=join(strScratch,'fixture-cert.pem');
  run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',strFixtureKey,
    '-out',strFixtureCert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-days','1']);
  node([join(strA,'scripts/install-tls.js'),strFixtureKey,strFixtureCert,'localhost']);
  const strPayment=join(strConfig,'payment-keys.json');
  for(const strPath of [strPayment,join(strConfig,'tls/privkey.pem'),join(strConfig,'tls/fullchain.pem')]){chmodSync(strPath,0o600);chownSync(strPath,intUid,intGid);}
  console.log(JSON.stringify({strStage:'disposable_parent_policy',intOriginalOptUid:objOptBefore.uid,intOriginalOptMode:objOptBefore.mode&0o777}));
  // Hosted runners may make /opt writable for tool installs; emulate the reviewed
  // root-owned host boundary only for this rehearsal and restore it in finally.
  chownSync('/opt',0,0);chmodSync('/opt',0o755);
  for(const strDirectory of [strRoot,join(strRoot,'runtime'),dirname(strNode),join(strRoot,'releases')])chmodSync(strDirectory,0o755);
  protect(join(strRoot,'releases'));symlinkSync(strA,join(strRoot,'current'));cpSync(join(strA,'deploy/luigis.service'),strUnit);
  strStage='unit validation and first HTTPS startup';
  try{run('systemd-analyze',['verify',strUnit]);}
  catch(objError){console.error(String(objError.stderr??'').split('\n').filter(strLine=>strLine.includes('luigis.service')).join('\n'));throw objError;}
  strStage='first HTTPS startup';run('systemctl',['daemon-reload']);await start();
  assert.equal((await get('/staff/sign-in')).intStatus,200);assert.equal((await get('/__test/reset')).intStatus,404);
  const intPid=Number(run('systemctl',['show','luigis.service','--property=MainPID','--value']).trim());
  const strStatus=readFileSync(`/proc/${intPid}/status`,'utf8');assert.match(strStatus,new RegExp(`Uid:\\s+${intUid}\\s`));
  assert.equal(BigInt('0x'+strStatus.match(/CapEff:\s+([a-f0-9]+)/i)[1]),1n<<10n);
  strStage='supervised crash restart';
  run('systemctl',['kill','--kill-whom=main','--signal=SIGKILL','luigis.service']);
  let bRestarted=false;const intRestartDeadline=Date.now()+20000;
  while(Date.now()<intRestartDeadline){
    const intNextPid=Number(run('systemctl',['show','luigis.service','--property=MainPID','--value']).trim());
    if(intNextPid>0&&intNextPid!==intPid){try{bRestarted=(await get('/health/ready')).intStatus===200;}catch{}}
    if(bRestarted)break;await new Promise(fnResolve=>setTimeout(fnResolve,100));
  }
  assert.equal(bRestarted,true,'Only the disposable service must restart with a new ready process.');
  console.log('PASS: systemd restarts the killed disposable application with a new ready process.');
  strStage='complete TLS generation activation';
  const strPriorTls=realpathSync(join(strConfig,'tls'));
  assert.throws(()=>node([join(strA,'scripts/install-tls.js'),strFixtureKey,strFixtureCert,'wrong.invalid']));
  assert.equal(realpathSync(join(strConfig,'tls')),strPriorTls);
  node([join(strA,'scripts/install-tls.js'),strFixtureKey,strFixtureCert,'localhost']);await start();
  assert.notEqual(realpathSync(join(strConfig,'tls')),strPriorTls);
  console.log('PASS: invalid TLS pair/hostname preserves active certificate; complete pair switches atomically and active HTTPS restarts.');
  stop();strStage='permission and missing-key rejection';
  for(const [strPath,intUnsafeMode,intPrivateMode] of [[strDatabase,0o644,0o600],[strData,0o755,0o700],
    [join(strConfig,'runtime.env'),0o644,0o600],[join(strA,'src/server.js'),0o666,0o644]]){
    chmodSync(strPath,intUnsafeMode);expectPreflightBlock();chmodSync(strPath,intPrivateMode);
  }
  chownSync(strPayment,0,0);expectPreflightBlock();chownSync(strPayment,intUid,intGid);
  renameSync(strPayment,join(strConfig,'held-payment.json'));expectPreflightBlock();
  renameSync(join(strConfig,'held-payment.json'),strPayment);
  console.log('PASS: unsafe database/directory/environment/source permissions, wrong key owner and missing key refuse startup.');
  strStage='private payment-key rotation and service reload';
  const objEnvironmentBefore=readFileSync(join(strConfig,'runtime.env'));
  const strCandidate=join(strConfig,'next-payment.json');
  node([join(strA,'scripts/setup-host-secrets.js'),'prepare-payment-rotation',strPayment,strCandidate]);
  assert.equal(lstatSync(strCandidate).uid,intUid);
  renameSync(strPayment,join(strConfig,'previous-payment.json'));renameSync(strCandidate,strPayment);
  await start();assert.equal(readFileSync(join(strConfig,'runtime.env')).equals(objEnvironmentBefore),true);
  console.log('PASS: service reloads a privately staged payment key version without changing its authenticator key.');
  const objAssetA=await get('/css/order-bundle.css');assert.equal(objAssetA.intStatus,200);assert.match(objAssetA.objHeaders['cache-control'],/max-age=3600/);
  strStage='compatible release and rollback';
  stop();assert.match(check(strB,'ready'),/"intPending":0/);switchStopped(strB);await start();
  assert.match((await get('/css/order-bundle.css')).strBody,/OPS isolated release B/);stop();
  check(strA,'rollback');switchStopped(strA);await start();assert.equal((await get('/css/order-bundle.css')).strBody,objAssetA.strBody);stop();
  console.log('PASS: unprivileged direct HTTPS, exact bind capability, ready/private routes, release/restart and compatible rollback.');
  strStage='additive schema and refused incompatible rollback';
  cpSync(strB,strC,{recursive:true,verbatimSymlinks:true});unlinkSync(join(strC,'release-manifest.json'));
  const strMigrationFile=join(strC,'src/data/migrations.js');const strOriginal=readFileSync(strMigrationFile,'utf8');
  const strChanged=strOriginal.replace(/PRIVACY_ACTIONS_MIGRATION,\r?\n\]\)/,
    "PRIVACY_ACTIONS_MIGRATION,\n{intVersion:16,strName:'ops-rehearsal-only',strSql:'CREATE TABLE ops_rehearsal_only (id INTEGER PRIMARY KEY) STRICT'},\n])");
  assert.notEqual(strOriginal,strChanged);writeFileSync(strMigrationFile,strChanged);
  node([join(strC,'scripts/release.js'),'manifest',strC,'c'.repeat(40)]);protect(strC);
  assert.match(check(strC,'forward'),/"intPending":1/);asService([join(strC,'scripts/migrate.js')]);
  assert.throws(()=>check(strA,'rollback'));assert.throws(()=>run('systemctl',['start','luigis.service']));stop();
  check(strC,'ready');switchStopped(strC);await start();stop();
  const objRetained=new DatabaseSync(strDatabase,{readOnly:true});assert.equal(objRetained.prepare("SELECT base_price_cents FROM pizza_sizes WHERE code='small'").get().base_price_cents,600);
  assert.equal(objRetained.prepare('SELECT count(*) AS intCount FROM schema_migrations').get().intCount,16);objRetained.close();
  console.log('PASS: additive schema forward release, incompatible rollback rejection and unchanged retained menu.');
  strStage='missing mount with boot-disk decoy';
  cpSync(strDatabase,join(strScratch,'retained.sqlite'));run('umount',[strData]);bMounted=false;
  cpSync(join(strScratch,'retained.sqlite'),strDatabase);const objBefore=readFileSync(strDatabase);
  assert.throws(()=>run('systemctl',['start','luigis.service']));assert.deepEqual(readFileSync(strDatabase),objBefore);
  console.log('PASS: absent data mount refuses startup even with an existing boot-disk database.');
}catch{
  // Do not print environment, keys, request bodies, raw stderr or database values.
  console.error(`OPS disposable rehearsal failed at ${strStage}; no private configuration values printed.`);process.exitCode=1;
  const objState=spawnSync('systemctl',['show','luigis.service','--property=Result,ExecMainCode,ExecMainStatus,ExecStartPre'],{encoding:'utf8'});
  console.error(objState.stdout);
  const objJournal=spawnSync('journalctl',['-u','luigis.service','--no-pager','--output=cat','-n','30'],{encoding:'utf8'});
  for(const strLine of objJournal.stdout.split('\n'))if(/^(Release check failed:|Hosted runtime preflight failed;|Hosted layout check:|Hosted root metadata:|Unable to start:|Unable to start the configured server\.)/.test(strLine))console.error(strLine);
}finally{
  spawnSync('systemctl',['stop','luigis.service']);
  if(bMounted)spawnSync('umount',[strData]);
  // Only paths proven absent before this explicit disposable-host opt-in.
  for(const strPath of [strUnit,strRoot,strConfig,strData,strScratch])rmSync(strPath,{recursive:true,force:true});
  chownSync('/opt',objOptBefore.uid,objOptBefore.gid);chmodSync('/opt',objOptBefore.mode&0o777);
  spawnSync('systemctl',['daemon-reload']);if(bUser)spawnSync('userdel',['luigis']);
}
