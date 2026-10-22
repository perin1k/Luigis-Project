// Disposable HTTPS fixture only; never uses real staff identities or logs cookies.
import lighthouse from 'lighthouse';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.env.PLAYWRIGHT_BROWSERS_PATH??=fileURLToPath(new URL('../node_modules/.cache/ms-playwright',import.meta.url));
const {chromium}=await import('@playwright/test');const objBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=9227','--ignore-certificate-errors']});
const objContext=await objBrowser.newContext({ignoreHTTPSErrors:true});const objPage=await objContext.newPage();const arrReports=[];
try{
  const objCheck=await objContext.request.get('https://localhost:3444/__test/reset');if(!objCheck.ok()||await objCheck.text()!=='reset')throw new Error('Disposable queue fixture required.');
  await objPage.goto('https://localhost:3444/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('admin');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objContext.request.get('https://localhost:3444/__test/code')).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await objPage.waitForURL('**/staff/account');
  const objQueue=await(await objContext.request.get('https://localhost:3444/api/staff/orders')).json();
  const strCookie=(await objContext.cookies()).map((objCookie)=>`${objCookie.name}=${objCookie.value}`).join('; ');
  const arrLinks=await(await objContext.request.get('https://localhost:3444/__test/tracking')).json();
  for(const strPath of ['/staff/orders',`/staff/orders/${objQueue.arrOrders[0].strReference}`,arrLinks[1]]){
    const objResult=await lighthouse(`https://localhost:3444${strPath}`,{port:9227,logLevel:'error',output:'json',disableStorageReset:true,extraHeaders:{Cookie:strCookie}});
    arrReports.push({strPath:strPath.startsWith('/track')?'/track':strPath==='/staff/orders'?strPath:'/staff/orders/:reference',strVersion:objResult.lhr.lighthouseVersion,
      strProfile:'Default mobile simulated throttling; production NODE_ENV; isolated HTTPS staff fixture; macOS arm64',
      objConfiguration:{strFormFactor:objResult.lhr.configSettings.formFactor,strThrottlingMethod:objResult.lhr.configSettings.throttlingMethod,objScreenEmulation:objResult.lhr.configSettings.screenEmulation,objThrottling:objResult.lhr.configSettings.throttling},
      objScores:Object.fromEntries(Object.entries(objResult.lhr.categories).map(([strId,objCategory])=>[strId,objCategory.score*100])),
      arrAdvisories:Object.values(objResult.lhr.audits).filter((objAudit)=>objAudit.score!==null&&objAudit.score<1).map((objAudit)=>({strId:objAudit.id,strTitle:objAudit.title,numScore:objAudit.score,strDisplayValue:objAudit.displayValue,...(['errors-in-console','inspector-issues'].includes(objAudit.id)?{objDetails:objAudit.details}: {})}))});
  }
  mkdirSync('reports',{recursive:true});writeFileSync('reports/be-05-tracking-lighthouse.json',JSON.stringify(arrReports,null,2));console.log(JSON.stringify(arrReports));
}finally{await objContext.close();await objBrowser.close();}
