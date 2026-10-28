/**
 * Executes the bounded real hosted cross-role journey with synthetic data. Temporary
 * accounts are cleaned up and results are sanitized; this is not a substitute for every
 * final QA gate.
 */
import {randomBytes} from 'node:crypto';
import {verificationOrigin,temporaryUsername,cleanupTemporaryStaff,sanitizedHostedResult} from './hosted-int02-policy.js';

/** Browser-only acceptance: real routes, separate cookies, no database access. */
export async function runHostedInt02({objBrowser,strOrigin,strUsername,strPassword,fnOwnerCode,fnAdminCode,fnProgress=()=>{},fnAdditionalAcceptance}){
  const {bFixture}=verificationOrigin(strOrigin);
  const {expect}=await import('@playwright/test');
  const strRunId=randomBytes(6).toString('hex');
  const arrContexts=[];const arrManaged=[];const arrPassed=[];
  let strStage='owner-sign-in';let strFailureStage=null;let bAccountsCleaned=false;let bOrderResolved=false;let objOwner;
  async function stage(strNext){strStage=strNext;await fnProgress(strNext);}
  function passed(){arrPassed.push(strStage);}
  async function actor(){
    const objContext=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:bFixture,acceptDownloads:false,serviceWorkers:'block'});
    arrContexts.push(objContext);
    await objContext.route('**/*',objRoute=>{
      const objUrl=new URL(objRoute.request().url());
      return objUrl.origin===strOrigin&&!objUrl.pathname.startsWith('/__test/')?objRoute.continue():objRoute.abort();
    });
    const objPage=await objContext.newPage();objPage.setDefaultTimeout(20000);
    return objPage;
  }
  async function post(objPage,strPath,objInput,intExpected=200){
    const objCsrf=await objPage.request.get('/auth/csrf');expect(objCsrf.status()).toBe(200);
    const {strCsrfToken}=await objCsrf.json();
    const objResponse=await objPage.request.post(strPath,{headers:{Origin:strOrigin,'X-CSRF-Token':strCsrfToken},data:objInput});
    expect(objResponse.status()).toBe(intExpected);
    return intExpected===204?null:objResponse.json();
  }
  async function list(strPath,strKey){
    const arrRows=[];
    for(let intOffset=0;intOffset<10000;intOffset+=50){
      const objResponse=await objOwner.request.get(`${strPath}?intOffset=${intOffset}&intLimit=50`);expect(objResponse.status()).toBe(200);
      const objBody=await objResponse.json();arrRows.push(...objBody[strKey]);if(!objBody.bHasMore)return arrRows;
    }
    throw new Error('Pagination bound reached.');
  }
  async function signIn(objPage,strUser,strPass,fnCode){
    await objPage.goto('/staff/sign-in');
    await objPage.getByLabel('Username',{exact:true}).fill(strUser);
    await objPage.getByLabel('Password',{exact:true}).fill(strPass);
    await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
    if(fnCode){
      await expect(objPage.getByLabel('Authenticator code',{exact:true})).toBeVisible();
      await objPage.getByLabel('Authenticator code',{exact:true}).fill(await fnCode());
      await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();
    }
    await expect(objPage).toHaveURL(`${strOrigin}/staff/account`);
  }
  async function openOrder(objPage,strName){
    await objPage.goto('/staff/orders');
    await objPage.getByRole('link',{name:new RegExp(`${strName} ·`)}).click();
  }
  try{
    await stage('owner-sign-in');objOwner=await actor();
    await signIn(objOwner,strUsername,strPassword,fnOwnerCode);strPassword='';
    expect((await(await objOwner.request.get('/auth/session')).json()).strRole).toBe('owner');passed();
    await stage('temporary-enrollment');
    const mapActors={};
    for(const strRole of ['employee','admin']){
      const strUser=temporaryUsername(strRole,strRunId);const strPass=randomBytes(30).toString('base64url');
      arrManaged.push({strUsername:strUser,strRole});
      const objInvite=await post(objOwner,'/auth/employees/invitations',{strUsername:strUser,strRole},201);
      const objPage=await actor();mapActors[strRole]=objPage;
      await post(objPage,'/auth/employees/enroll',{strInvitationToken:objInvite.strInvitationToken,strPassword:strPass},201);
      let strSecret;
      if(strRole==='admin'){
        const objSetup=await post(objPage,'/auth/promotion/start',{strUsername:strUser,strPassword:strPass});
        strSecret=new URL(objSetup.strProvisioningUri).searchParams.get('secret');
        await post(objPage,'/auth/recovery/confirm',{strCode:await fnAdminCode(strSecret,false)});
      }
      await signIn(objPage,strUser,strPass,strRole==='admin'?()=>fnAdminCode(strSecret,true):null);
      expect((await(await objPage.request.get('/auth/session')).json()).strRole).toBe(strRole);
    }
    passed();await stage('role-navigation');
    const objEmployee=mapActors.employee;const objAdmin=mapActors.admin;const objCustomer=await actor();
    expect((await objCustomer.request.get('/api/staff/orders')).status()).toBe(401);
    await objOwner.goto('/staff/menu');await expect(objOwner.getByRole('button',{name:'Publish reviewed prices',exact:true})).toBeVisible();
    await objOwner.goto('/staff/analytics');
    const strFrom=await objOwner.locator('input[name=from]').inputValue();const strTo=await objOwner.locator('input[name=to]').inputValue();
    const strReport=`/api/staff/analytics?from=${encodeURIComponent(strFrom)}&to=${encodeURIComponent(strTo)}`;
    for(const objPage of [objEmployee,objAdmin]){
      await expect(objPage.getByRole('link',{name:'Order queue',exact:true})).toBeVisible();
      await objPage.goto('/staff/menu');
      await expect(objPage.getByRole('button',{name:'Publish reviewed prices',exact:true})).toHaveCount(0);
      const intReportStatus=objPage===objAdmin?200:403;
      expect((await objPage.request.get('/staff/analytics')).status()).toBe(intReportStatus);
      expect((await objPage.request.get(strReport)).status()).toBe(intReportStatus);
      await objPage.goto('/staff/orders');await expect(objPage.getByRole('link',{name:'Owner sales',exact:true})).toHaveCount(0);
    }
    await post(objAdmin,'/auth/employees/invitations',{strUsername:`int02.denied.${strRunId}`,strRole:'admin'},403);
    passed();await stage('customer-order');
    const strName=`INT02 acceptance ${strRunId}`;
    await objCustomer.goto('/order');
    await objCustomer.getByRole('button',{name:'Continue',exact:true}).click();
    await objCustomer.getByRole('button',{name:'Add pizza',exact:true}).click();
    await objCustomer.getByRole('button',{name:'Continue',exact:true}).click();
    await objCustomer.getByRole('button',{name:'Continue',exact:true}).click();
    await objCustomer.getByLabel('Your name').fill(strName);await objCustomer.getByLabel('Phone number').fill('2025550100');
    await objCustomer.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(objCustomer.locator('#pickup-status')).toContainText('Choose a ready time');
    const elSlots=objCustomer.getByLabel('Pickup or dine-in ready time');
    const strSlot=await elSlots.locator('option').evaluateAll(arrOptions=>arrOptions.find(elOption=>elOption.value&&!elOption.disabled)?.value);
    if(!strSlot)throw new Error('No available slot.');await elSlots.selectOption(strSlot);
    await objCustomer.getByRole('button',{name:'Continue to payment',exact:true}).click();
    const pPayment=objCustomer.waitForResponse(objResponse=>new URL(objResponse.url()).pathname==='/api/demo-payments');
    await objCustomer.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
    const objPayment=await pPayment;expect(objPayment.ok()).toBe(true);const objReceipt=await objPayment.json();
    await expect(objCustomer.locator('#demo-receipt')).toBeVisible();passed();
    await stage('employee-tracking');await openOrder(objEmployee,strName);
    await expect(objEmployee.locator('#detail-reference')).toContainText(objReceipt.strReference);
    await expect(objEmployee.locator('#refund-panel')).toHaveCount(0);
    const objTrackingUrl=new URL(objReceipt.strTrackingPath,strOrigin);expect(objTrackingUrl.origin).toBe(strOrigin);
    await objCustomer.goto(objTrackingUrl.href);
    for(const strStatus of ['Preparing','Baking','Ready']){
      await objEmployee.getByRole('button',{name:`Mark ${strStatus}`,exact:true}).click();
      await expect(objEmployee.locator('#orders-status')).toContainText(`Saved: ${strStatus}`);
      await objEmployee.getByRole('button',{name:'Refresh order',exact:true}).click();
      await objCustomer.getByRole('button',{name:'Refresh progress',exact:true}).click();
      await expect(objCustomer.locator('#tracking-content')).toContainText(strStatus);
    }
    passed();await stage('admin-review');await openOrder(objAdmin,strName);
    await objAdmin.getByLabel('Decision',{exact:true}).selectOption('cancel');
    await objAdmin.getByLabel('I reviewed this order and the selected decision.').check();
    await objAdmin.getByRole('button',{name:'Save reviewed decision',exact:true}).click();
    await expect(objAdmin.locator('#admin-order-result')).toContainText('Refund review is still required');
    await objAdmin.getByRole('button',{name:'Refresh order',exact:true}).click();
    await objAdmin.getByLabel('I approve the full demonstration refund.',{exact:true}).check();
    await objAdmin.getByRole('button',{name:'Approve demo refund',exact:true}).click();
    await expect(objAdmin.locator('#refund-status')).toContainText('refund completed');
    await objCustomer.getByRole('button',{name:'Refresh progress',exact:true}).click();
    await expect(objCustomer.locator('#tracking-content')).toContainText('Demonstration refund completed');bOrderResolved=true;passed();
    await stage('owner-reporting');await objOwner.reload();
    const objReport=await objOwner.request.get(strReport);expect(objReport.status()).toBe(200);
    const objReportBody=await objReport.json();expect(objReportBody.objPeriod.centsRefunds).toBeGreaterThanOrEqual(objReceipt.objTotals.centsTotal);
    await expect(objOwner.locator('.analytics-table--items')).toContainText('pizza');passed();
    // An explicitly approved completion check can reuse these authenticated
    // browser contexts. It must resolve its own labeled data before returning.
    if(fnAdditionalAcceptance)await fnAdditionalAcceptance({objOwner,objCustomer,objReceipt,arrStaff:[objOwner,objEmployee,objAdmin],fnActor:actor,fnPost:post,strRunId,strOrigin});
  }catch{strFailureStage=strStage;}
  finally{
    if(objOwner){
      bAccountsCleaned=await cleanupTemporaryStaff(arrManaged,strRunId,{
        fnListStaff:()=>list('/auth/employees','arrEmployees'),fnListInvitations:()=>list('/auth/employees/invitations','arrInvitations'),
        fnDisable:objRow=>post(objOwner,'/auth/staff/update',{strUserId:objRow.strUserId,strRevision:String(objRow.intRevision),strField:'state',strValue:'disabled'}),
        fnRevoke:objRow=>post(objOwner,'/auth/employees/invitations/revoke',{strInvitationId:objRow.strInvitationId})
      });
      try{await post(objOwner,'/auth/logout',{},204);}catch{/* Cleanup result concerns temporary staff, not an expiring verifier session. */}
    }
    for(const objContext of arrContexts)await objContext.close().catch(()=>{});
  }
  if(bAccountsCleaned)arrPassed.push('cleanup');
  return sanitizedHostedResult({strRunId,strOrigin,strFailureStage,arrPassed,bAccountsCleaned,bOrderResolved});
}
