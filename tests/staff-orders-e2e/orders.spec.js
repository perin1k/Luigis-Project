import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function signIn(objPage){await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('employee');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await expect(objPage).toHaveURL(/\/staff\/account$/);await objPage.getByRole('link',{name:'Order queue',exact:true}).click();}
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});
test('authorized queue/detail, filters, hold warnings and minimal customer details',async({page:objPage})=>{
  const arrErrors=[];objPage.on('pageerror',(objError)=>arrErrors.push(objError.message));await signIn(objPage);
  await expect(objPage.locator('#orders-list > li')).toHaveCount(3);await expect(objPage.locator('#orders-content')).toContainText('Cancellation review pending');
  await expect(objPage.locator('#orders-list')).not.toContainText('2025550100');
  await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText('Dark',{exact:true}).click();
  await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();await expect(objPage.locator('#detail-items')).toContainText('Pepperoni');await expect(objPage.locator('#detail-contact')).toContainText('2025550100');
  await expect(objPage.locator('#detail-contact')).not.toContainText('unused@example.invalid');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#orders-status')).toContainText('refreshed');
  await objPage.getByRole('link',{name:'Back to order queue',exact:true}).click();await objPage.getByLabel('Service date (optional)').fill('2026-10-22');await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(objPage.locator('#orders-empty')).toBeVisible();
  expect(arrErrors).toEqual([]);
});
test('unauthenticated and expired sessions never retain private order data after refresh',async({page:objPage,request:objRequest})=>{
  expect((await objPage.request.get('/api/staff/orders')).status()).toBe(401);await objPage.goto('/staff/orders');await expect(objPage).toHaveURL(/\/staff\/sign-in$/);
  await signIn(objPage);await objRequest.get('/__test/expire');await objPage.getByRole('button',{name:'Refresh orders',exact:true}).click();
  await expect(objPage.locator('#orders-content')).toBeEmpty();await expect(objPage.getByRole('link',{name:'Sign in again',exact:true})).toBeVisible();await expect(objPage.locator('#orders-error')).toContainText('session');
});
test('network recovery retains a clearly stale queue and native page links remain usable',async({page:objPage})=>{
  await signIn(objPage);await objPage.route('**/api/staff/orders',(objRoute)=>objRoute.abort());await objPage.getByRole('button',{name:'Refresh orders',exact:true}).click();await expect(objPage.locator('#orders-error')).toContainText('out of date');await expect(objPage.locator('#orders-list > li')).toHaveCount(3);
  await objPage.unroute('**/api/staff/orders');await objPage.getByRole('button',{name:'Refresh orders',exact:true}).click();await expect(objPage.locator('#orders-status')).toContainText('Refreshed');
});
for(const strMode of ['queue','detail'])test(`${strMode} visual capture, accessibility and 320px reflow in both themes`,async({page:objPage})=>{
  await signIn(objPage);
  if(strMode==='queue'){await objPage.getByLabel('Service date (optional)').fill('2026-10-21');await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();}
  if(strMode==='detail')await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();
  for(const strTheme of ['Light','Dark']){
    await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await objPage.screenshot({path:test.info().outputPath(`${strMode}-${strTheme}.png`),fullPage:true});
    await expect.soft(objPage).toHaveScreenshot(`${strMode==='detail'?'detail-notifications':strMode}-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('.staff-order-reference')]});
  }
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('status actions persist each step, require refresh and honor cancellation holds',async({page:objPage})=>{
  await signIn(objPage);await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();await expect(objPage.getByRole('button',{name:'Mark Preparing',exact:true})).toBeDisabled();
  await objPage.getByRole('link',{name:'Back to order queue',exact:true}).click();await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();
  for(const strStatus of ['Preparing','Baking','Ready','Completed']){
    const elButton=objPage.getByRole('button',{name:`Mark ${strStatus}`,exact:true});await elButton.click();await expect(objPage.locator('#orders-status')).toContainText(`Saved: ${strStatus}`);await expect(elButton).toBeDisabled();
    await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#detail-summary')).toContainText(strStatus);
  }
  await expect(objPage.locator('#advance-order')).toBeHidden();await objPage.getByRole('link',{name:'Back to order queue',exact:true}).click();await expect(objPage.locator('#orders-list > li')).toHaveCount(2);
});
test('another staff update returns a conflict and refresh recovers the current step',async({page:objPage})=>{
  await signIn(objPage);await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();
  const strReference=new URL(objPage.url()).pathname.split('/').pop();const objOrder=await(await objPage.request.get(`/api/staff/orders/${strReference}`)).json();
  const objCsrf=await(await objPage.request.get('/api/staff/orders/csrf')).json();
  const objResponse=await objPage.request.post(`/api/staff/orders/${strReference}/progress`,{headers:{Origin:'https://localhost:3444','X-CSRF-Token':objCsrf.strCsrfToken},data:{intRevision:objOrder.intRevision,strStatus:'Preparing'}});expect(objResponse.status()).toBe(200);
  await objPage.getByRole('button',{name:'Mark Preparing',exact:true}).click();await expect(objPage.locator('#orders-error')).toContainText('changed');
  await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.getByRole('button',{name:'Mark Baking',exact:true})).toBeEnabled();
});
test('expired session while saving clears private details and does not advance the order',async({page:objPage,request:objRequest})=>{
  await signIn(objPage);await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();await objRequest.get('/__test/expire');
  await objPage.getByRole('button',{name:'Mark Preparing',exact:true}).click();await expect(objPage.locator('#orders-content')).toBeEmpty();await expect(objPage.getByRole('link',{name:'Sign in again',exact:true})).toBeVisible();await expect(objPage.locator('#advance-order')).toBeHidden();
});
test('private customer progress requires a secret link and never includes contact or financial details',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await objPage.goto(arrPaths[1]);await expect(objPage.locator('#tracking-content')).toContainText('Received');
  await expect(objPage.locator('#tracking-content')).not.toContainText('2025550100');await expect(objPage.locator('#tracking-content')).not.toContainText('Synthetic Guest');
  await objPage.goto('/track#'+ 'f'.repeat(64));await expect(objPage.locator('#tracking-error')).toContainText('unavailable or expired');await expect(objPage.locator('#tracking-content')).toBeEmpty();
});
test('admin reviewed cancellation persists separately from refund and replacement revokes the old guest link',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('admin');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code')).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(objPage).toHaveURL(/\/staff\/account$/);await objPage.getByRole('link',{name:'Order queue',exact:true}).click();await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();
  await objPage.getByLabel('Decision',{exact:true}).selectOption('tracking-replacement');await objPage.getByLabel('I reviewed this order and the selected decision.').check();await objPage.getByRole('button',{name:'Save reviewed decision',exact:true}).click();await expect(objPage.getByRole('link',{name:'Replacement private link',exact:true})).toBeVisible();
  const strNewPath=await objPage.getByRole('link',{name:'Replacement private link',exact:true}).getAttribute('href');const strStaffPath=new URL(objPage.url()).pathname;
  await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#orders-status')).toHaveText('Order refreshed.');await objPage.getByLabel('Decision',{exact:true}).selectOption('cancel');await objPage.getByLabel('I reviewed this order and the selected decision.').check();await objPage.getByRole('button',{name:'Save reviewed decision',exact:true}).click();await expect(objPage.locator('#admin-order-result')).toContainText('Refund review is still required');
  await objPage.goto(arrPaths[0]);await expect(objPage.locator('#tracking-error')).toContainText('unavailable or expired');await objPage.goto(strNewPath);await expect(objPage.locator('#tracking-content')).toContainText('Cancelled');await objPage.goto(strStaffPath);await expect(objPage.locator('#detail-summary')).toContainText('Cancelled');
});
test('tracking visual capture and accessibility in both themes',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await objPage.goto(arrPaths[1]);await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');
  for(const strTheme of ['Light','Dark']){await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await objPage.screenshot({path:test.info().outputPath(`tracking-${strTheme}.png`),fullPage:true});await expect.soft(objPage).toHaveScreenshot(`tracking-cancellation-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('.tracking-reference')]});}
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('admin detail visual capture and accessibility in both themes',async({page:objPage,request:objRequest})=>{
  await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('admin');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code')).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(objPage).toHaveURL(/\/staff\/account$/);await objPage.getByRole('link',{name:'Order queue',exact:true}).click();await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();
  for(const strTheme of ['Light','Dark']){await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await objPage.screenshot({path:test.info().outputPath(`admin-${strTheme}.png`),fullPage:true});await expect(objPage).toHaveScreenshot(`admin-notifications-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('.staff-order-reference')]});}
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('an older tracking response cannot overwrite a newly opened private link',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();let fnRelease;const pHeld=new Promise((fnResolve)=>{fnRelease=fnResolve;});let bFirst=true;
  await objPage.route('**/api/tracking',async(objRoute)=>{if(bFirst){bFirst=false;await pHeld;}await objRoute.continue();});
  const pFirst=objPage.waitForRequest('**/api/tracking');await objPage.goto(arrPaths[1]);await pFirst;
  await objPage.goto('/track#'+'f'.repeat(64));await expect(objPage.locator('#tracking-error')).toContainText('unavailable or expired');
  const pLate=objPage.waitForResponse('**/api/tracking');fnRelease();await pLate;await expect(objPage.locator('#tracking-content')).toBeEmpty();
});
test('tracking keeps keyboard skip and refresh usable without losing its private link',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await objPage.goto(arrPaths[1]);await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');
  await objPage.keyboard.press('Tab');await expect(objPage.getByRole('link',{name:'Skip to main content',exact:true})).toBeFocused();await objPage.keyboard.press('Enter');await expect(objPage.locator('#main-content')).toBeFocused();
  await objPage.keyboard.press('Tab');await expect(objPage.getByLabel('I want to request cancellation.',{exact:true})).toBeFocused();await objPage.keyboard.press('Space');await expect(objPage.getByLabel('I want to request cancellation.',{exact:true})).toBeChecked();await objPage.keyboard.press('Tab');await expect(objPage.getByRole('button',{name:'Request cancellation review',exact:true})).toBeFocused();await objPage.keyboard.press('Tab');await expect(objPage.getByRole('button',{name:'Refresh progress',exact:true})).toBeFocused();const pResponse=objPage.waitForResponse('**/api/tracking');await objPage.keyboard.press('Enter');await pResponse;await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');expect(await objPage.evaluate(()=>location.hash.length)).toBe(65);
});
test('a superseded parsed tracking body cannot repaint the newly opened link',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();
  await objPage.addInitScript(()=>{
    const fnJson=Response.prototype.json;let bHeld=false;
    window.objTrackingBodyControl={bWaiting:false,fnRelease:null};
    Response.prototype.json=async function(){const objValue=await fnJson.call(this);if(this.url.endsWith('/api/tracking')&&this.ok&&!bHeld){bHeld=true;window.objTrackingBodyControl.bWaiting=true;await new Promise((fnResolve)=>{window.objTrackingBodyControl.fnRelease=fnResolve;});}return objValue;};
  });
  await objPage.goto(arrPaths[1]);await expect.poll(()=>objPage.evaluate(()=>window.objTrackingBodyControl.bWaiting)).toBe(true);
  await objPage.goto('/track#'+'f'.repeat(64));await expect(objPage.locator('#tracking-error')).toContainText('unavailable or expired');
  await objPage.evaluate(()=>window.objTrackingBodyControl.fnRelease());await objPage.evaluate(()=>new Promise((fnResolve)=>requestAnimationFrame(fnResolve)));await expect(objPage.locator('#tracking-content')).toBeEmpty();
});

async function adminSignIn(objPage,objRequest){await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('admin');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code')).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(objPage).toHaveURL(/\/staff\/account$/);await objPage.getByRole('link',{name:'Order queue',exact:true}).click();}
async function cancelForRefund(objPage,objRequest){await adminSignIn(objPage,objRequest);await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();await objPage.getByLabel('Decision',{exact:true}).selectOption('cancel');await objPage.getByLabel('I reviewed this order and the selected decision.').check();await objPage.getByRole('button',{name:'Save reviewed decision',exact:true}).click();await expect(objPage.locator('#admin-order-result')).toContainText('Refund review is still required');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#refund-panel')).toBeVisible();}
test('private customer cancellation holds preparation until the admin denies it',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await objPage.goto(arrPaths[1]);await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');await objPage.getByLabel('I want to request cancellation.',{exact:true}).check();await objPage.getByRole('button',{name:'Request cancellation review',exact:true}).click();await expect(objPage.locator('#tracking-status')).toContainText('Preparation is held');
  await signIn(objPage);await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();await expect(objPage.getByRole('button',{name:'Mark Preparing',exact:true})).toBeDisabled();
  await adminSignIn(objPage,objRequest);await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();await objPage.getByLabel('I reviewed this order and the selected decision.').check();await objPage.getByRole('button',{name:'Save reviewed decision',exact:true}).click();await expect(objPage.locator('#admin-order-result')).toContainText('Decision saved');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.getByRole('button',{name:'Mark Preparing',exact:true})).toBeEnabled();
});
test('lost refund response safely replays one request and guest sees confirmed demo refund',async({page:objPage,request:objRequest})=>{
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();await cancelForRefund(objPage,objRequest);await objPage.getByLabel('I approve the full demonstration refund.',{exact:true}).check();let strRequestId;
  await objPage.route('**/api/staff/orders/*/refund',async(objRoute)=>{strRequestId=objRoute.request().postDataJSON().strRequestId;await objRoute.fetch();await objRoute.abort();});await objPage.getByRole('button',{name:'Approve demo refund',exact:true}).click();await expect(objPage.getByRole('button',{name:'Check refund result',exact:true})).toBeEnabled();await objPage.unroute('**/api/staff/orders/*/refund');
  const pRetry=objPage.waitForRequest('**/api/staff/orders/*/refund');await objPage.getByRole('button',{name:'Check refund result',exact:true}).click();expect((await pRetry).postDataJSON().strRequestId).toBe(strRequestId);await expect(objPage.locator('#refund-status')).toContainText('Demonstration refund completed');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#refund-summary')).toContainText('Recorded net: $0.00');
  await objPage.goto(arrPaths[0]);await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund completed. No money was transferred.');
});
test('failed demo refund stays visible and can be retried after a fresh review',async({page:objPage,request:objRequest})=>{
  await cancelForRefund(objPage,objRequest);await objRequest.get('/__test/refund-decline');await objPage.getByLabel('I approve the full demonstration refund.',{exact:true}).check();await objPage.getByRole('button',{name:'Approve demo refund',exact:true}).click();await expect(objPage.locator('#refund-status')).toContainText('refund failed');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#refund-summary')).toContainText('State: failed');
  await objRequest.get('/__test/refund-approve');await objPage.getByLabel('I approve the full demonstration refund.',{exact:true}).check();await objPage.getByRole('button',{name:'Approve demo refund',exact:true}).click();await expect(objPage.locator('#refund-status')).toContainText('refund completed');
});

for(const strOutcome of ['failed','succeeded'])test(`refund ${strOutcome} visual capture and accessibility in both themes`,async({page:objPage,request:objRequest})=>{
  await cancelForRefund(objPage,objRequest);if(strOutcome==='failed')await objRequest.get('/__test/refund-decline');await objPage.getByLabel('I approve the full demonstration refund.',{exact:true}).check();await objPage.getByRole('button',{name:'Approve demo refund',exact:true}).click();await expect(objPage.locator('#refund-status')).toContainText(strOutcome==='failed'?'refund failed':'refund completed');await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();await expect(objPage.locator('#refund-summary')).toContainText(`State: ${strOutcome}`);
  for(const strTheme of ['Light','Dark']){await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await objPage.screenshot({path:test.info().outputPath(`refund-${strOutcome}-${strTheme}.png`),fullPage:true});await expect.soft(objPage).toHaveScreenshot(`refund-notifications-${strOutcome}-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('.staff-order-reference')]});}
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
