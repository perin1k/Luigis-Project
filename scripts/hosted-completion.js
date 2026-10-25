/**
 * Approved six-checkout/four-staff observation on real routes. No fixtures,
 * recordings, database access or public debug endpoints. Private data stays in
 * memory; only counts/timings/outcomes leave this function.
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {summarizeMeasurements} from './hosted-completion-policy.js';

export async function runHostedCompletion({objOwner,arrStaff,fnActor,fnPost,strRunId,strOrigin}) {
  const {expect}=await import('@playwright/test');
  const arrCustomers=[];const arrReceipts=[];const arrSamples=[];
  const strStaffName=`qa03.employee.${strRunId}`;
  const strCustomerName=`qa03.customer.${strRunId}`;
  let strPassword=randomBytes(30).toString('base64url');
  let bCustomerCreated=false;let bCustomerDeleted=false;let bStaffDisabled=false;
  let strStage='staff-enrollment';let strFailureStage=null;
  // Observe every dispatched application request through its complete body.
  // Failed HTTP responses remain in the timing denominator.
  const arrPending=[];const mapStarted=new Map();
  function observe(objPage) {
    objPage.on('request',objRequest=>{
      const strPath=new URL(objRequest.url()).pathname;
      if(['/api/orders','/api/demo-payments'].includes(strPath))mapStarted.set(objRequest,performance.now());
    });
    objPage.on('response',objResponse=>{
      const objRequest=objResponse.request();if(!mapStarted.has(objRequest))return;
      arrPending.push((async()=>{await objResponse.body();arrSamples.push({strKind:new URL(objResponse.url()).pathname==='/api/orders'?'order':'payment',
        intStatus:objResponse.status(),numMilliseconds:performance.now()-mapStarted.get(objRequest)});})());
    });
  }
  async function read(objPage,strPath) {
    const numStart=performance.now();const objResponse=await objPage.request.get(strPath);
    await objResponse.body();arrSamples.push({strKind:'read',intStatus:objResponse.status(),numMilliseconds:performance.now()-numStart});
    expect(objResponse.status()).toBe(200);return objResponse.json();
  }
  async function listStaff(){
    const arrRows=[];
    for(let intOffset=0;intOffset<10000;intOffset+=50){const objResponse=await objOwner.request.get(`/auth/employees?intOffset=${intOffset}&intLimit=50`);
      expect(objResponse.status()).toBe(200);const objBody=await objResponse.json();arrRows.push(...objBody.arrEmployees);if(!objBody.bHasMore)return arrRows;}
    throw Error('Pagination bound reached');
  }
  try {
    const strStaffPassword=randomBytes(30).toString('base64url');
    const objInvite=await fnPost(objOwner,'/auth/employees/invitations',{strUsername:strStaffName,strRole:'employee'},201);
    const objFourth=await fnActor();await fnPost(objFourth,'/auth/employees/enroll',{strInvitationToken:objInvite.strInvitationToken,strPassword:strStaffPassword},201);
    await objFourth.goto('/staff/sign-in');await objFourth.getByLabel('Username',{exact:true}).fill(strStaffName);
    await objFourth.getByLabel('Password',{exact:true}).fill(strStaffPassword);await objFourth.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(objFourth).toHaveURL(`${strOrigin}/staff/account`);
    const arrViewers=[...arrStaff,objFourth];expect(arrViewers).toHaveLength(4);
    strStage='customer-account';
    const objAccount=await fnActor();arrCustomers.push(objAccount);
    await objAccount.goto('/account/register');await objAccount.getByLabel('Username',{exact:true}).fill(strCustomerName);
    await objAccount.getByLabel('Password',{exact:true}).fill(strPassword);await objAccount.getByRole('button',{name:'Create customer account',exact:true}).click();
    await expect(objAccount.getByRole('heading',{name:'Your customer account',exact:true})).toBeVisible();bCustomerCreated=true;
    const strRecoveryCode=(await objAccount.getByLabel('Private customer recovery codes').inputValue()).split('\n')[0];
    await objAccount.getByRole('button',{name:'I saved my codes — hide them'}).click();
    await objAccount.getByLabel('Your name (optional)',{exact:true}).fill(`QA03 ${strRunId} 0`);
    await objAccount.getByLabel('Phone number (optional)',{exact:true}).fill('2025550100');
    await objAccount.getByRole('button',{name:'Save contact details',exact:true}).click();
    await expect(objAccount.getByRole('status')).toContainText('saved');
    for(let intIndex=1;intIndex<6;intIndex++)arrCustomers.push(await fnActor());
    strStage='prepare-six-checkouts';
    for(const [intIndex,objPage] of arrCustomers.entries()) {
      await objPage.goto('/order');await objPage.getByRole('button',{name:'Continue',exact:true}).click();
      await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
      await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('button',{name:'Continue',exact:true}).click();
      if(intIndex===0)await expect(objPage.getByLabel('Your name',{exact:true})).toHaveValue(`QA03 ${strRunId} 0`);
      await objPage.getByLabel('Your name',{exact:true}).fill(`QA03 ${strRunId} ${intIndex}`);await objPage.getByLabel('Phone number',{exact:true}).fill('2025550100');
      await objPage.getByRole('button',{name:'Continue',exact:true}).click();await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
      const elSlots=objPage.getByLabel('Pickup or dine-in ready time');
      // Spread the burst across offered future slots; never bypass real capacity.
      const arrSlots=await elSlots.locator('option').evaluateAll(arrOptions=>arrOptions.filter(elOption=>elOption.value&&!elOption.disabled).map(elOption=>elOption.value));
      if(!arrSlots.length)throw Error('No offered capacity');
      await elSlots.selectOption(arrSlots[Math.min(intIndex,arrSlots.length-1)]);
      await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();observe(objPage);
    }
    strStage='six-checkout-four-staff-burst';
    const numBurstStart=performance.now();
    const arrBurst=await Promise.allSettled([
      ...arrCustomers.map(async objPage=>{
        const pReceipt=objPage.waitForResponse(objResponse=>new URL(objResponse.url()).pathname==='/api/demo-payments');
        await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
        const objResponse=await pReceipt;const objReceipt=await objResponse.json();
        if(objResponse.ok())arrReceipts.push(objReceipt);
        expect([200,201]).toContain(objResponse.status());await expect(objPage.locator('#demo-receipt')).toBeVisible();
      }),
      ...arrViewers.map(async objPage=>{for(let intIndex=0;intIndex<5;intIndex++)await read(objPage,'/api/staff/orders');})
    ]);
    await Promise.all(arrPending);
    const numBurstMilliseconds=performance.now()-numBurstStart;
    if(arrBurst.some(objResult=>objResult.status==='rejected'))throw Error('Burst failure');
    expect(arrReceipts).toHaveLength(6);expect(new Set(arrReceipts.map(objReceipt=>objReceipt.strReference)).size).toBe(6);
    strStage='account-history-isolation';await objAccount.goto('/account');
    await expect(objAccount.getByRole('heading',{level:3})).toHaveCount(1);
    expect((await objAccount.request.get('/api/staff/orders')).status()).toBe(401);
    const objOther=arrCustomers[1];await objOther.goto('/account');await expect(objOther).toHaveURL(/\/account\/sign-in$/);
    strStage='customer-recovery-revocation';
    await objOther.goto('/account/recover');await objOther.getByLabel('Username',{exact:true}).fill(strCustomerName);
    await objOther.getByLabel('Unused customer recovery code').fill(strRecoveryCode);
    const strReplacement=randomBytes(30).toString('base64url');await objOther.getByLabel('New password',{exact:true}).fill(strReplacement);
    await objOther.getByRole('button',{name:'Reset password and replace codes'}).click();
    await expect(objOther.getByLabel('Private customer recovery codes')).toBeVisible();strPassword=strReplacement;
    await objAccount.goto('/account');await expect(objAccount).toHaveURL(/\/account\/sign-in$/);
    await objAccount.getByLabel('Username',{exact:true}).fill(strCustomerName);await objAccount.getByLabel('Password',{exact:true}).fill(strPassword);
    await objAccount.getByRole('button',{name:'Sign in',exact:true}).click();await expect(objAccount.getByRole('heading',{level:3})).toHaveCount(1);
    const objMetrics=Object.fromEntries(['read','order','payment'].map(strKind=>[strKind,summarizeMeasurements(arrSamples.filter(objRow=>objRow.strKind===strKind))]));
    expect(objMetrics.read.intCount).toBe(20);expect(objMetrics.order.intCount).toBe(6);expect(objMetrics.payment.intCount).toBe(6);
    if(objMetrics.read.numP95Milliseconds>=2000||objMetrics.order.numP95Milliseconds>=3000||objMetrics.payment.numP95Milliseconds>=3000
      ||Object.values(objMetrics).some(objMetric=>objMetric.intUnexpectedResponses))throw Error('Performance target missed');
    return {bPassed:true,strRunId,intCustomers:6,intStaff:4,numBurstMilliseconds,objMetrics,
      get bCleanupPassed(){return bCustomerDeleted&&bStaffDisabled&&arrReceipts.every(objReceipt=>objReceipt.bResolved===true);}};
  } catch {strFailureStage=strStage;return {bPassed:false,strRunId,strFailureStage,
      get bCleanupPassed(){return bCustomerDeleted&&bStaffDisabled&&arrReceipts.every(objReceipt=>objReceipt.bResolved===true);}};
  } finally {
    // Resolve only receipts created by this run. Preserve audited order history.
    for(const objReceipt of arrReceipts)try {
      const strPath=`/api/staff/orders/${encodeURIComponent(objReceipt.strReference)}`;
      let objResponse=await objOwner.request.get(strPath);expect(objResponse.status()).toBe(200);let objOrder=await objResponse.json();
      const objCsrfResponse=await objOwner.request.get('/api/staff/orders/csrf');const {strCsrfToken}=await objCsrfResponse.json();
      const objHeaders={Origin:strOrigin,'X-CSRF-Token':strCsrfToken};
      objResponse=await objOwner.request.post(strPath+'/exception',{headers:objHeaders,data:{intRevision:objOrder.intRevision,strAction:'cancel'}});expect(objResponse.status()).toBe(200);
      objOrder=await(await objOwner.request.get(strPath)).json();
      objResponse=await objOwner.request.post(strPath+'/refund',{headers:objHeaders,data:{intRevision:objOrder.intRevision,strRequestId:randomUUID()}});expect(objResponse.status()).toBe(200);
      objReceipt.bResolved=true;
    }catch{/* Summary remains failed when a run-created order is unresolved. */}
    if(bCustomerCreated)try {
      const objPage=arrCustomers[0];await objPage.goto('/account');await objPage.getByLabel('Current password to confirm deletion').fill(strPassword);
      await objPage.getByRole('button',{name:'Delete account permanently'}).click();await expect(objPage.getByRole('status')).toContainText('deleted');bCustomerDeleted=true;
    }catch{/* No password or recovery data is emitted. */}
    strPassword='';
    try {const objStaff=(await listStaff()).find(objRow=>objRow.strUsername===strStaffName);
      if(objStaff){await fnPost(objOwner,'/auth/staff/update',{strUserId:objStaff.strUserId,strRevision:String(objStaff.intRevision),strField:'state',strValue:'disabled'});
        bStaffDisabled=(await listStaff()).find(objRow=>objRow.strUsername===strStaffName)?.strState==='disabled';}
    }catch{/* Never disable a different account to make cleanup pass. */}
  }
}
