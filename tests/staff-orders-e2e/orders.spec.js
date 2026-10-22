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
    await expect(objPage).toHaveScreenshot(`${strMode}-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('.staff-order-reference')]});
  }
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
