import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function reviewOrder(objPage,bDineIn=false){
  await objPage.goto('/order');
  if(bDineIn)await objPage.getByRole('radio',{name:/Dine-in/}).check();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByRole('checkbox',{name:'Pepperoni',exact:true}).check();
  await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByLabel('Your name').fill(bDineIn?'Synthetic Diner':'Synthetic Collector');
  await objPage.getByLabel(bDineIn?'Email address':'Phone number').fill(bDineIn?'diner@example.invalid':'2025550100');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(objPage.locator('#server-totals')).toBeVisible();
  await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
}

test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});

for(const bDineIn of [false,true])test(`INT-01 ${bDineIn?'dine-in':'carry-out'} committed receipt leads to reloadable private tracking without retaining customer drafts`,async({page:objPage,context:objContext})=>{
  await reviewOrder(objPage,bDineIn);
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  if(bDineIn)await objPage.getByRole('radio',{name:'Apple Pay',exact:true}).check();
  await objPage.getByRole('button',{name:bDineIn?'Confirm demo Apple Pay':'Confirm demo payment',exact:true}).click();
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  const strReference=(await objPage.locator('#receipt-reference').innerText()).trim();
  const strTrackingPath=await objPage.getByRole('link',{name:'Track your order',exact:true}).getAttribute('href');
  expect(strTrackingPath).toMatch(/^\/track#[a-f0-9]{64}$/);
  await objPage.getByRole('link',{name:'Track your order',exact:true}).click();
  await expect(objPage.locator('#tracking-content')).toContainText(strReference);
  await objPage.reload();
  await expect(objPage.locator('#tracking-content')).toContainText('Received');
  await expect(objPage.locator('#tracking-content')).not.toContainText('2025550100');
  await expect(objPage.locator('#tracking-content')).not.toContainText('diner@example.invalid');
  await objPage.goto(`/track#${strReference}`);
  await expect(objPage.locator('#tracking-content')).toBeEmpty();
  await expect(objPage.locator('#tracking-error')).toContainText('unavailable or expired');
  const objOtherPage=await objContext.newPage();
  await objOtherPage.goto('/order');
  await expect(objOtherPage.locator('#summary-items')).not.toContainText('Pepperoni');
  await expect(objOtherPage.getByLabel('Your name')).toHaveValue('');
  const objStored=await objOtherPage.evaluate(()=>({objLocal:{...localStorage},objSession:{...sessionStorage}}));
  expect(JSON.stringify(objStored)).not.toMatch(/Synthetic Collector|Synthetic Diner|2025550100|diner@example|track#|strOrderId/);
  await objOtherPage.reload();
  await expect(objOtherPage.locator('#demo-receipt')).toBeHidden();
  await objOtherPage.close();
});

test('INT-01 changed catalog requires renewed review before persistence or payment',async({page:objPage,request:objRequest})=>{
  await reviewOrder(objPage);
  await objRequest.get('/__test/price-change');
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await expect(objPage.locator('#demo-receipt')).toBeHidden();
  expect((await(await objRequest.get('/__test/count')).json()).intPayments).toBe(0);
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('Review the current total');
  await expect(objPage.locator('#server-totals')).toContainText('$10.98');
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  await expect(objPage.locator('#receipt-details')).toContainText('$10.98');
});

test('INT-01 unavailable selected topping prevents checkout and preserves the basket for editing',async({page:objPage,request:objRequest})=>{
  await reviewOrder(objPage);
  await objRequest.get('/__test/pepperoni-unavailable');
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toBeVisible();
  await expect(objPage.locator('#summary-items')).toContainText('Pepperoni');
  await expect(objPage.locator('#demo-receipt')).toBeHidden();
  expect((await(await objRequest.get('/__test/count')).json()).intConfirmed).toBe(0);
});

test('INT-01 ambiguous server failure keeps the same payment locked for safe recovery',async({page:objPage,request:objRequest})=>{
  await reviewOrder(objPage);await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  let strRequestId;
  await objPage.route('**/api/demo-payments',async(objRoute)=>{
    strRequestId=objRoute.request().postDataJSON().strRequestId;
    await objRoute.fetch();
    await objRoute.fulfill({status:503,contentType:'application/json',body:JSON.stringify({strMessage:'Unable to confirm payment result.'})});
  });
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('Unable to confirm payment result.');
  await expect(objPage.locator('#form-error')).toContainText('Keep this page open');
  await expect(objPage.getByRole('button',{name:'Edit order review',exact:true})).toBeDisabled();
  await expect(objPage.getByRole('button',{name:'Check demo payment result',exact:true})).toBeVisible();
  // The new recovery instruction needs its own accessibility/layout evidence;
  // accepted receipt/menu visuals are reused instead of recollecting them.
  for(const strTheme of ['Light','Dark']){
    await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await objPage.mouse.move(0,0);
    await objPage.evaluate(async()=>{
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().map(objAnimation=>objAnimation.finished.catch(()=>{})));
    });
    expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await expect(objPage).toHaveScreenshot(['preops-ci',`uncertain-payment-${strTheme}.png`],{fullPage:true,animations:'disabled'});
  }
  const objViewport=objPage.viewportSize();
  await objPage.setViewportSize({width:320,height:1000});
  expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await objPage.setViewportSize(objViewport);
  await objPage.unroute('**/api/demo-payments');
  const pRetry=objPage.waitForRequest('**/api/demo-payments');
  await objPage.getByRole('button',{name:'Check demo payment result',exact:true}).click();
  expect((await pRetry).postDataJSON().strRequestId).toBe(strRequestId);
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  expect((await(await objRequest.get('/__test/count')).json()).intPayments).toBe(1);
});

test('INT-01 interrupted order persistence retries the original submission before paying once',async({page:objPage,request:objRequest})=>{
  await reviewOrder(objPage);await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  let strRequestId;
  await objPage.route('**/api/orders',async(objRoute)=>{strRequestId=objRoute.request().postDataJSON().strRequestId;await objRoute.fetch();await objRoute.abort();});
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('retry to safely check the same request');
  await expect(objPage.locator('#demo-receipt')).toBeHidden();
  await objPage.unroute('**/api/orders');
  const pRetry=objPage.waitForRequest('**/api/orders');
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();
  expect((await pRetry).postDataJSON().strRequestId).toBe(strRequestId);
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  expect(await(await objRequest.get('/__test/count')).json()).toMatchObject({intPayments:1,intConfirmed:1});
});
