import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxyBoundary,clientAddress,proxyConfiguration} from '../../src/security/proxy-boundary.js';
import {createAnonymousLimits} from '../../src/security/anonymous-limits.js';
import {renderNginxConfig} from '../../scripts/nginx-config.js';
const SECRET='ab'.repeat(32);
const ORIGIN='https://luigispizzeria.duckdns.org';
function request(objExtra={}){return {path:'/api/orders',socket:{encrypted:true,remoteAddress:'127.0.0.1'},headers:{host:'luigispizzeria.duckdns.org','x-forwarded-host':'luigispizzeria.duckdns.org','x-forwarded-proto':'https','x-forwarded-for':'202.0.113.1','x-luigis-proxy-token':SECRET},...objExtra};}
function response(){return {intStatus:200,status(intStatus){this.intStatus=intStatus;return this;},set(){return this;},type(){return this;},send(){return this;},json(){return this;}};}
test('proxy mode is explicit, loopback-only, private TLS and complete',()=>{
  assert.equal(proxyConfiguration({}),null);
  const objEnvironment={REVERSE_PROXY_MODE:'nginx-tls',HOST:'127.0.0.1',PORT:'3443',AUTH_ORIGIN:ORIGIN,PROXY_SHARED_SECRET:SECRET};
  assert.equal(proxyConfiguration(objEnvironment).strOrigin,ORIGIN);
  for(const objChange of [{HOST:'0.0.0.0'},{PORT:'443'},{PORT:'80'},{PROXY_SHARED_SECRET:'weak'},{REVERSE_PROXY_MODE:'true'},{AUTH_ORIGIN:'http://luigispizzeria.duckdns.org'}])assert.throws(()=>proxyConfiguration({...objEnvironment,...objChange}));
});
test('only authenticated loopback TLS forwarding establishes a client address',()=>{
  const fnBoundary=createProxyBoundary({strOrigin:ORIGIN,strSecret:SECRET});
  const objRequest=request();let bPassed=false;fnBoundary(objRequest,response(),()=>{bPassed=true;});assert.equal(bPassed,true);assert.equal(clientAddress(objRequest),'202.0.113.1');assert.equal(objRequest.headers['x-luigis-proxy-token'],undefined);
  for(const objChange of [{socket:{encrypted:false,remoteAddress:'127.0.0.1'}},{socket:{encrypted:true,remoteAddress:'202.0.113.9'}},
    {headers:{...request().headers,'x-luigis-proxy-token':'cd'.repeat(32)}},{headers:{...request().headers,'x-forwarded-for':'202.0.113.1, 1.2.3.4'}},
    {headers:{...request().headers,'x-forwarded-proto':'http'}},{headers:{...request().headers,host:'outside.example'}},
    {headers:{...request().headers,'x-forwarded-host':'outside.example'}}]){
    const objBad=request(objChange);const objResponse=response();let bNext=false;fnBoundary(objBad,objResponse,()=>{bNext=true;});assert.equal(bNext,false);assert.equal(objResponse.intStatus,403);assert.equal(clientAddress(objBad),objBad.socket.remoteAddress);
  }
});
test('direct-mode spoofed headers cannot reset limits; verified clients have separate buckets',()=>{
  const fnBoundary=createProxyBoundary({strOrigin:ORIGIN,strSecret:SECRET});const fnLimit=createAnonymousLimits();
  for(let intIndex=0;intIndex<60;intIndex++){const objReq=request({socket:{remoteAddress:'198.51.100.1'}});objReq.headers['x-forwarded-for']='198.51.100.'+intIndex;fnLimit(objReq,response(),()=>{});}
  const objBlocked=response();fnLimit(request({socket:{remoteAddress:'198.51.100.1'}}),objBlocked,()=>{});assert.equal(objBlocked.intStatus,429);
  const fnProxyLimit=createAnonymousLimits();
  for(let intIndex=0;intIndex<60;intIndex++){const objReq=request();fnBoundary(objReq,response(),()=>{});fnProxyLimit(objReq,response(),()=>{});}
  const objOther=request();objOther.headers['x-forwarded-for']='202.0.113.2';fnBoundary(objOther,response(),()=>{});const objAllowed=response();fnProxyLimit(objOther,objAllowed,()=>{});assert.equal(objAllowed.intStatus,200);
});
test('Nginx overwrites forwarding, verifies local TLS and never logs URLs/addresses/bodies',()=>{
  const objInput={strHostname:'luigispizzeria.duckdns.org',strSecret:SECRET,strCertificatePath:'/private/fullchain.pem',strKeyPath:'/private/privkey.pem'};
  const strConfig=renderNginxConfig(objInput);
  assert.match(strConfig,/proxy_ssl_verify on/);assert.match(strConfig,/X-Forwarded-For \$remote_addr/);assert.match(strConfig,/proxy_request_buffering off/);assert.match(strConfig,/proxy_buffering off/);
  const strLog=strConfig.split('\n').find(strLine=>strLine.includes('log_format'));
  assert.ok(!/\$request(?:[ ;']|_uri|_body)|\$http_|\$remote_addr/.test(strLog));
  for(const objChange of [{strHostname:'host; injected'},{strKeyPath:'/private/key with space'},{strSecret:'bad'},{intBackendPort:443},{strLogPath:'/tmp/../private'}])assert.throws(()=>renderNginxConfig({...objInput,...objChange}));
});
