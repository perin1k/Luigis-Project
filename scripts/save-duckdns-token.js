// Human's local private terminal only. Never supply a token as an argument/env.
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';

let objTerminal;
try{
  if(!process.stdin.isTTY||!process.stdout.isTTY||process.argv.length!==2)throw new Error('Private terminal required.');
  objTerminal=createInterface({input:process.stdin,output:new Writable({write(_objChunk,_strEncoding,fnDone){fnDone();}}),terminal:true,historySize:0});
  const objAbort=new AbortController();objTerminal.on('SIGINT',()=>objAbort.abort());
  process.stdout.write('Paste your DuckDNS dashboard token (hidden), then press Enter: ');
  let strToken=(await objTerminal.question('',{signal:objAbort.signal})).trim();process.stdout.write('\n');
  if(!/^[A-Za-z0-9-]{16,256}$/.test(strToken))throw new Error('Dashboard token required.');
  const strDirectory=process.platform==='win32'?join(process.env.LOCALAPPDATA,'LuigisPrivate'):join(homedir(),'.luigis-private');
  try{mkdirSync(strDirectory,{mode:0o700});}catch(objError){if(objError.code!=='EEXIST')throw objError;}
  const objStat=lstatSync(strDirectory);if(!objStat.isDirectory()||objStat.isSymbolicLink())throw new Error('Private directory required.');
  if(process.platform==='win32'){
    const strAclScript=`$ErrorActionPreference='Stop';
      $objIdentity=[System.Security.Principal.WindowsIdentity]::GetCurrent();
      $objAcl=[System.Security.AccessControl.DirectorySecurity]::new();
      $objAcl.SetAccessRuleProtection($true,$false);$objAcl.SetOwner($objIdentity.User);
      foreach($objSid in @($objIdentity.User,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
        $objRule=[System.Security.AccessControl.FileSystemAccessRule]::new($objSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');
        $objAcl.AddAccessRule($objRule);
      }
      Set-Acl -LiteralPath $env:LUIGIS_PRIVATE_DIRECTORY -AclObject $objAcl;
      $objActual=Get-Acl -LiteralPath $env:LUIGIS_PRIVATE_DIRECTORY;
      if(!$objActual.AreAccessRulesProtected){throw 'Private ACL required'};
      foreach($objRule in $objActual.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){
        if($objRule.AccessControlType -eq 'Allow' -and $objRule.IdentityReference.Value -notin @($objIdentity.User.Value,'S-1-5-18')){throw 'Unexpected reader'};
      }`;
    execFileSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',strAclScript],
      {stdio:'ignore',env:{...process.env,LUIGIS_PRIVATE_DIRECTORY:strDirectory}});
  }else if(objStat.uid!==process.getuid()||(objStat.mode&0o077)!==0)throw new Error('Private directory permissions required.');
  writeFileSync(join(strDirectory,'duckdns-token.txt'),strToken,{flag:'wx',mode:0o600});strToken='';
  console.log('DuckDNS token saved privately outside the repository. Tell the assistant ready.');
}catch{console.error('Private token setup did not complete. Use your own private terminal; existing token files are never overwritten.');process.exitCode=1;}
finally{objTerminal?.close();}
