/** Private hosted Lighthouse coverage. Raw reports contain cookies/private URLs:
 * keep them in memory and emit only fixed page labels, scores and gate outcomes.
 */
import {randomBytes} from 'node:crypto';
export function auditSummary(objLhr,strPage,strProfile,bNoindex) {
  const objScores=Object.fromEntries(['performance','accessibility','best-practices','seo'].map(strKey=>[strKey,(objLhr.categories[strKey]?.score??0)*100]));
  const objTimings=Object.fromEntries(['first-contentful-paint','largest-contentful-paint','speed-index','total-blocking-time','cumulative-layout-shift']
    .map(strKey=>[strKey,objLhr.audits?.[strKey]?.numericValue??null]));
  return {strPage,strProfile,strLighthouse:objLhr.lighthouseVersion,objScores,objTimings,bNoindex,
    bPassed:!objLhr.runtimeError&&['performance','accessibility','best-practices',...(!bNoindex?['seo']:[])].every(strKey=>objScores[strKey]===100)};
}
export async function runHostedAudits({objOwner,objCustomer,objReceipt,fnActor,strOrigin,arrPageLabels}) {
  const {expect}=await import('@playwright/test');
  const {default:lighthouse}=await import('lighthouse');
  const {default:objDesktop}=await import('lighthouse/core/config/desktop-config.js');
  // Use Lighthouse's already locked browser backend, not a new dependency.
  const {default:puppeteer}=await import('puppeteer-core');
  const arrResults=[];let bCreated=false;let bDeleted=false;let strFailureStage='customer-audit-enrollment';
  let strFailurePhase='enrollment';let intPreflightStatus=null;
  let objAuditConnection;let objCachePage;
  const objAccount=await fnActor();const strUsername='audit.customer.'+randomBytes(6).toString('hex');let strPassword=randomBytes(30).toString('base64url');
  try {
    await objAccount.goto('/account/register');await objAccount.getByLabel('Username',{exact:true}).fill(strUsername);await objAccount.getByLabel('Password',{exact:true}).fill(strPassword);
    await objAccount.getByRole('button',{name:'Create customer account',exact:true}).click();await expect(objAccount.getByRole('heading',{name:'Your customer account',exact:true})).toBeVisible();bCreated=true;
    await objAccount.getByRole('button',{name:'I saved my codes — hide them'}).click();
    const objGuest=await fnActor();const strReference=encodeURIComponent(objReceipt.strReference);
    const arrTargets=[
      ...[['customer-sign-in','/account/sign-in'],['customer-registration','/account/register'],['customer-recovery','/account/recover'],
        ['staff-sign-in','/staff/sign-in'],['staff-enrollment','/staff/enroll'],['staff-recovery','/staff/recovery']].map(([strLabel,strPath])=>({strLabel,strPath,objPage:objGuest})),
      {strLabel:'customer-account',strPath:'/account',objPage:objAccount},
      ...[['owner-account','/staff/account'],['staff-queue','/staff/orders'],['staff-detail',`/staff/orders/${strReference}`],
        ['owner-menu','/staff/menu'],['owner-analytics','/staff/analytics'],['staff-privacy',`/staff/privacy/${strReference}`]].map(([strLabel,strPath])=>({strLabel,strPath,objPage:objOwner})),
      {strLabel:'private-tracking',strPath:new URL(objCustomer.url()).pathname,strFragment:new URL(objCustomer.url()).hash,objPage:objCustomer}
    ];
    const arrSelected=arrPageLabels?arrTargets.filter(objTarget=>arrPageLabels.includes(objTarget.strLabel)):arrTargets;
    if(arrPageLabels&&arrSelected.length!==arrPageLabels.length)throw new Error('Known fixed page labels required.');
    const objCdp=await objOwner.context().browser().newBrowserCDPSession();
    objAuditConnection=await puppeteer.connect({browserURL:'http://127.0.0.1:9239',defaultViewport:null});
    objCachePage=await objAuditConnection.newPage();
    const objCacheSession=await objCachePage.createCDPSession();
    for(const objTarget of arrSelected) {
      strFailureStage=objTarget.strLabel;
      if(objTarget.strLabel==='private-tracking') {
        strFailurePhase='tracking-grant';expect(objTarget.strFragment).toMatch(/^#[a-f0-9]{64}$/);
      }
      strFailurePhase='preflight';
      const objCheck=await objTarget.objPage.request.get(objTarget.strPath);intPreflightStatus=objCheck.status();expect(intPreflightStatus).toBe(200);
      expect(new URL(objCheck.url()).pathname).toBe(objTarget.strPath);
      // Existing private-page SEO exception applies only with actual noindex.
      const bNoindex=/noindex/i.test(objCheck.headers()['x-robots-tag']??'')||/<meta[^>]+name="robots"[^>]+noindex/i.test(await objCheck.text());
      strFailurePhase='noindex';expect(bNoindex).toBe(true);
      const arrCookies=await objTarget.objPage.context().cookies(strOrigin);
      for(const strProfile of ['mobile','desktop']) {
        // Seed only Lighthouse's default cookie store, not the isolated actor's
        // context. Native browser cookies preserve host-only/SameSite semantics;
        // no secret-bearing extraHeaders are needed or written into reports.
        strFailurePhase='cookie-store';
        await objCdp.send('Storage.clearCookies');
        await objCdp.send('Storage.setCookies',{cookies:arrCookies.map(objCookie=>({name:objCookie.name,value:objCookie.value,url:strOrigin,
          path:objCookie.path,secure:objCookie.secure,httpOnly:objCookie.httpOnly,sameSite:objCookie.sameSite,
          ...(objCookie.expires>0?{expires:objCookie.expires}:{})}))});
        // Preserving authentication must not silently turn later measurements
        // into warm-cache audits. Clear the default audit context's HTTP cache.
        await objCacheSession.send('Network.clearBrowserCache');
        // Authentication needs storage preserved. Standard device/throttling/
        // scoring remain unchanged; no raw LHR or headers are written to disk.
        strFailurePhase='lighthouse';
        const objAudit=await lighthouse(strOrigin+objTarget.strPath+(objTarget.strFragment??''),{port:9239,logLevel:'silent',output:'json',disableStorageReset:true},strProfile==='desktop'?objDesktop:undefined);
        const objLhr=objAudit.lhr;
        strFailurePhase='audit-target';
        expect(new URL(objLhr.finalDisplayedUrl??objLhr.finalUrl).pathname).toBe(objTarget.strPath);
        if(objTarget.strLabel==='private-tracking') {
          strFailurePhase='tracking-result';
          // Confirm the grant-loaded screen, not the empty /track shell. Only a
          // boolean is retained; never emit the token-bearing URL or raw audit.
          expect(objLhr.audits['network-requests']?.details?.items?.some(objItem=>{
            try{return new URL(objItem.url).origin===strOrigin&&new URL(objItem.url).pathname==='/api/tracking'&&objItem.statusCode===200;}catch{return false;}
          })).toBe(true);
        }
        arrResults.push(auditSummary(objLhr,objTarget.strLabel,strProfile,bNoindex));
        process.stdout.write(`Audited: ${objTarget.strLabel} ${strProfile}\n`);
      }
    }
    strFailureStage=null;strFailurePhase=null;
  }catch{/* Only the fixed stage label is returned; raw errors can include URLs or cookies. */}
  finally {
    await objCachePage?.close().catch(()=>{});objAuditConnection?.disconnect();
    if(bCreated)try{await objAccount.goto('/account');await objAccount.getByLabel('Current password to confirm deletion').fill(strPassword);
      await objAccount.getByRole('button',{name:'Delete account permanently'}).click();await expect(objAccount.getByRole('status')).toContainText('deleted');bDeleted=true;
    }catch{/* Failed cleanup prevents acceptance. */}
    strPassword='';
  }
  return {strTask:'Hosted private-page audits',strFailureStage,strFailurePhase,intPreflightStatus,arrResults,bTemporaryAccountDeleted:bDeleted,
    bPassed:strFailureStage===null&&arrResults.length===28&&arrResults.every(objResult=>objResult.bPassed)&&bDeleted};
}
