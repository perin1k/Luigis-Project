import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function checkStep(objPage) {
  const objResults = await new AxeBuilder({ page: objPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResults.violations).toEqual([]);
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function addPizza(objPage) {
  await objPage.getByLabel('Large · 18 inch').check();
  await objPage.getByLabel('Pepperoni', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
}

async function expectVisual(objPage, strFilename) {
  // Capture a consistent neutral pointer and scroll state after native focus moves.
  await objPage.mouse.move(0, 0);
  await objPage.evaluate(() => new Promise((fnResolve) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(fnResolve));
  }));
  await expect(objPage).toHaveScreenshot(strFilename, { fullPage: true, animations: 'disabled' });
}

test('carry-out journey preserves edits and reaches secure checkout presentation', async ({ page: objPage }) => {
  const arrSubmissions = [];
  objPage.on('request', (objRequest) => {
    if (objRequest.method() !== 'GET') arrSubmissions.push(objRequest.url());
  });
  await objPage.goto('/order');
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('heading', { name: 'Build something delicious.' })).toBeFocused();
  await addPizza(objPage);
  await expect(objPage.getByLabel('Order summary')).toContainText('$12.00');
  await objPage.getByRole('button', { name: 'Edit pizza 1' }).click();
  await objPage.getByLabel('New York-style').check();
  await objPage.getByRole('button', { name: 'Save pizza' }).click();
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Large iced tea quantity').fill('2');
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Your name')).toBeFocused();
  await objPage.getByLabel('Your name').fill('Test Customer');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Phone number')).toBeFocused();
  await objPage.getByLabel('Phone number').fill('3125550100');
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Order review')).toContainText('New York-style');
  await expect(objPage.getByLabel('Order review')).toContainText('$18.00');
  await objPage.getByRole('button', { name: 'Edit contact details' }).click();
  await expect(objPage.getByLabel('Your name')).toHaveValue('Test Customer');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue to payment' }).click();
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue to secure payment' }).click();
  await expect(objPage.getByRole('alert')).toContainText('We couldn’t open secure checkout');
  await objPage.getByLabel('Apple Pay', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Continue with Apple Pay' }).click();
  await expect(objPage.getByRole('alert')).toContainText('Your selections are still here');
  await checkStep(objPage);
  expect(arrSubmissions).toEqual([]);
  await expect(objPage.locator('input[autocomplete="cc-number"]')).toHaveCount(0);
  await objPage.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(objPage.getByLabel('Order review')).toContainText('Test Customer');
});

test('dine-in needs a name, supports multiple pizzas, removal and service changes', async ({ page: objPage }) => {
  await objPage.goto('/order');
  await objPage.getByLabel('Dine-in', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('Add at least one pizza');
  await addPizza(objPage);
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.getByRole('button', { name: 'Remove pizza 2' })).toBeVisible();
  await objPage.getByRole('button', { name: 'Remove pizza 1' }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Phone number')).toBeHidden();
  await objPage.getByLabel('Your name').fill('Dine In Guest');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Order review')).toContainText('Dine-in');
  await objPage.getByRole('button', { name: 'Edit service' }).click();
  await objPage.getByLabel('Carry-out', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Phone number')).toBeVisible();
});

test('pizza quantities, editing cancellation, and keyboard controls remain usable', async ({ page: objPage }) => {
  await objPage.goto('/order');
  const elCarryOut = objPage.getByRole('radio', { name: 'Carry-out', exact: true });
  await elCarryOut.focus();
  await objPage.keyboard.press('ArrowDown');
  await expect(objPage.getByRole('radio', { name: 'Dine-in', exact: true })).toBeChecked();
  await objPage.keyboard.press('Tab');
  await expect(objPage.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  await objPage.keyboard.press('Enter');
  await objPage.getByLabel('Pizza quantity').fill('0');
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.getByLabel('Pizza quantity')).toBeFocused();
  await expect(objPage.getByRole('alert')).toContainText('whole-number');
  await objPage.getByLabel('Pizza quantity').fill('2');
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await objPage.getByRole('button', { name: 'Edit pizza 1' }).click();
  await objPage.getByLabel('Small · 12 inch').check();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('Save your pizza changes');
  await objPage.getByRole('button', { name: 'Cancel editing' }).click();
  await expect(objPage.getByLabel('Order summary')).toContainText('$14.00');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Small iced tea quantity').fill('-1');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Small iced tea quantity')).toBeFocused();
  await objPage.getByLabel('Small iced tea quantity').fill('0');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Your name').fill('<img src=x onerror=alert(1)>');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByLabel('Order review')).toContainText('<img src=x onerror=alert(1)>');
  await expect(objPage.getByLabel('Order review').locator('img')).toHaveCount(0);
});

test('ordering visual service and checkout screens', async ({ page: objPage }) => {
  await objPage.goto('/order');
  await expectVisual(objPage, 'order-service.png');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await addPizza(objPage);
  await expectVisual(objPage, 'order-builder.png');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expectVisual(objPage, 'order-drinks.png');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expectVisual(objPage, 'order-details.png');
  await objPage.getByLabel('Your name').fill('Test Guest');
  await objPage.getByLabel('Phone number').fill('3125550100');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expectVisual(objPage, 'order-review.png');
  await objPage.getByRole('button', { name: 'Continue to payment' }).click();
  await expectVisual(objPage, 'order-checkout.png');
  await objPage.getByRole('button', { name: 'Continue to secure payment' }).click();
  await expect(objPage.getByRole('alert')).toBeVisible();
  await expectVisual(objPage, 'order-checkout-error.png');
});

test('ordering reflows at 320 CSS pixels including checkout actions', async ({ page: objPage }) => {
  await objPage.setViewportSize({ width: 320, height: 800 });
  await objPage.goto('/order');
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await addPizza(objPage);
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Your name').fill('Test Guest');
  await objPage.getByLabel('Phone number').fill('3125550100');
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await checkStep(objPage);
  await objPage.getByRole('button', { name: 'Continue to payment' }).click();
  await checkStep(objPage);
});
