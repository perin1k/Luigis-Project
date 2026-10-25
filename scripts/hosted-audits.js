/** Private hosted Lighthouse coverage. Raw reports contain cookies/private URLs:
 * keep them in memory and emit only fixed page labels, scores and gate outcomes.
 */
import {randomBytes} from 'node:crypto';
export function auditSummary(objLhr,strPage,strProfile,bNoindex) {
  const objScores=Object.fromEntries(['performance','accessibility','best-practices','seo'].map(strKey=>[strKey,(objLhr.categories[strKey]?.score??0)*100]));
  return {strPage,strProfile,strLighthouse:objLhr.lighthouseVersion,objScores,bNoindex,
    bPassed:!objLhr.runtimeError&&['performance','accessibility','best-practices',...(!bNoindex?['seo']:[])].every(strKey=>objScores[strKey]===100)};
}
export async function runHostedAudits({objOwner,objCustomer,objReceipt,fnActor,strOrigin}) {
  const {expect}=await import('@playwright/test');
  const {default:lighthouse}=await import('lighthouse');
  const {default:objDesktop}=await import('lighthouse/core/config/desktop-config.js');
  const arrResults=[];let bCreated=false;let bDeleted=false;let strFailureStage='customer-audit-enrollment';
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
      {strLabel:'private-tracking',strPath:new URL(objCustomer.url()).pathname,objPage:objCustomer}
    ];
    for(const objTarget of arrTargets) {
      strFailureStage=objTarget.strLabel;
      const objCheck=await objTarget.objPage.request.get(objTarget.strPath);expect(objCheck.status()).toBe(200);
      // Existing private-page SEO exception applies only with actual noindex.
      const bNoindex=/noindex/i.test(objCheck.headers()['x-robots-tag']??'')||/<meta[^>]+name="robots"[^>]+noindex/i.test(await objCheck.text());
      expect(bNoindex).toBe(true);
      const strCookie=(await objTarget.objPage.context().cookies(strOrigin)).map(objCookie=>`${objCookie.name}=${objCookie.value}`).join('; ');
      for(const strProfile of ['mobile','desktop']) {
        // Authentication needs storage preserved. Standard device/throttling/
        // scoring remain unchanged; no raw LHR or headers are written to disk.
        const objAudit=await lighthouse(strOrigin+objTarget.strPath,{port:9239,logLevel:'silent',output:'json',disableStorageReset:true,
          extraHeaders:strCookie?{Cookie:strCookie}:{}},strProfile==='desktop'?objDesktop:undefined);
        const objLhr=objAudit.lhr;
        expect(new URL(objLhr.finalDisplayedUrl??objLhr.finalUrl).pathname).toBe(objTarget.strPath);
        arrResults.push(auditSummary(objLhr,objTarget.strLabel,strProfile,bNoindex));
        process.stdout.write(`Audited: ${objTarget.strLabel} ${strProfile}\n`);
      }
    }
    strFailureStage=null;
  }catch{/* Only the fixed stage label is returned; raw errors can include URLs or cookies. */}
  finally {
    if(bCreated)try{await objAccount.goto('/account');await objAccount.getByLabel('Current password to confirm deletion').fill(strPassword);
      await objAccount.getByRole('button',{name:'Delete account permanently'}).click();await expect(objAccount.getByRole('status')).toContainText('deleted');bDeleted=true;
    }catch{/* Failed cleanup prevents acceptance. */}
    strPassword='';
  }
  return {strTask:'Hosted private-page audits',strFailureStage,arrResults,bTemporaryAccountDeleted:bDeleted,
    bPassed:strFailureStage===null&&arrResults.length===28&&arrResults.every(objResult=>objResult.bPassed)&&bDeleted};
}
