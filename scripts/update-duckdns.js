import {readFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function updateDuckdns(strToken,strIp,fnFetch=fetch){
  try{
    if(!/^[A-Za-z0-9-]{16,256}$/.test(strToken)||!/^\d{1,3}(\.\d{1,3}){3}$/.test(strIp)||
      strIp.split('.').some(strPart=>Number(strPart)>255))throw new Error();
    const objUrl=new URL('https://www.duckdns.org/update');
    objUrl.search=new URLSearchParams({domains:'luigispizzeria',token:strToken,ip:strIp}).toString();
    const objResponse=await fnFetch(objUrl,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!objResponse.ok||(await objResponse.text()).trim()!=='OK')throw new Error();
    return true;
  }catch{throw new Error('Private DNS update failed.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(!process.env.CREDENTIALS_DIRECTORY||process.argv.length!==2)throw new Error();
    const strPath=join(process.env.CREDENTIALS_DIRECTORY,'duckdns-token');const objStat=lstatSync(strPath);
    if(!objStat.isFile()||(objStat.mode&0o077)!==0)throw new Error();
    const strToken=readFileSync(strPath,'utf8').trim();
    const objMetadata=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip',
      {headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(3000)});
    if(!objMetadata.ok)throw new Error();
    await updateDuckdns(strToken,(await objMetadata.text()).trim());console.log('DuckDNS IPv4 update confirmed.');
  }catch{console.error('Private DNS update failed; no token or request URL logged.');process.exitCode=1;}
}
