import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('menu edits reach a separate customer session without discarding its draft', async ({ page: objOwner, browser: objBrowser, request: objRequest, baseURL: strBaseUrl }) => {
  await objRequest.get('/__test/reset');
  const objCustomerContext = await objBrowser.newContext({ baseURL: strBaseUrl, ignoreHTTPSErrors: true, viewport: objOwner.viewportSize() });
  const objCustomer = await objCustomerContext.newPage();
  try {
    await objCustomer.goto('/order');
    await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await objCustomer.getByLabel('Pepperoni', { exact: true }).check();
    await objCustomer.getByLabel('Onion', { exact: true }).check();
    await objCustomer.getByRole('button', { name: 'Add pizza', exact: true }).click();
    await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await objCustomer.getByLabel('Your name').fill('Synthetic Menu Guest');
    await objCustomer.getByLabel('Phone number').fill('2025550100');
    await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(objCustomer.locator('#server-totals')).toContainText('$12.07');

    await objOwner.goto('/staff/sign-in');
    await objOwner.getByLabel('Username', { exact: true }).fill('owner');
    await objOwner.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
    await objOwner.getByRole('button', { name: 'Sign in', exact: true }).click();
    await objOwner.getByLabel('Authenticator code', { exact: true }).fill(await (await objRequest.get('/__test/code?secret=owner')).text());
    await objOwner.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(objOwner).toHaveURL(/\/staff\/account$/);
    await objOwner.goto('/staff/menu');
    await objOwner.locator('#base-medium').fill('8.25');
    await objOwner.getByRole('button', { name: 'Publish reviewed prices', exact: true }).click();
    await expect(objOwner.locator('#menu-status')).toContainText('Saved.');
    await objOwner.getByRole('button', { name: 'Mark Pepperoni unavailable', exact: true }).click();
    await expect(objOwner.locator('#menu-status')).toContainText('Saved.');

    // The dedicated menu follows published prices; home stays a welcome page.
    const objMenuPage = await objCustomerContext.newPage();
    for (const strPath of ['/menu']) {
      await objMenuPage.goto(strPath);
      await expect(objMenuPage.getByRole('table', {name:'Pizza sizes and prices'})).toContainText('$8.25');
      await expect(objMenuPage.getByRole('list', {name:'Pizza toppings'}).getByRole('listitem').filter({hasText:'Pepperoni'})).toContainText('Currently unavailable');
    }
    await objMenuPage.goto('/');
    await expect(objMenuPage.getByRole('table')).toHaveCount(0);
    await expect(objMenuPage.getByRole('link', {name:'Explore the full menu',exact:true})).toHaveAttribute('href','/menu');
    await objMenuPage.close();

    await objCustomer.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(objCustomer.getByRole('alert')).toContainText('menu changed');
    await expect(objCustomer.locator('#server-totals')).toBeHidden();
    await objCustomer.getByRole('button', { name: 'Edit pizzas', exact: true }).click();
    await objCustomer.getByRole('button', { name: 'Edit pizza 1', exact: true }).click();
    await objCustomer.getByRole('checkbox', { name: /Pepperoni/ }).uncheck();
    await expect(objCustomer.getByLabel('Onion', { exact: true })).toBeChecked();
    await objCustomer.getByRole('button', { name: 'Save pizza', exact: true }).click();
    for (let intStep = 0; intStep < 3; intStep += 1) await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(objCustomer.locator('#server-totals')).toContainText('$11.25');
    await expect(objCustomer.locator('#order-review')).toContainText('Onion');
    await expect(objCustomer.locator('#order-review')).not.toContainText('Pepperoni');
    await expect(objCustomer.locator('#order-review')).toContainText('Synthetic Menu Guest');
    for (const strTheme of ['Light', 'Dark']) {
      await objCustomer.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
      await expect.poll(() => objCustomer.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
      expect((await new AxeBuilder({ page: objCustomer }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await expect(objCustomer).toHaveScreenshot(`menu-customer-review-${strTheme}.png`, { fullPage: true });
    }
    objCustomer.once('dialog', objDialog => objDialog.accept()); // Explicitly discard this completed review draft.
    await objCustomer.goto('/order');
    await objCustomer.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(objCustomer.getByRole('checkbox', { name: /Pepperoni Currently unavailable/ })).toBeDisabled();
    await expect(objCustomer.getByLabel('Onion', { exact: true })).toBeEnabled();
  } finally {
    await objCustomerContext.close();
  }
});
