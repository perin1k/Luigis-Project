import {X509Certificate,createPrivateKey,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,chownSync,lstatSync,realpathSync,symlinkSync,renameSync,existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

export function prepareTlsGeneration(strConfig,strKeyPath,strCertificatePath,strHostname,
  intUid=process.getuid?.(),intGid=process.getgid?.()){
  const objKey=readFileSync(strKeyPath);const objCertificateBytes=readFileSync(strCertificatePath);
  try{
    const objCertificate=new X509Certificate(objCertificateBytes);
    if(!objCertificate.checkPrivateKey(createPrivateKey(objKey))||!objCertificate.checkHost(strHostname)||
      Date.parse(objCertificate.validFrom)>Date.now()||Date.parse(objCertificate.validTo)<=Date.now())throw new Error('Current matching certificate required.');
    const strParent=join(realpathSync(strConfig),'certificates');
    try{mkdirSync(strParent,{mode:0o711});}catch(objError){if(objError.code!=='EEXIST')throw objError;}
    if(!lstatSync(strParent).isDirectory()||lstatSync(strParent).isSymbolicLink())throw new Error('Private certificate parent required.');
    const strGeneration=join(strParent,randomUUID());mkdirSync(strGeneration,{mode:0o700});
    for(const [strName,objBytes] of [['privkey.pem',objKey],['fullchain.pem',objCertificateBytes]]){
      const strPath=join(strGeneration,strName);writeFileSync(strPath,objBytes,{flag:'wx',mode:0o600});
      if(process.platform!=='win32')chownSync(strPath,intUid,intGid);
    }
    if(process.platform!=='win32')chownSync(strGeneration,intUid,intGid);
    return strGeneration;
  }finally{objKey.fill(0);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let bWasActive=false;let strPrevious;let bSwitched=false;
  const strConfig='/etc/luigis';const strPointer=join(strConfig,'tls');
  function pointTo(strTarget){const strNext=join(strConfig,'.tls-next-'+randomUUID());symlinkSync(strTarget,strNext);renameSync(strNext,strPointer);}
  try{
    if(process.platform!=='linux'||process.getuid()!==0||process.argv.length!==5)throw new Error('Authorized Ubuntu operator required.');
    const [strKey,strCertificate,strHostname]=process.argv.slice(2);
    const objConfig=lstatSync(strConfig);if(objConfig.uid!==0||(objConfig.mode&0o022)!==0)throw new Error('Root-controlled configuration required.');
    if(existsSync(strPointer)){
      const objPointer=lstatSync(strPointer);if(!objPointer.isSymbolicLink()||objPointer.uid!==0)throw new Error('Existing TLS directory requires reviewed migration.');
      strPrevious=realpathSync(strPointer);const strRelative=relative(join(strConfig,'certificates'),strPrevious);
      if(strRelative.startsWith('..')||isAbsolute(strRelative))throw new Error('Private versioned certificate required.');
    }
    const intUid=Number(execFileSync('id',['-u','luigis'],{encoding:'utf8'}));
    const intGid=Number(execFileSync('id',['-g','luigis'],{encoding:'utf8'}));
    if(!Number.isSafeInteger(intUid)||intUid<=0||!Number.isSafeInteger(intGid)||intGid<=0)throw new Error('Private service identity required.');
    const strGeneration=prepareTlsGeneration(strConfig,strKey,strCertificate,strHostname,intUid,intGid);
    const objParent=lstatSync(join(strConfig,'certificates'));if(objParent.uid!==0||(objParent.mode&0o022)!==0)throw new Error('Root-controlled certificate parent required.');
    bWasActive=spawnSync('systemctl',['is-active','--quiet','luigis.service']).status===0;
    if(bWasActive)execFileSync('systemctl',['stop','luigis.service'],{stdio:'ignore'});
    pointTo(strGeneration);bSwitched=true;
    if(bWasActive)execFileSync('systemctl',['start','luigis.service'],{stdio:'ignore'});
    console.log('Complete private TLS pair installed; prior active service state preserved.');
  }catch{
    if(bSwitched&&strPrevious){try{pointTo(strPrevious);if(bWasActive)execFileSync('systemctl',['start','luigis.service'],{stdio:'ignore'});}catch{}}
    console.error('TLS installation failed; review protected state without printing keys.');process.exitCode=1;
  }
}
