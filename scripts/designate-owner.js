/**
 * Private operator CLI for explicit Owner designation. This is separate from normal role
 * management and must not be exposed as a public account action.
 */
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {existsSync} from 'node:fs';
import {openDatabase} from '../src/data/database.js';
import {applyMigrations} from '../src/data/migrations.js';
import {createMfaService} from '../src/auth/mfa-service.js';
import {createLoginService} from '../src/auth/login-service.js';
import {designateOwner} from '../src/auth/owner-designation.js';

async function main(){
  if(!process.stdin.isTTY||!process.stdout.isTTY||process.argv.length!==2||!process.env.DATABASE_PATH||!existsSync(process.env.DATABASE_PATH))throw Error('Private configured terminal required.');
  const objDb=openDatabase(process.env.DATABASE_PATH);let objMfa;let objTerminal;let bHidden=false;
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),300000);
  const objOutput=new Writable({write(objChunk,strEncoding,fnDone){if(!bHidden)process.stdout.write(objChunk,strEncoding);fnDone();}});
  async function ask(strPrompt,bSecret=false){process.stdout.write(strPrompt);bHidden=bSecret;try{return await objTerminal.question('',{signal:objAbort.signal});}finally{bHidden=false;if(bSecret)process.stdout.write('\n');}}
  try{
    applyMigrations(objDb);if(objDb.prepare('SELECT user_id FROM staff_ownership').get())throw Error('Owner already designated.');
    objMfa=createMfaService(objDb);const objLogin=createLoginService(objDb,{objMfaService:objMfa});
    objTerminal=createInterface({input:process.stdin,output:objOutput,terminal:true,historySize:0});objTerminal.on('SIGINT',()=>objAbort.abort());
    process.stdout.write('One-time owner designation for an existing admin. Use a private terminal.\n');
    const strUsername=await ask('Intended owner username: ');if(await ask('Type DESIGNATE OWNER to confirm: ')!=='DESIGNATE OWNER')throw Error('Confirmation required.');
    let strPassword=await ask('Existing password (hidden): ',true);let objPending;
    try{objPending=await objLogin.beginSignIn(strUsername,strPassword,'local-owner-designation');}finally{strPassword='';}
    if(!objPending?.strMfaChallenge)throw Error('Existing admin proof required.');
    const strCode=await ask('Fresh authenticator code (hidden): ',true);
    const objProof=objLogin.completeMfa(objPending.strMfaChallenge,strCode,'local-owner-designation');
    if(!objProof||!designateOwner(objDb,objProof.strSessionToken))throw Error('Designation unavailable.');
    process.stdout.write('Owner designated. Previous sessions revoked; sign in again.\n');
  }finally{clearTimeout(intTimer);objTerminal?.close();objOutput.end();objMfa?.destroy();objDb.close();}
}
try{await main();}catch{process.stderr.write('Owner designation did not complete. Check private configuration and existing administrator proof.\n');process.exitCode=1;}
