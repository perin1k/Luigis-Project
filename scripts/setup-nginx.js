import {readFileSync,writeFileSync,mkdirSync,lstatSync,copyFileSync,constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {renderNginxConfig} from './nginx-config.js';
import {proxyConfiguration} from '../src/security/proxy-boundary.js';

export function parsePrivateEnvironment(strText){
  const objEnvironment={};
  for(const strLine of strText.split(/\r?\n/)){
    if(!strLine||strLine.startsWith('#'))continue;
    const arrMatch=/^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(strLine);
    if(!arrMatch||Object.hasOwn(objEnvironment,arrMatch[1]))throw new Error('Unambiguous environment file required.');
    objEnvironment[arrMatch[1]]=arrMatch[2];
  }
  return objEnvironment;
}

/** Stage new files without altering the active environment, service or certificate. */
function prepare(){
  if(process.platform!=='linux'||process.getuid()!==0||process.argv.length!==3||process.argv[2]!=='prepare')throw new Error('Authorized Ubuntu prepare command required.');
  const strEnvironment='/etc/luigis/runtime.env';const objStat=lstatSync(strEnvironment);
  if(!objStat.isFile()||objStat.uid!==0||(objStat.mode&0o077)!==0||objStat.nlink!==1)throw new Error('Private root environment required.');
  const objEnvironment=parsePrivateEnvironment(readFileSync(strEnvironment,'utf8'));
  if(objEnvironment.AUTH_ORIGIN!=='https://luigispizzeria.duckdns.org'||objEnvironment.REVERSE_PROXY_MODE)throw new Error('Reviewed direct-HTTPS starting state required.');
  mkdirSync('/etc/luigis/proxy',{mode:0o700});
  copyFileSync(strEnvironment,'/etc/luigis/proxy/runtime.direct.env',constants.COPYFILE_EXCL);
  const strSecret=randomBytes(32).toString('hex');
  const objProxyEnvironment={...objEnvironment,HOST:'127.0.0.1',PORT:'3443',REVERSE_PROXY_MODE:'nginx-tls',PROXY_SHARED_SECRET:strSecret};
  proxyConfiguration(objProxyEnvironment);
  writeFileSync('/etc/luigis/proxy/runtime.proxy.env',Object.entries(objProxyEnvironment).map(([strName,strValue])=>`${strName}=${strValue}`).join('\n')+'\n',{flag:'wx',mode:0o600});
  const strConfig=renderNginxConfig({strHostname:'luigispizzeria.duckdns.org',strSecret,
    strCertificatePath:'/etc/letsencrypt/live/luigispizzeria.duckdns.org/fullchain.pem',
    strKeyPath:'/etc/letsencrypt/live/luigispizzeria.duckdns.org/privkey.pem',
    strLogPath:'syslog:server=unix:/dev/log,facility=local7,tag=luigis_proxy,severity=info'});
  writeFileSync('/etc/luigis/proxy/nginx.conf',strConfig,{flag:'wx',mode:0o600});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{prepare();console.log('Private Nginx candidate configuration staged. Active service unchanged.');}
  catch{console.error('Nginx preparation failed. Review private paths/state without printing configuration.');process.exitCode=1;}
}
