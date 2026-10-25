/**
 * Checks private file ownership, permissions, link/path boundaries and release/data
 * layout. Validation reads existing state; it does not provision or repair secrets by
 * weakening permissions.
 */
import {lstatSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,join,relative,isAbsolute,sep} from 'node:path';

function within(strParent,strChild){const strRelative=relative(strParent,strChild);
  return strRelative===''||(!strRelative.startsWith(`..${sep}`)&&strRelative!=='..'&&!isAbsolute(strRelative));}
function privateFile(strPath,intOwner){const objStat=lstatSync(strPath);
  if(!objStat.isFile()||objStat.uid!==intOwner||(objStat.mode&0o077)!==0||objStat.nlink!==1)
    throw new Error('Private single-owner regular file required.');}
function rootPath(strPath,strRootRole='configuration'){
  for(const strStart of new Set([strPath,realpathSync(strPath)])){let strNext=strStart;let intDepth=0;
  while(true){const objStat=lstatSync(strNext);
    if(objStat.uid!==0||(!objStat.isSymbolicLink()&&(objStat.mode&0o022)!==0)){
      const objError=new Error('Root-controlled deployment path required.');
      objError.objRootMetadata={strRootRole,intDepth,intUid:objStat.uid,intMode:objStat.mode&0o777};throw objError;}
    const strParent=dirname(strNext);if(strParent===strNext)break;strNext=strParent;intDepth++;}
  }
}

/** Ubuntu host policy only; never pretend POSIX checks establish Windows ACLs. */
export function validateHostLayout(objEnvironment,strReleaseDirectory){
  let strHostCheck='service_identity';
  try{
  if(process.platform!=='linux'||process.getuid()===0)throw new Error('Unprivileged Ubuntu service required.');
  const intUid=process.getuid();const strRelease=realpathSync(strReleaseDirectory);
  if(!['hosted-demo','ci-demo'].includes(objEnvironment.LUIGIS_ENVIRONMENT))throw new Error('Explicit hosted environment required.');
  strHostCheck='database';
  const strDatabase=realpathSync(objEnvironment.DATABASE_PATH);const strData=dirname(strDatabase);
  const objData=lstatSync(strData);
  if(!objData.isDirectory()||objData.uid!==intUid||(objData.mode&0o777)!==0o700)
    throw new Error('Private service-owned data directory required.');
  privateFile(objEnvironment.DATABASE_PATH,intUid);
  for(const strSuffix of ['-journal','-wal','-shm']){
    try{privateFile(strDatabase+strSuffix,intUid);}catch(objError){if(objError.code!=='ENOENT')throw objError;}
  }
  strHostCheck='environment';rootPath(dirname(strData));rootPath(dirname(objEnvironment.DEMO_PAYMENT_KEYS_PATH));
  privateFile(join(dirname(objEnvironment.DEMO_PAYMENT_KEYS_PATH),'runtime.env'),0);
  strHostCheck='payment_tls';
  for(const strKey of ['DEMO_PAYMENT_KEYS_PATH','TLS_KEY_PATH','TLS_CERT_PATH']){
    privateFile(objEnvironment[strKey],intUid);rootPath(dirname(dirname(objEnvironment[strKey])));
  }
  const strTlsDirectory=dirname(objEnvironment.TLS_KEY_PATH);const objTlsPointer=lstatSync(strTlsDirectory);
  if(objTlsPointer.isSymbolicLink()){
    const strVersions=join(dirname(strTlsDirectory),'certificates');
    if(objTlsPointer.uid!==0||!within(realpathSync(strVersions),realpathSync(strTlsDirectory)))
      throw new Error('Root-controlled private TLS generation required.');
    rootPath(strVersions);
  }
  const objTlsDirectory=lstatSync(realpathSync(strTlsDirectory));
  if(!objTlsDirectory.isDirectory()||objTlsDirectory.uid!==intUid||(objTlsDirectory.mode&0o777)!==0o700)
    throw new Error('Private service-owned TLS directory required.');
  strHostCheck='source_roots';rootPath(strRelease,'release');rootPath('/opt/luigis/current','pointer');rootPath('/opt/luigis/runtime/bin/node','runtime');
  function inspect(strPath){const objStat=lstatSync(strPath);
    if(objStat.uid!==0||(!objStat.isSymbolicLink()&&(objStat.mode&0o022)!==0))throw new Error('Application identity must not modify release content.');
    if(objStat.isSymbolicLink()){
      const strTarget=realpathSync(strPath);
      if(!within(strRelease,strTarget))throw new Error('Release link must remain inside immutable source.');
      const objTarget=lstatSync(strTarget);if(objTarget.uid!==0||(objTarget.mode&0o022)!==0)throw new Error('Unsafe release link target.');
    }else if(objStat.isDirectory()){for(const strName of readdirSync(strPath))inspect(join(strPath,strName));}
    else if(!objStat.isFile())throw new Error('Regular release files required.');
  }
  strHostCheck='source_tree';inspect(strRelease);return true;
  }catch(objCause){const objError=new Error('Hosted permission check failed.');objError.strHostCheck=strHostCheck;
    objError.objRootMetadata=objCause.objRootMetadata;throw objError;}
}
