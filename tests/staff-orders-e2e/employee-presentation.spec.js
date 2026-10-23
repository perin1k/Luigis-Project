import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function signIn(objPage){
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username',{exact:true}).fill('employee');
  await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');
  await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(objPage).toHaveURL(/\/staff\/account$/);
  await objPage.getByRole('link',{name:'Order queue',exact:true}).click();
}

test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});

test('FE-04 final filters survive refresh and review alerts remain prominent in both themes',async({page:objPage})=>{
  await signIn(objPage);
  await expect(objPage.locator('.staff-review-notice')).toContainText(['Staff review required']);
  for(const strStatus of ['Completed','Cancelled','Not collected']){
    await objPage.getByLabel('Order status',{exact:true}).selectOption(strStatus);
    await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();
    await expect(objPage.getByLabel('Order status',{exact:true})).toHaveValue(strStatus);
    await expect(objPage.locator('#orders-empty')).toHaveText('No confirmed-payment orders match these filters.');
    await objPage.getByRole('button',{name:'Refresh orders',exact:true}).click();
    await expect(objPage.locator('#orders-status')).toHaveText('Refreshed. 0 orders on this page.');
  }
  await objPage.getByLabel('Order status',{exact:true}).selectOption('active');
  await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();
  await objPage.getByRole('button',{name:'Refresh orders',exact:true}).click();
  await expect(objPage.locator('#orders-status')).toContainText('Refreshed.');
  await expect(objPage.locator('.staff-review-notice')).toContainText(['Cancellation review pending']);
  for(const strTheme of ['Light','Dark']){
    await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await objPage.screenshot({path:test.info().outputPath(`fe-04-queue-${strTheme}.png`),fullPage:true});
  }
  await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();
  await expect(objPage.locator('#detail-review')).toBeVisible();
  await expect(objPage.getByRole('button',{name:'Mark Preparing',exact:true})).toBeDisabled();
  await objPage.getByRole('button',{name:'Refresh order',exact:true}).click();
  await expect(objPage.locator('#orders-status')).toHaveText('Order refreshed.');
  await expect(objPage.locator('#detail-review')).toContainText('Staff review required');
  await objPage.setViewportSize({width:320,height:900});
  expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('FE-04 queue filters and genuine preparation details remain readable without JavaScript',async({browser:objBrowser,page:objSignedInPage})=>{
  // Secure sign-in requires JavaScript; reuse only the in-memory synthetic session.
  await signIn(objSignedInPage);
  const objContext=await objBrowser.newContext({javaScriptEnabled:false,ignoreHTTPSErrors:true,viewport:test.info().project.use.viewport,storageState:await objSignedInPage.context().storageState()});
  const objPage=await objContext.newPage();
  try{
    await objPage.goto('https://localhost:3444/staff/orders');
    await objPage.getByLabel('Order status',{exact:true}).selectOption('Not collected');
    await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();
    await expect(objPage.locator('#orders-empty')).toBeVisible();
    await objPage.getByLabel('Order status',{exact:true}).selectOption('active');
    await objPage.getByRole('button',{name:'Apply filters',exact:true}).click();
    await objPage.getByRole('link',{name:/Synthetic Guest 1 ·/}).click();
    await expect(objPage.locator('#detail-items')).toContainText('Pepperoni');
    await expect(objPage.locator('#detail-review')).toContainText('Cancellation review pending');
    await expect(objPage.getByRole('link',{name:'Menu management',exact:true})).toBeVisible();
  }finally{await objContext.close();}
});
