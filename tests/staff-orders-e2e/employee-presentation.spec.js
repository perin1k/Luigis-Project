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

for(const intWidth of [390,320])test.describe(`reference geometry at ${intWidth}px`,()=>{
  test.use({viewport:{width:intWidth,height:844}});
  test('opaque reference wrapping keeps equal-length values at a stable mobile height',async({page:objPage,request:objRequest})=>{
  await signIn(objPage);
  const arrValues=['11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','12345678-1234-4123-8123-123456789012','abcdefab-cdef-4abc-8def-abcdefabcdef'];
  async function verifyReference(strSelector){
      const arrHeights=await objPage.locator(strSelector).first().evaluate((elValue,arrReferences)=>{
        const strOriginal=elValue.textContent;
        try{return arrReferences.map(strReference=>{elValue.textContent=strReference;return elValue.parentElement.getBoundingClientRect().height;});}
        finally{elValue.textContent=strOriginal;}
      },arrValues);
      expect(new Set(arrHeights).size).toBe(1);
  }
  await verifyReference('.staff-order-reference');
  const arrPaths=await(await objRequest.get('/__test/tracking')).json();
  await objPage.goto(arrPaths[1]);
  await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');
  await verifyReference('.tracking-reference');
  });
});

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
