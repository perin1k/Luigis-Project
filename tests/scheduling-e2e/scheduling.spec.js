import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
test.use({ timezoneId: 'Pacific/Honolulu' });
async function review(objPage) {
  await objPage.goto('/order');await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await objPage.getByLabel('Your name').fill('Synthetic Guest');await objPage.getByLabel('Phone number').fill('2025550100');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(objPage.locator('#server-totals')).toBeVisible();await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
}
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});

test('payment recap preserves dine-in email and selected Central ready time', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.getByRole('button', { name: 'Edit service', exact: true }).click();
  await objPage.getByRole('radio', { name: /Dine-in/ }).check();
  for (let intStep = 0; intStep < 3; intStep++) await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Phone number').fill('');
  await objPage.getByLabel('Email address').fill('guest@example.invalid');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#payment-context')).toContainText('Dine-in');
  await expect(objPage.locator('#payment-context')).toContainText('guest@example.invalid');
  await expect(objPage.locator('#payment-context')).not.toContainText('2025550100');
  await expect(objPage.locator('#payment-pickup')).toContainText('10:20 AM');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$7.68');
});

test('scheduled status separates cancellation decisions from refund outcomes and fails safely', async ({ page: objPage }) => {
  await objPage.goto('/__test/scheduled-status');
  const fnStatus = (strName) => objPage.getByRole('article', { name: strName, exact: true });
  await expect(fnStatus('Awaiting review')).toContainText('Awaiting admin review');
  await expect(fnStatus('Awaiting review')).toContainText('We’re sorry');
  await expect(fnStatus('Approved')).toContainText('Cancellation approved');
  await expect(fnStatus('Approved')).toContainText('No refund request recorded');
  await expect(fnStatus('Denied')).toContainText('Cancellation denied');
  await expect(fnStatus('Refund pending')).toContainText('Refund pending');
  await expect(fnStatus('Refund failed')).toContainText('Refund unsuccessful');
  await expect(fnStatus('Refund completed')).toContainText('Demonstration refund completed');
  await expect(fnStatus('Refund completed')).toContainText('No money was transferred');
  for (const strName of ['Unknown', 'Missing', 'Unsupported keys', 'Conflicting', 'Unverified mode']) {
    await expect(fnStatus(strName)).toContainText('Refund status unavailable');
    await expect(fnStatus(strName)).not.toContainText('refund completed');
  }
  await expect(fnStatus('Escaped detail')).toContainText('<img src=x');
  expect(await fnStatus('Escaped detail').locator('img').count()).toBe(0);
  expect(await objPage.evaluate(() => window.bInjected)).toBeUndefined();
  await expect(objPage.getByRole('button', { name: /approve|refund|cancel/i })).toHaveCount(0);
  await objPage.goto('/order');
  await expect(objPage.getByRole('heading', { name: 'Scheduled order update' })).toHaveCount(0);
});

test('visual scheduled status examples support both themes and narrow reflow', async ({ page: objPage }) => {
  await objPage.goto('/__test/scheduled-status');
  await objPage.keyboard.press('Tab');
  await expect(objPage.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await objPage.keyboard.press('Enter');
  await expect(objPage.locator('#main-content')).toBeFocused();
  for (const strTheme of ['Light', 'Dark']) {
    await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
    await expect.poll(() => objPage.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
    expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await expect(objPage.locator('#status-examples')).toHaveScreenshot(`scheduled-status-${strTheme}.png`);
  }
  await objPage.setViewportSize({ width: 320, height: 844 });
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('ready time is required, reserved with the order, and safely reused on retry',async({page:objPage,request:objRequest})=>{
  const arrErrors=[];objPage.on('pageerror',(objError)=>arrErrors.push(objError.message));await review(objPage);
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await expect(objPage.locator('#form-error')).toContainText('Choose an available pickup time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await objPage.screenshot({path:test.info().outputPath('pickup-review.png'),fullPage:true});
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await expect(objPage.locator('#payment-pickup')).toContainText('10:20 AM');
  await expect(objPage.locator('#payment-context')).toContainText('Synthetic Guest');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$7.68');
  await objPage.getByRole('button',{name:'Continue to secure payment',exact:true}).click();await expect(objPage.locator('#order-save-status')).toContainText('pickup hold are saved');
  await expect(objPage.locator('#payment-pickup')).toContainText('Temporary unpaid hold');
  await objPage.getByRole('button',{name:'Continue to secure payment',exact:true}).click();expect((await(await objRequest.get('/__test/count')).json()).intCount).toBe(1);
  await expect(objPage.locator('#order-save-status')).toContainText('not confirmed');expect(arrErrors).toEqual([]);
});
test('a competing reservation forces explicit reselection and failed pickup requests preserve the basket',async({page:objPage,request:objRequest,baseURL:strOrigin})=>{
  await review(objPage);await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  const objCatalog=await(await objRequest.get('/api/pricing/catalog')).json();const objPickup=(await(await objRequest.get('/api/pickup-times?pizzas=6')).json()).arrOptions[0];
  const objCompeting=await objRequest.post('/api/orders',{headers:{Origin:strOrigin},data:{strRequestId:randomUUID(),strService:'carry-out',objContact:{strName:'Synthetic competitor',strPhone:'2025550100',strEmail:''},
    objPricing:{strCatalogFingerprint:objCatalog.strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:[],intQuantity:6}],arrDrinks:[],intTipPercent:0},objPickup}});expect(objCompeting.status()).toBe(201);
  await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();await objPage.getByRole('button',{name:'Continue to secure payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('no longer available');await expect(objPage.locator('#pickup-time')).toHaveValue('');
  await objPage.route('**/api/pickup-times?*',(objRoute)=>objRoute.abort());await objPage.getByRole('button',{name:'Refresh pickup times',exact:true}).click();
  await expect(objPage.locator('#pickup-status')).toContainText('selections are preserved');await expect(objPage.locator('#summary-items')).toContainText('Medium pizza');
  await objPage.unroute('**/api/pickup-times?*');await objPage.getByRole('button',{name:'Refresh pickup times',exact:true}).click();await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
});
test('an expired saved hold cannot be renewed by replay and asks for a new reviewed time',async({page:objPage,request:objRequest})=>{
  await review(objPage);await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue to secure payment',exact:true}).click();await expect(objPage.locator('#order-save-status')).toContainText('pickup hold are saved');
  await objRequest.get('/__test/expire');await objPage.getByRole('button',{name:'Continue to secure payment',exact:true}).click();
  await expect(objPage.locator('#form-error')).toContainText('previous pickup hold expired');await expect(objPage.locator('#pickup-time')).toHaveValue('');
  await expect(objPage.locator('#order-save-status')).toBeEmpty();
  await expect(objPage.locator('#payment-pickup')).toBeEmpty();
});

test('empty availability clears the previous choice and recovers without losing the basket', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  await objPage.route('**/api/pickup-times?*', (objRoute) => objRoute.fulfill({ json: {
    strTimezone: 'America/Chicago', dtCheckedAt: '2026-10-21T15:00:00.000Z', arrOptions: [],
  } }));
  await objPage.getByRole('button', { name: 'Refresh pickup times', exact: true }).click();
  await expect(objPage.locator('#pickup-status')).toContainText('No ready times are available');
  await expect(objPage.locator('#pickup-time')).toBeDisabled();
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('Choose an available pickup time');
  await expect(objPage.locator('#summary-items')).toContainText('Medium pizza');
  await objPage.unroute('**/api/pickup-times?*');
  await objPage.getByRole('button', { name: 'Refresh pickup times', exact: true }).click();
  await expect(objPage.locator('#pickup-time')).toBeEnabled();
  await expect(objPage.locator('#pickup-time')).toHaveValue('');
});

test('after cutoff offers the next open day in Central time even on a different device timezone', async ({ page: objPage, request: objRequest }) => {
  await objRequest.get('/__test/after-cutoff');
  await review(objPage);
  await expect(objPage.locator('#pickup-day')).toContainText('Thursday, October 22');
  await expect(objPage.locator('#pickup-day')).toContainText('next available service day');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#payment-pickup')).toContainText('Oct 22');
  await expect(objPage.locator('#payment-pickup')).toContainText('10:00 AM');
  await expect(objPage.locator('#payment-pickup')).toContainText('Central');
  await expect(objPage.locator('#payment-pickup')).toContainText('not a confirmed booking');
});

test('scheduling policy and recovery controls remain accessible in both themes at 320px', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.setViewportSize({ width: 320, height: 844 });
  await expect(objPage.getByRole('region', { name: 'If your plans or ingredients change' })).toContainText('admin approval');
  for (const strTheme of ['Light', 'Dark']) {
    await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
    await expect.poll(() => objPage.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
    expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(objPage.locator('[data-step="4"]')).toHaveScreenshot(`scheduling-review-${strTheme}.png`);
  }
  await objPage.getByLabel('Pickup or dine-in ready time').focus();
  await objPage.keyboard.press('Tab');
  await expect(objPage.getByRole('button', { name: 'Refresh pickup times', exact: true })).toBeFocused();
});
