/**
 * Creates fresh private host configuration/key material and stages reviewed key
 * rotation. Existing directories/keys are not silently overwritten; generation does not
 * itself grant application access.
 */
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,realpathSync,openSync,readFileSync,fstatSync,closeSync,
  constants,chownSync,chmodSync,lstatSync} from 'node:fs';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createSyntheticVault} from '../src/payments/synthetic-vault.js';

function within(strParent,strChild){const strRelative=relative(strParent,strChild);
  return strRelative===''||(!strRelative.startsWith(`..${sep}`)&&strRelative!=='..'&&!isAbsolute(strRelative));}
function cleanPath(strPath){if(typeof strPath!=='string'||!strPath||/[\r\n\0]/.test(strPath))throw new Error('Explicit safe path required.');return resolve(strPath);}
function newPath(strPath){const strResolved=cleanPath(strPath);return join(realpathSync(dirname(strResolved)),strResolved.slice(dirname(strResolved).length+1));}
function encodeValue(strValue){return /^[A-Za-z0-9_/:.\-]+$/.test(strValue)?strValue:`"${strValue.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;}
function privateWrite(strPath,strContent){writeFileSync(strPath,strContent,{flag:'wx',mode:0o600});}

/** Pure file preparation; real host ownership is installed by the root-only CLI. */
export function createHostSecretFiles(strDirectory,{strDataDirectory,strReleaseDirectory,strOrigin,
  strHost='0.0.0.0',strEnvironment='hosted-demo'}={}){
  const strTarget=newPath(strDirectory);const strData=realpathSync(cleanPath(strDataDirectory));
  const strRelease=realpathSync(cleanPath(strReleaseDirectory));
  if(!lstatSync(strData).isDirectory()||!lstatSync(strRelease).isDirectory()||within(strRelease,strData))
    throw new Error('Separate existing data and release directories required.');
  if([strData,strRelease,realpathSync(fileURLToPath(new URL('../',import.meta.url)))].some(strParent=>within(strParent,strTarget)))
    throw new Error('Private keys must be outside data and source.');
  const objOrigin=new URL(strOrigin);
  if(objOrigin.protocol!=='https:'||objOrigin.origin!==strOrigin||!['0.0.0.0','127.0.0.1'].includes(strHost)||
    !['hosted-demo','ci-demo','local-demo'].includes(strEnvironment))throw new Error('Approved environment/origin required.');
  mkdirSync(strTarget,{mode:0o700}); // Refuse any existing/partial directory; never replace its keys.
  const strKeyId='demo-'+randomBytes(6).toString('hex');
  privateWrite(join(strTarget,'payment-keys.json'),JSON.stringify({strActiveKeyId:strKeyId,mapKeys:{[strKeyId]:randomBytes(32).toString('hex')}})+'\n');
  const objEnvironment={NODE_ENV:'production',LUIGIS_ENVIRONMENT:strEnvironment,HOST:strHost,PORT:objOrigin.port||'443',
    AUTH_ORIGIN:strOrigin,DATABASE_PATH:join(strData,'luigis-demo.sqlite'),TLS_KEY_PATH:join(strTarget,'tls/privkey.pem'),
    TLS_CERT_PATH:join(strTarget,'tls/fullchain.pem'),DEMO_PAYMENT_KEYS_PATH:join(strTarget,'payment-keys.json'),
    MFA_ENCRYPTION_KEY_HEX:randomBytes(32).toString('hex')};
  privateWrite(join(strTarget,'runtime.env'),Object.entries(objEnvironment).map(([strKey,strValue])=>`${strKey}=${encodeValue(strValue)}`).join('\n')+'\n');
  return {strEnvironment}; // Never return key values to callers/console.
}

/** Stage a new private file; activation remains a stopped, reviewed host operation. */
export function preparePaymentRotation(strSource,strCandidate){
  const strInput=cleanPath(strSource);const strOutput=newPath(strCandidate);
  const strSourceTree=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
  if(within(strSourceTree,realpathSync(strInput))||within(strSourceTree,strOutput))throw new Error('Rotation files must remain outside source.');
  if(realpathSync(dirname(strInput))!==dirname(strOutput))throw new Error('Rotation must stay in the private custody directory.');
  const intDescriptor=openSync(strInput,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let objRing;
  try{const objStat=fstatSync(intDescriptor);
    if(!objStat.isFile()||objStat.size>4096||(process.platform!=='win32'&&(objStat.mode&0o077)!==0))throw new Error('Private regular key ring required.');
    objRing=JSON.parse(readFileSync(intDescriptor,'utf8'));createSyntheticVault(objRing);
  }finally{closeSync(intDescriptor);}
  if(Object.keys(objRing.mapKeys).length>=8)throw new Error('Review old ciphertext before adding another key version.');
  let strKeyId;do{strKeyId='demo-'+randomBytes(6).toString('hex');}while(Object.hasOwn(objRing.mapKeys,strKeyId));
  const objNext={strActiveKeyId:strKeyId,mapKeys:{...objRing.mapKeys,[strKeyId]:randomBytes(32).toString('hex')}};
  privateWrite(strOutput,JSON.stringify(objNext)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.platform!=='linux'||process.getuid()!==0)throw new Error('Private Ubuntu root terminal required.');
    const [strCommand,...arrArgs]=process.argv.slice(2);
    const intUid=Number(execFileSync('id',['-u','luigis'],{encoding:'utf8'}).trim());
    const intGid=Number(execFileSync('id',['-g','luigis'],{encoding:'utf8'}).trim());
    if(!Number.isSafeInteger(intUid)||intUid<=0||!Number.isSafeInteger(intGid)||intGid<=0)throw new Error('Dedicated non-root service identity required.');
    if(strCommand==='create'&&arrArgs.length===5){
      const [strDirectory,strDataDirectory,strReleaseDirectory,strOrigin,strEnvironment]=arrArgs;
      const strParent=realpathSync(dirname(resolve(strDirectory)));const objParent=lstatSync(strParent);
      if(objParent.uid!==0||(objParent.mode&0o022)!==0)throw new Error('Root-controlled custody parent required.');
      createHostSecretFiles(strDirectory,{strDataDirectory,strReleaseDirectory,strOrigin,strEnvironment,
        strHost:strEnvironment==='ci-demo'?'127.0.0.1':'0.0.0.0'});
      chownSync(join(strDirectory,'payment-keys.json'),intUid,intGid);chmodSync(strDirectory,0o711);
      console.log('Private environment files created; existing files were not replaced.');
    }else if(strCommand==='prepare-payment-rotation'&&arrArgs.length===2){
      const [strSource,strCandidate]=arrArgs;const objParent=lstatSync(realpathSync(dirname(resolve(strSource))));
      if(objParent.uid!==0||(objParent.mode&0o022)!==0)throw new Error('Root-controlled custody parent required.');
      preparePaymentRotation(strSource,strCandidate);chownSync(strCandidate,intUid,intGid);
      console.log('Private payment rotation candidate prepared; active configuration is unchanged.');
    }else throw new Error('Explicit create or prepare-payment-rotation command required.');
  }catch{console.error('Private setup did not complete; inspect protected state without printing keys. Existing files must not be replaced blindly.');process.exitCode=1;}
}
