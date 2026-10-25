import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function chooseScenario(objContext, strScenario) {
  await objContext.addCookies([{ name: 'availability', value: strScenario, url: 'http://127.0.0.1:3000' }]);
}

async function checkAccessible(objPage) {
  // Bootstrap buttons transition between theme colors; audit the settled state.
  await objPage.evaluate(() => Promise.all(document.getAnimations().map((objAnimation) => objAnimation.finished.catch(() => {}))));
  const objResult = await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResult.violations).toEqual([]);
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('unavailable topping is explained and other pizzas remain editable', async ({ page: objPage, context: objContext }) => {
  await chooseScenario(objContext, 'topping');
  await objPage.goto('/order');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('checkbox', { name: 'Pepperoni Currently unavailable' })).toBeDisabled();
  await objPage.getByLabel('Onion', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.getByLabel('Order summary')).toContainText('Onion');
  await objPage.getByRole('button', { name: 'Edit pizza 1' }).click();
  await expect(objPage.getByLabel('Onion', { exact: true })).toBeChecked();
  await checkAccessible(objPage);
  await expect(objPage).toHaveScreenshot('unavailable-topping.png', { fullPage: true, animations: 'disabled' });
  await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('Dark', { exact: true }).click();
  await checkAccessible(objPage);
  await expect(objPage).toHaveScreenshot('unavailable-topping-dark.png', { fullPage: true, animations: 'disabled' });
});

test('required base blocks adding pizzas without losing draft choices', async ({ page: objPage, context: objContext }) => {
  await chooseScenario(objContext, 'base');
  await objPage.goto('/order');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Onion', { exact: true }).check();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('required ingredient');
  await expect(objPage.getByLabel('Onion', { exact: true })).toBeChecked();
  await expect(objPage.getByRole('button', { name: 'Add pizza', exact: true })).toBeFocused();
  await expect(objPage.getByLabel('Order summary')).toContainText('Your order is empty');
  await checkAccessible(objPage);
  await expect(objPage).toHaveScreenshot('unavailable-base.png', { fullPage: true, animations: 'disabled' });
});

test('unavailable regular crust leaves New York crust usable', async ({ page: objPage, context: objContext }) => {
  await chooseScenario(objContext, 'crust');
  await objPage.goto('/order');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('radio', { name: 'Regular Currently unavailable' })).toBeDisabled();
  await expect(objPage.getByLabel('New York-style')).toBeChecked();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await expect(objPage.getByLabel('Order summary')).toContainText('New York-style');
  await checkAccessible(objPage);
});

test('unknown availability preserves order but blocks checkout', async ({ page: objPage, context: objContext }) => {
  await chooseScenario(objContext, 'unknown');
  await objPage.goto('/order');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.getByRole('status').filter({ hasText: 'confirm ingredient availability' })).toBeVisible();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Your name').fill('Test Guest');
  await objPage.getByLabel('Phone number').fill('9315550100');
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('confirm ingredient availability');
  await expect(objPage.getByLabel('Order summary')).toContainText('$7.00');
  await checkAccessible(objPage);
});

for (const intStatus of [404, 500]) {
  test(`branded ${intStatus} error has safe recovery, themes and no indexing`, async ({ page: objPage, context: objContext }) => {
    if (intStatus === 500) await chooseScenario(objContext, 'error');
    const objResponse = await objPage.goto(intStatus === 404 ? '/missing-page' : '/order');
    expect(objResponse.status()).toBe(intStatus);
    expect(objResponse.headers()['x-robots-tag']).toBe('noindex');
    expect(objResponse.headers()['cache-control']).toBe('no-store');
    await expect(objPage.locator('body')).not.toContainText('PRIVATE_TEST_ERROR');
    await checkAccessible(objPage);
    await expect(objPage).toHaveScreenshot(`error-${intStatus}.png`, { fullPage: true, animations: 'disabled' });
    await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('Dark', { exact: true }).click();
    await checkAccessible(objPage);
    await expect(objPage).toHaveScreenshot(`error-${intStatus}-dark.png`, { fullPage: true, animations: 'disabled' });
    await objPage.getByRole('link', { name: 'Skip to main content' }).focus();
    await objPage.keyboard.press('Enter');
    await expect(objPage.locator('main')).toBeFocused();
    await objPage.getByRole('link', { name: 'Explore the menu' }).click();
    await expect(objPage).toHaveURL('/menu');
  });
}
