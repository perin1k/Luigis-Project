/** Private, read-only Owner dashboard audit: no orders, invites or extra accounts. */
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditSummary} from './hosted-audits.js';

async function main(){
  // Credentials must never arrive through command arguments, environment or logs.
  if(!process.stdin.isTTY||!process.stdout.isTTY||process.argv.length!==2||process.execArgv.length
    ||process.env.DEBUG||process.env.PWDEBUG||process.env.NODE_OPTIONS)throw new Error();
  process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(fileURLToPath(new URL('../node_modules/.cache/ms-playwright',import.meta.url)));
  const {chromium,expect}=await import('@playwright/test');
  const {default:lighthouse}=await import('lighthouse');
  const {default:objDesktop}=await import('lighthouse/core/config/desktop-config.js');
  const {default:puppeteer}=await import('puppeteer-core');
  let bHidden=false;
  const objOutput=new Writable({write(objChunk,strEncoding,fnDone){if(!bHidden)process.stdout.write(objChunk,strEncoding);fnDone();}});
  const objTerminal=createInterface({input:process.stdin,output:objOutput,terminal:true,historySize:0});
  const objAbort=new AbortController();objTerminal.on('SIGINT',()=>objAbort.abort());
  async function ask(strPrompt){process.stdout.write(strPrompt);bHidden=true;try{return await objTerminal.question('',{signal:objAbort.signal});}finally{bHidden=false;process.stdout.write('\n');}}
  const strOrigin='https://luigispizzeria.duckdns.org';
  let objBrowser,objAuditBrowser,objPage,objContext,objProbe;let bSignedIn=false,bSignedOut=false;
  const arrResults=[];let strFailureStage='sign-in';
  try{
    process.stdout.write('Private dashboard-only check: two cold-cache mobile/desktop Lighthouse audits. No new orders or accounts. Do not record or screen share.\n');
    const strUsername=(await ask('Owner username (hidden): ')).trim();let strPassword=await ask('Owner password (hidden): ');
    objBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=9241','--remote-debugging-address=127.0.0.1']});
    objContext=await objBrowser.newContext({baseURL:strOrigin,acceptDownloads:false,serviceWorkers:'block'});objPage=await objContext.newPage();
    await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill(strUsername);await objPage.getByLabel('Password',{exact:true}).fill(strPassword);strPassword='';
    await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(objPage.getByLabel('Authenticator code',{exact:true})).toBeVisible();
    await objPage.getByLabel('Authenticator code',{exact:true}).fill((await ask('Current authenticator code (hidden): ')).trim());
    await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(objPage).toHaveURL(strOrigin+'/staff/account');bSignedIn=true;
    for(const strName of ['Order queue','Menu management','Sales & analytics'])await expect(objPage.getByRole('navigation',{name:'Staff navigation',exact:true}).getByRole('link',{name:strName,exact:true})).toBeVisible();
    objAuditBrowser=await puppeteer.connect({browserURL:'http://127.0.0.1:9241'});objProbe=await objAuditBrowser.newPage();
    const objCdp=await objProbe.createCDPSession();
    const arrCookies=await objContext.cookies(strOrigin);
    // Seed native host-only cookies into Lighthouse's default context, only in RAM.
    await objCdp.send('Network.setCookies',{cookies:arrCookies.map(obj=>({name:obj.name,value:obj.value,url:strOrigin,path:obj.path,secure:obj.secure,httpOnly:obj.httpOnly,sameSite:obj.sameSite,...(obj.expires>0?{expires:obj.expires}:{})}))});
    for(const strProfile of ['mobile','desktop']){
      strFailureStage='dashboard-'+strProfile;
      if(objAbort.signal.aborted)throw new Error();
      await objCdp.send('Network.clearBrowserCache');
      const objAudit=await lighthouse(strOrigin+'/staff/account',{port:9241,logLevel:'silent',output:'json',disableStorageReset:true},strProfile==='desktop'?objDesktop:undefined);
      expect(new URL(objAudit.lhr.finalDisplayedUrl??objAudit.lhr.finalUrl).pathname).toBe('/staff/account');
      expect(objAudit.lhr.audits['is-crawlable']?.score).toBe(0);
      arrResults.push(auditSummary(objAudit.lhr,'owner-dashboard',strProfile,true));
    }
    strFailureStage=null;
  }catch{/* Errors can contain cookies/private page details: fixed labels only. */}
  finally{
    await objProbe?.close().catch(()=>{});objAuditBrowser?.disconnect();
    if(bSignedIn)try{
      const objCsrf=await(await objPage.request.get('/auth/csrf')).json();
      const objResponse=await objPage.request.post('/auth/logout',{headers:{Origin:strOrigin,'X-CSRF-Token':objCsrf.strCsrfToken},data:{}});bSignedOut=objResponse.status()===204;
    }catch{}
    await objBrowser?.close();objTerminal.close();objOutput.end();
  }
  const bPassed=strFailureStage===null&&arrResults.length===2&&arrResults.every(obj=>obj.bPassed)&&bSignedOut;
  process.stdout.write(JSON.stringify({strTask:'Presentation dashboard audits',strFailureStage,arrResults,bSignedOut,bPassed},null,2)+'\n');process.exitCode=bPassed?0:1;
}
main().catch(()=>{process.stderr.write('Use a private interactive terminal without arguments or debugging. No credential details printed.\n');process.exitCode=1;});
