/**
 * Interactive entry point for the bounded hosted integration rehearsal. Prompted
 * credentials stay private; only the sanitized final summary should be shared.
 */
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOTP,Secret} from 'otpauth';
import {runHostedAudits} from './hosted-audits.js';
import {HOSTED_INT02_ORIGIN} from './hosted-int02-policy.js';

async function main(){
  if(!process.stdin.isTTY||!process.stdout.isTTY||process.argv.length!==2||process.execArgv.length
    ||process.env.DEBUG||process.env.PWDEBUG||process.env.NODE_OPTIONS)throw new Error();
  process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(fileURLToPath(new URL('../node_modules/.cache/ms-playwright',import.meta.url)));
  const {chromium}=await import('@playwright/test');const {runHostedInt02}=await import('./hosted-int02.js');
  let bHidden=false;const objOutput=new Writable({write(objChunk,strEncoding,fnDone){if(!bHidden)process.stdout.write(objChunk,strEncoding);fnDone();}});
  const objTerminal=createInterface({input:process.stdin,output:objOutput,terminal:true,historySize:0});
  const objAbort=new AbortController();objTerminal.on('SIGINT',()=>objAbort.abort());
  async function ask(strPrompt){process.stdout.write(strPrompt);bHidden=true;try{return await objTerminal.question('',{signal:objAbort.signal});}finally{bHidden=false;process.stdout.write('\n');}}
  let objBrowser;let objAudits;
  try{
    process.stdout.write('Final private hosted acceptance. No recording/screen sharing. One labeled no-charge order plus 28 mobile/desktop private-page audits. Temporary access is cleaned afterward. This may take several minutes.\n');
    const strUsername=(await ask('Owner username (hidden): ')).trim();let strPassword=await ask('Owner password (hidden): ');
    objBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=9239','--remote-debugging-address=127.0.0.1']});
    const objResult=await runHostedInt02({objBrowser,strOrigin:HOSTED_INT02_ORIGIN,strUsername,strPassword,
      fnAdditionalAcceptance:async objInput=>{process.stdout.write('Checking: protected-page mobile/desktop Lighthouse\n');objAudits=await runHostedAudits(objInput);},
      fnOwnerCode:async()=>{strPassword='';return (await ask('Current Owner authenticator code (hidden): ')).trim();},
      fnAdminCode:async(strSecret,bFresh)=>{
        if(bFresh)await new Promise(fnDone=>setTimeout(fnDone,30000-Date.now()%30000+1000));
        return new TOTP({secret:Secret.fromBase32(strSecret),digits:6,period:30,algorithm:'SHA1'}).generate();
      },fnProgress:strStage=>{if(objAbort.signal.aborted)throw new Error();process.stdout.write(`Checking: ${strStage}\n`);}});
    process.stdout.write(`${JSON.stringify({objJourney:objResult,objAudits,bPassed:objResult.bPassed&&objAudits?.bPassed===true&&objAudits?.bTemporaryAccountDeleted===true},null,2)}\n`);process.exitCode=objResult.bPassed&&objAudits?.bPassed&&objAudits?.bTemporaryAccountDeleted?0:1;
    if(!objResult.bOrderResolved)process.stdout.write('Order was not confirmed resolved. Review labeled INT02 orders privately before any repeat run.\n');
  }finally{await objBrowser?.close();objTerminal.close();objOutput.end();}
}
main().catch(()=>{process.stderr.write('Hosted verification could not complete. Use a private interactive terminal; no arguments or debug settings. No private error detail was printed.\n');process.exitCode=1;});
