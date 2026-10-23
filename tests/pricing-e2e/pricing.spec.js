import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function review(objPage) {
  await objPage.goto('/order');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('radio', { name: /Large/ }).check();
  await objPage.getByRole('checkbox', { name: 'Pepperoni', exact: true }).check();
  await objPage.getByRole('checkbox', { name: 'Sausage', exact: true }).check();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Medium Coca-Cola quantity', { exact: false }).fill('1');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Your name').fill('Synthetic Guest'); await objPage.getByLabel('Phone number').fill('9315550100');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$18.66');
}
test.beforeEach(async ({ request: objRequest }) => { await objRequest.get('/__test/reset'); });

async function tabTo(objPage, objTarget) {
  for (let intTab = 0; intTab < 80; intTab += 1) {
    if (await objTarget.evaluate((elElement) => elElement === document.activeElement)) return;
    await objPage.keyboard.press('Tab');
  }
  await expect(objTarget).toBeFocused();
}

for (const strService of ['Carry-out', 'Dine-in']) {
  test(`keyboard pricing review preserves ${strService} selections and requires tip confirmation`, async ({ page: objPage }) => {
    await objPage.goto('/order');
    if (strService === 'Dine-in') {
      await tabTo(objPage, objPage.getByRole('radio', { name: 'Carry-out', exact: true }));
      await objPage.keyboard.press('ArrowRight');
      await expect(objPage.getByRole('radio', { name: 'Dine-in', exact: true })).toBeChecked();
    }
    const objContinue = objPage.getByRole('button', { name: 'Continue', exact: true });
    await tabTo(objPage, objContinue); await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#pizza-title')).toBeFocused();
    await tabTo(objPage, objPage.getByRole('button', { name: 'Add pizza', exact: true }));
    await objPage.keyboard.press('Enter');
    await tabTo(objPage, objContinue); await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#drinks-title')).toBeFocused();
    await tabTo(objPage, objContinue); await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#details-title')).toBeFocused();
    await tabTo(objPage, objPage.getByLabel('Your name'));
    await objPage.keyboard.type('Synthetic Keyboard Guest');
    if (strService === 'Carry-out') {
      await tabTo(objPage, objPage.getByLabel('Phone number'));
      await objPage.keyboard.type('9315550100');
    }
    await tabTo(objPage, objContinue); await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#review-title')).toBeFocused();
    await expect(objPage.locator('#server-totals')).toContainText('$7.68');
    await tabTo(objPage, objPage.getByLabel('Optional tip percentage'));
    await objPage.keyboard.press('ControlOrMeta+A'); await objPage.keyboard.type('10');
    const objPayment = objPage.getByRole('button', { name: 'Continue to payment', exact: true });
    await tabTo(objPage, objPayment); await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#server-totals')).toContainText('$8.45');
    await expect(objPage.getByRole('alert')).toContainText('confirm');
    await expect(objPage.locator('#order-review')).toContainText(strService);
    await expect(objPayment).toBeEnabled();
    await expect(objPayment).toBeFocused();
    await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#payment-title')).toBeFocused();
    await tabTo(objPage, objPage.getByRole('button', { name: 'Back', exact: true }));
    await objPage.keyboard.press('Enter');
    await expect(objPage.locator('#review-title')).toBeFocused();
    await expect(objPage.getByLabel('Optional tip percentage')).toHaveValue('10');
    await expect(objPage.locator('#server-totals')).toContainText('$8.45');
  });
}

test('payment summary uses current contact, items and authoritative totals after edits', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#payment-context')).toContainText('Carry-out');
  await expect(objPage.locator('#payment-context')).toContainText('Synthetic Guest');
  await expect(objPage.locator('#payment-context')).toContainText('9315550100');
  await expect(objPage.locator('#payment-items')).toContainText('Large pizza');
  await expect(objPage.locator('#payment-items')).toContainText('$15.00');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$1.66');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$18.66');
  await objPage.getByRole('button', { name: 'Edit order review', exact: true }).click();
  await objPage.getByRole('button', { name: 'Edit contact details', exact: true }).click();
  await objPage.getByLabel('Your name').fill('Revised <guest>');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toBeVisible();
  await objPage.getByRole('button', { name: 'Edit pizzas', exact: true }).click();
  await objPage.getByRole('button', { name: 'Edit pizza 1', exact: true }).click();
  await objPage.getByRole('radio', { name: /Small/ }).check();
  await objPage.getByRole('button', { name: 'Save pizza', exact: true }).click();
  for (let intStep = 0; intStep < 3; intStep++) await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$9.88');
  await objPage.getByLabel('Optional tip percentage').fill('10');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$10.87');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#payment-context')).toContainText('Revised <guest>');
  await expect(objPage.locator('#payment-context').locator('guest')).toHaveCount(0);
  await expect(objPage.locator('#payment-items')).toContainText('Small pizza');
  await expect(objPage.locator('#payment-items')).not.toContainText('Large pizza');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$0.88');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$0.99');
  await expect(objPage.locator('#payment-breakdown')).toContainText('$10.87');
});

test('visual payment summary in both themes is accessible and reflows at 320px', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  for (const strTheme of ['Light', 'Dark']) {
    await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
    await expect.poll(() => objPage.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
    expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await expect(objPage.locator('[data-step="5"]')).toHaveScreenshot(`payment-summary-${strTheme}.png`);
  }
  await objPage.setViewportSize({ width: 320, height: 844 });
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await objPage.getByRole('button', { name: 'Edit order review', exact: true }).focus();
  await objPage.keyboard.press('Enter');
  await expect(objPage.getByRole('heading', { name: 'Looking delicious.', exact: true })).toBeFocused();
});

test('payment summary withdraws stale prices after failed or changed authoritative checks', async ({ page: objPage, request: objRequest }) => {
  await review(objPage);
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await objPage.route('**/api/pricing/preview', (objRoute) => objRoute.abort());
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.locator('#payment-breakdown')).toBeHidden();
  await expect(objPage.locator('#payment-items')).toBeEmpty();
  await expect(objPage.locator('#payment-subtotal')).toHaveText('Review required');
  await objPage.unroute('**/api/pricing/preview');
  await objRequest.get('/__test/price');
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await expect(objPage.locator('#payment-breakdown')).toBeHidden();
  await expect(objPage.locator('#payment-subtotal')).toHaveText('Review required');
});
test('database-priced order, tax, after-tax tip, explicit review and payment preservation', async ({ page: objPage }) => {
  const arrErrors = []; objPage.on('pageerror', (objError) => arrErrors.push(objError.message));
  await review(objPage);
  await objPage.getByLabel('Optional tip percentage').fill('10');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$20.53');
  await expect(objPage.getByRole('heading', { name: 'Looking delicious.', exact: true })).toBeVisible();
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#payment-total')).toContainText('$20.53');
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('Your selections are still here');
  expect(arrErrors).toEqual([]);
});
test('changed database prices require another explicit review; unavailable items cannot proceed', async ({ page: objPage, request: objRequest }) => {
  await review(objPage); await objRequest.get('/__test/price');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await expect(objPage.getByRole('button', { name: 'Continue to payment', exact: true })).toBeVisible();
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$19.76');
  await expect(objPage.locator('#form-error')).toContainText('confirm');
  await objRequest.get('/__test/unavailable');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('unavailable');
  await expect(objPage.locator('#summary-items')).toContainText('Large pizza');
});
test('network failures retain the basket, retry recovers, and six/ten aggregate caps apply', async ({ page: objPage }) => {
  await review(objPage);
  await objPage.route('**/api/pricing/preview', (objRoute) => objRoute.abort());
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('selections are saved');
  await expect(objPage.locator('#server-totals')).toBeHidden();
  await objPage.unroute('**/api/pricing/preview');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$18.66');
  await objPage.getByRole('button', { name: 'Edit drinks', exact: true }).click();
  await objPage.getByLabel('Medium Coca-Cola quantity', { exact: false }).fill('6');
  await objPage.getByLabel('Small Sprite quantity', { exact: false }).fill('6');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('ten drinks');
  await objPage.getByRole('button', { name: 'Back', exact: true }).click();
  await objPage.getByLabel('Pizza quantity').fill('6'); await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('six pizzas');
});
test('pricing API rejects forged totals and preserves no-store semantics', async ({ request: objRequest }) => {
  const objResponse = await objRequest.get('/api/pricing/catalog'); expect(objResponse.headers()['cache-control']).toBe('no-store');
  const objCatalog = await objResponse.json();
  const objInput = { strCatalogFingerprint: objCatalog.strFingerprint, arrPizzas: [{ strSize: 'small', strCrust: 'regular', arrToppings: [], intQuantity: 1 }], arrDrinks: [], intTipPercent: 0 };
  expect((await objRequest.post('/api/pricing/preview', { data: { ...objInput, centsTotal: 1 } })).status()).toBe(422);
  const objPrice = await (await objRequest.post('/api/pricing/preview', { data: objInput })).json(); expect(objPrice.centsTotal).toBe(549);
  expect((await objRequest.post('/api/pricing/preview', { data: 'x'.repeat(9000), headers: { 'Content-Type': 'application/json' } })).status()).toBe(413);
});
test('visual priced review in both themes and 320px reflow', async ({ page: objPage }, objInfo) => {
  await review(objPage);
  for (const strTheme of ['Light', 'Dark']) {
    await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
    await expect.poll(() => objPage.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
    expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await objPage.screenshot({ path: objInfo.outputPath(`review-${strTheme}.png`), fullPage: true });
    await expect.soft(objPage).toHaveScreenshot(`priced-review-${strTheme}.png`, { fullPage: true });
  }
  await objPage.setViewportSize({ width: 320, height: 844 });
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an unavailable selected topping can be removed without losing the rest of the order', async ({ page: objPage, request: objRequest }) => {
  await review(objPage); await objRequest.get('/__test/topping');
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('menu changed');
  await objPage.getByRole('button', { name: 'Edit pizzas', exact: true }).click();
  await objPage.getByRole('button', { name: 'Edit pizza 1', exact: true }).click();
  await objPage.getByRole('checkbox', { name: 'Pepperoni', exact: true }).uncheck();
  await objPage.getByRole('button', { name: 'Save pizza', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toContainText('$15.37');
  await expect(objPage.locator('#order-review')).toContainText('Sausage');
  await expect(objPage.locator('#order-review')).not.toContainText('Pepperoni');
});
