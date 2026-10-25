/**
 * Loads the private versioned synthetic-payment key ring. Keys stay outside source/database; this configuration does not enable real payment processing.
 */
import { openSync,readFileSync,fstatSync,closeSync,constants } from 'node:fs';
import { createSyntheticVault } from './synthetic-vault.js';
/** Explicit private file only. Never silently create or replace a runtime encryption key. */
export function loadPaymentVault(strPath){
  if(strPath===undefined)return null;
  if(typeof strPath!=='string'||!strPath)throw new Error('Private demo key file required.');
  const intDescriptor=openSync(strPath,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const objStat=fstatSync(intDescriptor);
    if(!objStat.isFile()||objStat.size>4096||(process.platform!=='win32' && ((objStat.mode&0o077)!==0 || objStat.uid!==process.getuid())))throw new Error('Private demo key file permissions required.');
    return createSyntheticVault(JSON.parse(readFileSync(intDescriptor,'utf8')));
  }finally{closeSync(intDescriptor);}
}
