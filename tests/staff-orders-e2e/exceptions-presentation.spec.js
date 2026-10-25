import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request: objRequest }) => { await objRequest.get('/__test/reset'); });

async function openCancelledOrder(objPage, objRequest) {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill('admin');
  await objPage.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await objPage.getByLabel('Authenticator code', { exact: true }).fill(await (await objRequest.get('/__test/code')).text());
  await objPage.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(objPage).toHaveURL(/\/staff\/account$/);
  await objPage.getByRole('link', { name: 'Order queue', exact: true }).click();
  await objPage.getByRole('link', { name: /Synthetic Guest 1 ·/ }).click();
  await objPage.getByLabel('Decision', { exact: true }).selectOption('cancel');
  await objPage.getByLabel('I reviewed this order and the selected decision.').check();
  await objPage.getByRole('button', { name: 'Save reviewed decision', exact: true }).click();
  await expect(objPage.locator('#admin-order-result')).toContainText('Refund review is still required');
  await objPage.getByRole('button', { name: 'Refresh order', exact: true }).click();
  await expect(objPage.locator('#refund-panel')).toBeVisible();
  await expect(objPage.locator('#refund-summary')).toContainText('State: review-required');
}

test('refund submission requires explicit approval and states the full no-fee policy', async ({ page: objPage, request: objRequest }) => {
  await openCancelledOrder(objPage, objRequest);
  let intSubmissions = 0;
  objPage.on('request', objSubmission => { if (objSubmission.url().endsWith('/refund')) intSubmissions++; });
  await expect(objPage.locator('#refund-summary')).toContainText('Full amount: $9.88');
  await expect(objPage.locator('#refund-panel')).toContainText('Refunds include items, tax and tip, without a fee deduction.');
  await objPage.getByRole('button', { name: 'Approve demo refund', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('Review and approve the full refund first.');
  await expect(objPage.locator('#refund-reviewed')).toBeFocused();
  await expect(objPage.locator('#refund-error')).toBeVisible();
  expect(intSubmissions).toBe(0);
  await expect(objPage.locator('#refund-reviewed')).not.toBeChecked();
  await expect(objPage.locator('#refund-status')).toBeEmpty();
});

test('approval rows contain their checkbox and keep the following explanation clear', async ({ page: objPage, request: objRequest }) => {
  await openCancelledOrder(objPage, objRequest);
  for (const intWidth of [1440,320]) {
    await objPage.setViewportSize({width:intWidth,height:1000});
    for (const strId of ['admin-order-reviewed','refund-reviewed']) {
      const objBounds=await objPage.locator('#'+strId).evaluate(elInput=>{
        const objInput=elInput.getBoundingClientRect();
        const objRow=elInput.parentElement.getBoundingClientRect();
        const objNext=elInput.parentElement.nextElementSibling.getBoundingClientRect();
        const objLabel=elInput.labels[0].getBoundingClientRect();
        return {numBottom:objInput.bottom,numRowBottom:objRow.bottom,numNextTop:objNext.top,numLabelHeight:objLabel.height};
      });
      expect(objBounds.numBottom).toBeLessThanOrEqual(objBounds.numRowBottom);
      expect(objBounds.numBottom).toBeLessThanOrEqual(objBounds.numNextTop);
      expect(objBounds.numLabelHeight).toBeGreaterThanOrEqual(44);
    }
  }
});

test('persisted pending refunds disable approval and never appear completed to the guest', async ({ page: objPage, request: objRequest }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  await openCancelledOrder(objPage, objRequest);
  expect((await objRequest.get('/__test/refund-pending')).ok()).toBe(true);
  await objPage.reload();
  await expect(objPage.locator('#refund-summary')).toContainText('State: pending');
  await expect(objPage.locator('#refund-summary')).toContainText('Recorded net: $9.88');
  await expect(objPage.getByRole('button', { name: 'Approve demo refund', exact: true })).toBeDisabled();
  await objPage.getByRole('button', { name: 'Refresh order', exact: true }).click();
  await expect(objPage.locator('#orders-status')).toContainText('Order refreshed.');
  await expect(objPage.getByRole('button', { name: 'Approve demo refund', exact: true })).toBeDisabled();
  await objPage.goto(arrPaths[0]);
  await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund pending reconciliation.');
  await expect(objPage.locator('#tracking-content')).not.toContainText('refund completed');
  await expect(objPage.locator('#tracking-content')).toContainText('outstanding case');
});

for (const strExpiry of ['before submission', 'during submission']) {
  test(`refund ${strExpiry} session expiry removes private details and financial controls`, async ({ page: objPage, request: objRequest }) => {
    await openCancelledOrder(objPage, objRequest);
    await objPage.getByLabel('I approve the full demonstration refund.', { exact: true }).check();
    if (strExpiry === 'before submission') await objRequest.get('/__test/expire');
    else await objPage.route('**/api/staff/orders/*/refund', async objRoute => {
      await objRequest.get('/__test/expire');
      await objRoute.continue();
    });
    await objPage.getByRole('button', { name: 'Approve demo refund', exact: true }).click();
    await expect(objPage.getByRole('link', { name: 'Sign in again', exact: true })).toBeVisible();
    await expect(objPage.locator('#orders-content')).toBeEmpty();
    await expect(objPage.locator('#refund-panel')).toBeEmpty();
    await expect(objPage.getByRole('button', { name: /Approve demo refund|Check refund result/ })).toHaveCount(0);
    await expect(objPage.getByRole('alert')).toContainText(/session.*sign in again/i);
    expect((await objPage.request.get('/api/staff/orders')).status()).toBe(401);
  });
}
