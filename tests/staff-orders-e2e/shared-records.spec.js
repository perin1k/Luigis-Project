import {test,expect} from '@playwright/test';
const REPORT_PATH='/api/staff/analytics?from=2026-10-21&to=2026-10-21';

async function newSession(objBrowser,strBaseURL,objViewport){
  const objContext=await objBrowser.newContext({baseURL:strBaseURL,viewport:objViewport,ignoreHTTPSErrors:true});
  return {objContext,objPage:await objContext.newPage()};
}
async function signIn(objPage,objRequest,strUser){
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username',{exact:true}).fill(strUser);
  await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');
  await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
  if(strUser!=='employee'){
    const strCode=await(await objRequest.get(`/__test/code${strUser==='owner'?'?secret=owner':''}`)).text();
    await objPage.getByLabel('Authenticator code',{exact:true}).fill(strCode);
    await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();
  }
  await expect(objPage).toHaveURL(/\/staff\/account$/);
}
async function buyOrder(objPage,strName){
  await objPage.goto('/order');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByRole('checkbox',{name:'Pepperoni',exact:true}).check();
  await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByLabel('Your name').fill(strName);await objPage.getByLabel('Phone number').fill('2025550100');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  const pPayment=objPage.waitForResponse(objResponse=>objResponse.url().endsWith('/api/demo-payments'));
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  const objResponse=await pPayment;
  const objReceipt=await objResponse.json();
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  return {objReceipt,objPaymentInput:objResponse.request().postDataJSON()};
}
async function openOrder(objPage,strName){
  await objPage.goto('/staff/orders');
  await objPage.getByRole('link',{name:new RegExp(`${strName} ·`)}).click();
}

test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset-integrated');});

test('INT-02 one customer purchase flows through employee preparation, tracking, admin refund and owner reporting',async({page:objCustomer,browser:objBrowser,request:objRequest,baseURL:strBaseURL})=>{
  const arrSessions=[];
  try{
    const {objReceipt}=await buyOrder(objCustomer,'Integrated Guest');
    const objEmployee=await newSession(objBrowser,strBaseURL,objCustomer.viewportSize());arrSessions.push(objEmployee);
    await signIn(objEmployee.objPage,objRequest,'employee');await openOrder(objEmployee.objPage,'Integrated Guest');
    await expect(objEmployee.objPage.locator('#detail-reference')).toContainText(objReceipt.strReference);
    await expect(objEmployee.objPage.locator('#detail-items')).toContainText('Pepperoni');
    await objCustomer.goto(objReceipt.strTrackingPath);
    for(const strStatus of ['Preparing','Baking','Ready']){
      await objEmployee.objPage.getByRole('button',{name:`Mark ${strStatus}`,exact:true}).click();
      await expect(objEmployee.objPage.locator('#orders-status')).toContainText(`Saved: ${strStatus}`);
      await objEmployee.objPage.getByRole('button',{name:'Refresh order',exact:true}).click();
      await expect(objEmployee.objPage.locator('#detail-summary')).toContainText(strStatus);
      await objCustomer.getByRole('button',{name:'Refresh progress',exact:true}).click();
      await expect(objCustomer.locator('#tracking-content')).toContainText(strStatus);
    }
    expect((await objCustomer.request.get('/api/staff/orders')).status()).toBe(401);
    expect((await objEmployee.objPage.request.get(REPORT_PATH)).status()).toBe(403);
    await expect(objEmployee.objPage.locator('#refund-panel')).toHaveCount(0);
    const objAdmin=await newSession(objBrowser,strBaseURL,objCustomer.viewportSize());arrSessions.push(objAdmin);
    await signIn(objAdmin.objPage,objRequest,'admin');await openOrder(objAdmin.objPage,'Integrated Guest');
    expect((await objAdmin.objPage.request.get(REPORT_PATH)).status()).toBe(403);
    await objAdmin.objPage.getByLabel('Decision',{exact:true}).selectOption('cancel');
    await objAdmin.objPage.getByLabel('I reviewed this order and the selected decision.').check();
    await objAdmin.objPage.getByRole('button',{name:'Save reviewed decision',exact:true}).click();
    await expect(objAdmin.objPage.locator('#admin-order-result')).toContainText('Refund review is still required');
    await objAdmin.objPage.getByRole('button',{name:'Refresh order',exact:true}).click();
    await objAdmin.objPage.getByLabel('I approve the full demonstration refund.',{exact:true}).check();
    await objAdmin.objPage.getByRole('button',{name:'Approve demo refund',exact:true}).click();
    await expect(objAdmin.objPage.locator('#refund-status')).toContainText('refund completed');
    await objCustomer.getByRole('button',{name:'Refresh progress',exact:true}).click();
    await expect(objCustomer.locator('#tracking-content')).toContainText('Cancelled');
    await expect(objCustomer.locator('#tracking-content')).toContainText('Demonstration refund completed');
    const objOwner=await newSession(objBrowser,strBaseURL,objCustomer.viewportSize());arrSessions.push(objOwner);
    await signIn(objOwner.objPage,objRequest,'owner');
    const objReport=await(await objOwner.objPage.request.get(REPORT_PATH)).json();
    expect(objReport.objPaymentCohort.intEligibleOrders).toBe(3);
    expect(objReport.objPeriod.centsRefunds).toBe(objReceipt.objTotals.centsTotal);
    expect(objReport.objPeriod.centsItems).toBe(2700);
    expect(objReport.objPickup.arrDates[0].intCancelled).toBe(1);
    await objOwner.objPage.goto('/staff/analytics?from=2026-10-21&to=2026-10-21');
    await expect(objOwner.objPage.locator('.analytics-table--items')).toContainText('Medium pizza');
  }finally{for(const objSession of arrSessions)await objSession.objContext.close();}
});

test('INT-02 published owner prices reach new purchases while historical receipt snapshots stay unchanged',async({page:objCustomer,browser:objBrowser,request:objRequest,baseURL:strBaseURL})=>{
  const {objReceipt,objPaymentInput}=await buyOrder(objCustomer,'Original Guest');
  const objOwner=await newSession(objBrowser,strBaseURL,objCustomer.viewportSize());
  try{
    await signIn(objOwner.objPage,objRequest,'owner');await objOwner.objPage.goto('/staff/menu');
    await objOwner.objPage.locator('#base-medium').fill('8.00');
    await objOwner.objPage.getByRole('button',{name:'Publish reviewed prices',exact:true}).click();
    await expect(objOwner.objPage.locator('#menu-status')).toContainText('Saved.');
    await objOwner.objPage.reload();await expect(objOwner.objPage.locator('#base-medium')).toHaveValue('8.00');
    const {objReceipt:objNewReceipt}=await buyOrder(objCustomer,'New Price Guest');
    expect(objNewReceipt.objTotals.centsTotal).toBe(1098);
    await objOwner.objPage.getByRole('button',{name:'Mark Pepperoni unavailable',exact:true}).click();
    await expect(objOwner.objPage.locator('#menu-status')).toContainText('Saved.');
    await objCustomer.goto('/order');await objCustomer.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(objCustomer.getByRole('checkbox',{name:/Pepperoni/})).toBeDisabled();
    const objReplay=await objCustomer.request.post('/api/demo-payments',{headers:{Origin:strBaseURL},data:objPaymentInput});
    expect(objReplay.status()).toBe(200);const objOldReceipt=await objReplay.json();
    expect(objOldReceipt.objTotals).toEqual(objReceipt.objTotals);expect(objOldReceipt.objTotals.centsTotal).toBe(988);
    expect(objOldReceipt.arrItems).toEqual(objReceipt.arrItems);
  }finally{await objOwner.objContext.close();}
});

test('INT-02 account deactivation revokes another staff session and clears private order details on refresh',async({page:objEmployee,browser:objBrowser,request:objRequest,baseURL:strBaseURL})=>{
  await signIn(objEmployee,objRequest,'employee');await openOrder(objEmployee,'Synthetic Guest 2');
  const objAdmin=await newSession(objBrowser,strBaseURL,objEmployee.viewportSize());
  try{
    await signIn(objAdmin.objPage,objRequest,'admin');objAdmin.objPage.on('dialog',objDialog=>objDialog.accept());
    await objAdmin.objPage.getByRole('button',{name:'Deactivate employee',exact:true}).click();
    await expect(objAdmin.objPage.getByRole('button',{name:'Reactivate employee',exact:true})).toBeVisible();
    await objEmployee.getByRole('button',{name:'Refresh order',exact:true}).click();
    await expect(objEmployee.locator('#orders-content')).toBeEmpty();
    await expect(objEmployee.getByRole('link',{name:'Sign in again',exact:true})).toBeVisible();
    expect((await objEmployee.request.get('/api/staff/orders')).status()).toBe(401);
    await expect(objAdmin.objPage.getByRole('link',{name:'Sales & analytics',exact:true})).toHaveCount(1);
  }finally{await objAdmin.objContext.close();}
});

test('INT-02 concurrent preparation and failed refresh preserve genuine shared state',async({page:objCustomer,browser:objBrowser,request:objRequest,baseURL:strBaseURL})=>{
  await buyOrder(objCustomer,'Concurrent Guest');
  const objEmployee=await newSession(objBrowser,strBaseURL,objCustomer.viewportSize());
  try{
    await signIn(objEmployee.objPage,objRequest,'employee');await openOrder(objEmployee.objPage,'Concurrent Guest');
    const objStalePage=await objEmployee.objContext.newPage();await objStalePage.goto(objEmployee.objPage.url());
    await objEmployee.objPage.getByRole('button',{name:'Mark Preparing',exact:true}).click();
    await expect(objEmployee.objPage.locator('#orders-status')).toContainText('Saved: Preparing');
    await objStalePage.getByRole('button',{name:'Mark Preparing',exact:true}).click();
    await expect(objStalePage.locator('#orders-error')).toContainText('changed');
    await objStalePage.getByRole('button',{name:'Refresh order',exact:true}).click();
    await expect(objStalePage.getByRole('button',{name:'Mark Baking',exact:true})).toBeEnabled();
    await objStalePage.getByRole('link',{name:'Back to order queue',exact:true}).click();
    await objStalePage.route('**/api/staff/orders',objRoute=>objRoute.abort());
    await objStalePage.getByRole('button',{name:'Refresh orders',exact:true}).click();
    await expect(objStalePage.locator('#orders-error')).toContainText('out of date');
    await expect(objStalePage.locator('#orders-list')).toContainText('Concurrent Guest');
    await objStalePage.unroute('**/api/staff/orders');
    await objStalePage.getByRole('button',{name:'Refresh orders',exact:true}).click();
    await expect(objStalePage.locator('#orders-status')).toContainText('Refreshed.');
    await expect(objStalePage.locator('#orders-list')).toContainText('Preparing');
  }finally{await objEmployee.objContext.close();}
});
