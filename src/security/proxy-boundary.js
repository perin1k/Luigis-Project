import {isIP} from 'node:net';
import {timingSafeEqual} from 'node:crypto';

// Only this module can attach a forwarded identity to a request. A client-supplied
// property/header alone never changes the address used by authentication limits.
const mapClientAddresses=new WeakMap();
export function clientAddress(objRequest){return mapClientAddresses.get(objRequest)??objRequest.socket.remoteAddress??'unknown';}

export function proxyConfiguration(objEnvironment){
  if(objEnvironment.REVERSE_PROXY_MODE===undefined&&objEnvironment.PROXY_SHARED_SECRET===undefined)return null;
  const objOrigin=new URL(objEnvironment.AUTH_ORIGIN);
  const intPort=Number(objEnvironment.PORT);
  if(objEnvironment.REVERSE_PROXY_MODE!=='nginx-tls'||objEnvironment.HOST!=='127.0.0.1'
    ||objOrigin.protocol!=='https:'||objOrigin.origin!==objEnvironment.AUTH_ORIGIN
    ||!Number.isInteger(intPort)||intPort<1024||intPort>65535||intPort===Number(objOrigin.port||443)
    ||! /^[a-f0-9]{64}$/.test(objEnvironment.PROXY_SHARED_SECRET??''))throw new Error('Complete loopback HTTPS proxy configuration required.');
  return Object.freeze({strOrigin:objOrigin.origin,strSecret:objEnvironment.PROXY_SHARED_SECRET});
}

/** Authenticate the local TLS hop before any assets, parsing or application work. */
export function createProxyBoundary(objConfig){
  const strHost=new URL(objConfig.strOrigin).host;
  if(!/^[a-f0-9]{64}$/.test(objConfig.strSecret))throw new Error('Private proxy proof required.');
  const objExpected=Buffer.from(objConfig.strSecret,'hex');
  return function verifyLocalProxy(objRequest,objResponse,fnNext){
    const strProof=objRequest.headers['x-luigis-proxy-token'];
    const strAddress=objRequest.headers['x-forwarded-for'];
    const bTrusted=objRequest.socket.encrypted===true
      &&['127.0.0.1','::ffff:127.0.0.1'].includes(objRequest.socket.remoteAddress)
      &&objRequest.headers.host===strHost
      &&objRequest.headers['x-forwarded-host']===strHost
      &&objRequest.headers['x-forwarded-proto']==='https'
      &&typeof strAddress==='string'&&isIP(strAddress)!==0
      &&typeof strProof==='string'&&/^[a-f0-9]{64}$/.test(strProof)
      &&timingSafeEqual(Buffer.from(strProof,'hex'),objExpected);
    if(!bTrusted)return objResponse.status(403).set({'Cache-Control':'no-store','X-Robots-Tag':'noindex'}).type('text').send('Use the public secure website address.');
    mapClientAddresses.set(objRequest,strAddress);
    delete objRequest.headers['x-luigis-proxy-token'];
    fnNext();
  };
}
