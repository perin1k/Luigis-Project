import {privateDecrypt,constants} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,unlinkSync} from 'node:fs';
let objPayload;
try{
  if(process.platform!=='linux'||process.getuid()!==0||process.argv.length!==2)throw new Error();
  const objDirectory=lstatSync('/etc/luigis');const objKey=lstatSync('/etc/luigis/dns-transfer.key');
  if(!objDirectory.isDirectory()||objDirectory.uid!==0||(objDirectory.mode&0o022)!==0
    ||!objKey.isFile()||objKey.uid!==0||(objKey.mode&0o077)!==0||objKey.nlink!==1)throw new Error();
  objPayload=privateDecrypt({key:readFileSync('/etc/luigis/dns-transfer.key'),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},readFileSync('/tmp/luigis-duckdns-transfer.bin'));
  const objTransfer=JSON.parse(objPayload.toString('utf8'));
  if(objTransfer.strDomain!=='luigispizzeria'||!Number.isSafeInteger(objTransfer.intExpiresAt)
    ||objTransfer.intExpiresAt<Date.now()||objTransfer.intExpiresAt>Date.now()+900000
    ||!/^[A-Za-z0-9-]{16,256}$/.test(objTransfer.strToken))throw new Error();
  writeFileSync('/etc/luigis/duckdns-token.txt',objTransfer.strToken,{flag:'wx',mode:0o600});
  unlinkSync('/etc/luigis/dns-transfer.key');
  console.log('DuckDNS token installed in root-private storage.');
}catch{console.error('Private DNS credential installation failed; existing credentials are never overwritten.');process.exitCode=1;}
finally{objPayload?.fill(0);}
