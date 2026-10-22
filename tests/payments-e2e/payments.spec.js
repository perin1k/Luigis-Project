import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function checkout(objPage,bDineIn=false){
  await objPage.goto('/order');if(bDineIn)await objPage.getByRole('radio',{name:/Dine-in/}).check();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('checkbox',{name:'Pepperoni',exact:true}).check();
  await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByLabel('Your name').fill('Synthetic Guest');if(bDineIn)await objPage.getByLabel('Email address').fill('guest@example.invalid');else await objPage.getByLabel('Phone number').fill('2025550100');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();await expect(objPage.locator('#server-totals')).toBeVisible();await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
}
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});
test('both methods show committed demo confirmation with no card fields or browser errors',async({page:objPage,request:objRequest})=>{
  const arrErrors=[];objPage.on('pageerror',(objError)=>arrErrors.push(objError.message));
  for(const bDineIn of [false,true]){await checkout(objPage,bDineIn);if(bDineIn)await objPage.getByRole('radio',{name:'Apple Pay',exact:true}).check();
    expect(await objPage.locator('input[autocomplete="cc-number"],input[autocomplete="cc-csc"]').count()).toBe(0);
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await objPage.getByRole('button',{name:bDineIn?'Confirm demo Apple Pay':'Confirm demo payment',exact:true}).click();
    await expect(objPage.locator('#demo-receipt')).toBeVisible();await expect(objPage.locator('#receipt-status')).toContainText('No money was charged');await expect(objPage.locator('#receipt-details')).toContainText('$9.88');
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await expect(objPage.locator('#receipt-tracking-help')).toContainText('Anyone with the link');
    await expect(objPage.locator('#demo-receipt')).toBeFocused();await objPage.getByRole('link',{name:'Track your order',exact:true}).click();await expect(objPage.locator('#tracking-content')).toContainText('Received');await expect(objPage.locator('#tracking-content')).not.toContainText('2025550100');
  }
  expect((await(await objRequest.get('/__test/count')).json()).intConfirmed).toBe(2);expect(arrErrors).toEqual([]);
});
test('a lost payment response retries the same payment without repricing or duplicating confirmation',async({page:objPage,request:objRequest})=>{
  await checkout(objPage);let strRequestId;
  await objPage.route('**/api/demo-payments',async(objRoute)=>{strRequestId=objRoute.request().postDataJSON().strRequestId;await objRoute.fetch();await objRoute.abort();});
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();await expect(objPage.locator('#form-error')).toContainText('response was interrupted');await expect(objPage.getByRole('button',{name:'Back',exact:true})).toBeDisabled();
  await expect(objPage.getByRole('button',{name:'Edit order review',exact:true})).toBeDisabled();
  await objPage.unroute('**/api/demo-payments');await objPage.route('**/api/pricing/preview',(objRoute)=>objRoute.abort());
  const pRetry=objPage.waitForRequest('**/api/demo-payments');await objPage.getByRole('button',{name:'Check demo payment result',exact:true}).click();expect((await pRetry).postDataJSON().strRequestId).toBe(strRequestId);
  await expect(objPage.locator('#demo-receipt')).toBeVisible();expect((await(await objRequest.get('/__test/count')).json()).intPayments).toBe(1);
  await expect(objPage.locator('#receipt-tracking-help')).toContainText('Ask the restaurant team');
  await expect(objPage.locator('#receipt-tracking-help')).toContainText('Do not pay again');
  await expect(objPage.getByRole('link',{name:'Track your order',exact:true})).toHaveCount(0);
  await expect(objPage.locator('#demo-receipt')).toBeFocused();
});

test('receipt recovery guidance light/dark visual capture and narrow reflow',async({page:objPage})=>{
  await checkout(objPage);
  await objPage.route('**/api/demo-payments',async(objRoute)=>{await objRoute.fetch();await objRoute.abort();});
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  await expect(objPage.getByRole('button',{name:'Check demo payment result',exact:true})).toBeVisible();
  await objPage.unroute('**/api/demo-payments');
  await objPage.getByRole('button',{name:'Check demo payment result',exact:true}).click();
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  for(const strTheme of ['Light','Dark']){
    await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await expect(objPage).toHaveScreenshot(`receipt-recovery-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('#receipt-reference'),objPage.locator('#receipt-identity')]});
  }
  await objPage.setViewportSize({width:320,height:900});
  expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('server decline and expiry never confirm the order and require reviewed checkout recovery',async({page:objPage,request:objRequest})=>{
  await objRequest.get('/__test/decline');await checkout(objPage);await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('declined');await expect(objPage.locator('#demo-receipt')).toBeHidden();await expect(objPage.locator('#pickup-time')).toHaveValue('');expect((await(await objRequest.get('/__test/count')).json()).intConfirmed).toBe(0);
  await objRequest.get('/__test/reset');await checkout(objPage);
  await objPage.route('**/api/demo-payments',async(objRoute)=>{await objRequest.get('/__test/expire');await objRoute.continue();});
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();await expect(objPage.locator('#form-error')).toContainText('hold expired');await expect(objPage.locator('#demo-receipt')).toBeHidden();
});
test('receipt light/dark visual capture and narrow reflow',async({page:objPage})=>{
  await checkout(objPage);await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();await expect(objPage.locator('#demo-receipt')).toBeVisible();
  for(const strTheme of ['Light','Dark']){await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);await objPage.screenshot({path:test.info().outputPath(`receipt-${strTheme}.png`),fullPage:true});await expect.soft(objPage).toHaveScreenshot(`receipt-tracking-${strTheme}.png`,{fullPage:true,mask:[objPage.locator('#receipt-reference'),objPage.locator('#receipt-identity')]});}
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
