import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {X509Certificate,createPrivateKey} from 'node:crypto';
import {createSecureContext} from 'node:tls';
import {loadPaymentVault} from '../src/payments/payment-config.js';
import {validateHostLayout} from './validate-host-layout.js';

/** Validate the hosted configuration without listening or issuing staff access. */
export function validateRuntime(objEnvironment=process.env,{bHostedLayout=false}={}){
  if(objEnvironment.NODE_ENV!=='production'||!objEnvironment.HOST||
    !/^[a-f0-9]{64}$/.test(objEnvironment.MFA_ENCRYPTION_KEY_HEX??''))throw new Error('Complete hosted configuration required.');
  const intPort=Number(objEnvironment.PORT);const objOrigin=new URL(objEnvironment.AUTH_ORIGIN);
  if(!Number.isInteger(intPort)||intPort<1||intPort>65535||objOrigin.protocol!=='https:'||
    objOrigin.origin!==objEnvironment.AUTH_ORIGIN||Number(objOrigin.port||443)!==intPort)throw new Error('HTTPS origin/port mismatch.');
  const strDatabase=realpathSync(objEnvironment.DATABASE_PATH);
  const strRelease=realpathSync(process.cwd());
  for(const strKey of ['TLS_KEY_PATH','TLS_CERT_PATH','DEMO_PAYMENT_KEYS_PATH']){
    const strPath=objEnvironment[strKey];const objStat=lstatSync(strPath);
    if(!objStat.isFile()||(process.platform!=='win32'&&(objStat.mode&0o077)!==0))throw new Error('Private regular configuration files required.');
    const strResolved=realpathSync(strPath);const strDataDirectory=resolve(strDatabase,'..');
    const strRelative=relative(strDataDirectory,strResolved);
    if(strRelative===''||(!strRelative.startsWith(`..${sep}`)&&strRelative!=='..'&&!isAbsolute(strRelative)))
      throw new Error('Keys must be separate from retained data.');
    const strSourceRelative=relative(strRelease,strResolved);
    if(strSourceRelative===''||(!strSourceRelative.startsWith(`..${sep}`)&&strSourceRelative!=='..'&&!isAbsolute(strSourceRelative)))
      throw new Error('Keys must be outside the application release.');
  }
  const objKey=readFileSync(objEnvironment.TLS_KEY_PATH);const objCert=readFileSync(objEnvironment.TLS_CERT_PATH);
  const objCertificate=new X509Certificate(objCert);
  if(!objCertificate.checkPrivateKey(createPrivateKey(objKey))||!objCertificate.checkHost(objOrigin.hostname)||
    Date.parse(objCertificate.validFrom)>Date.now()||Date.parse(objCertificate.validTo)<=Date.now())throw new Error('Current matching TLS certificate required.');
  createSecureContext({key:objKey,cert:objCert,minVersion:'TLSv1.2'});
  if(!loadPaymentVault(objEnvironment.DEMO_PAYMENT_KEYS_PATH))throw new Error('Private payment key required.');
  if(bHostedLayout)validateHostLayout(objEnvironment,process.cwd());
  return true;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length>3||(process.argv.length===3&&process.argv[2]!=='--host'))throw new Error('Unknown preflight option.');
    validateRuntime(process.env,{bHostedLayout:process.argv[2]==='--host'});console.log('Hosted runtime preflight passed.');}
  catch{console.error('Hosted runtime preflight failed; review private configuration without logging its values.');process.exitCode=1;}
}
