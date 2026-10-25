/**
 * Root-only piped DNS-token receiver with protected-path checks and exclusive file
 * creation. Do not use terminal-visible arguments or overwrite an existing credential.
 */
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';

let objInput;
try{
  if(process.platform!=='linux'||process.getuid()!==0||process.stdin.isTTY||process.argv.length!==2)throw new Error();
  const objDirectory=lstatSync('/etc/luigis');if(objDirectory.uid!==0||!objDirectory.isDirectory()||(objDirectory.mode&0o022)!==0)throw new Error();
  objInput=readFileSync(0);const strToken=objInput.toString('utf8').trim();
  if(!/^[A-Za-z0-9-]{16,256}$/.test(strToken))throw new Error();
  writeFileSync('/etc/luigis/duckdns-token.txt',strToken,{flag:'wx',mode:0o600});
  console.log('DuckDNS token installed in root-private storage.');
}catch{console.error('Private DNS credential installation failed; existing files are never overwritten.');process.exitCode=1;}
finally{objInput?.fill(0);}
