import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function details(objPage, bDineIn) {
  await objPage.goto('/order');
  if (bDineIn) await objPage.getByRole('radio', { name: /Dine-in/ }).check();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await objPage.getByLabel('Your name').fill('Synthetic Guest');
}
async function payment(objPage) {
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#server-totals')).toBeVisible();
  await objPage.getByRole('button', { name: 'Continue to payment', exact: true }).click();
}
test('carry-out retries a lost response without duplicating a saved unpaid order', async ({ page: objPage, request: objRequest }) => {
  const intBefore = (await (await objRequest.get('/__test/count')).json()).intCount;
  await details(objPage, false); await objPage.getByLabel('Phone number').fill('2025550100'); await payment(objPage);
  let strFirstRequest;
  await objPage.route('**/api/orders', async (objRoute) => { strFirstRequest = objRoute.request().postDataJSON().strRequestId; await objRoute.fetch(); await objRoute.abort(); });
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('retry to safely check');
  await objPage.unroute('**/api/orders');
  const pReplay = objPage.waitForRequest('**/api/orders');
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  expect((await pReplay).postDataJSON().strRequestId).toBe(strFirstRequest);
  await expect(objPage.locator('#order-save-status')).toContainText('not confirmed');
  await expect(objPage.locator('#form-error')).toContainText('Your selections are still here');
  expect((await (await objRequest.get('/__test/count')).json()).intCount).toBe(intBefore + 1);
  expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await objPage.screenshot({ path: test.info().outputPath('saved-unpaid.png'), fullPage: true });
});
test('dine-in requires contact, accepts email, and preserves it through review and save', async ({ page: objPage }) => {
  const arrErrors = []; objPage.on('pageerror', (objError) => arrErrors.push(objError.message));
  await details(objPage, true);
  await objPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(objPage.locator('#form-error')).toContainText('phone number or email');
  await objPage.getByLabel('Email address').fill('guest@example.invalid');
  expect((await new AxeBuilder({ page: objPage }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await objPage.screenshot({ path: test.info().outputPath('dine-in-details.png'), fullPage: true });
  await payment(objPage);
  await objPage.getByRole('button', { name: 'Continue to secure payment', exact: true }).click();
  await expect(objPage.locator('#order-save-status')).toContainText('not confirmed');
  expect(arrErrors).toEqual([]);
});
