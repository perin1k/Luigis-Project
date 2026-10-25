import { test as base, expect } from '@playwright/test';

// Independent staff/customer sessions still use the same real disposable database.
const test = base.extend({
  objStaffPage: async ({ browser: objBrowser, baseURL: strBaseURL }, fnUse) => {
    const objContext = await objBrowser.newContext({ baseURL: strBaseURL, ignoreHTTPSErrors: true });
    try { await fnUse(await objContext.newPage()); } finally { await objContext.close(); }
  },
});
test.use({ timezoneId: 'Pacific/Honolulu' });
test.beforeEach(async ({ request: objRequest }) => { await objRequest.get('/__test/reset'); });

async function signInAdmin(objPage, objRequest) {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill('admin');
  await objPage.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await objPage.getByLabel('Authenticator code', { exact: true }).fill(await (await objRequest.get('/__test/code')).text());
  await objPage.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(objPage).toHaveURL(/\/staff\/account$/);
  await objPage.getByRole('link', { name: 'Order queue', exact: true }).click();
  await objPage.getByRole('link', { name: /Synthetic Guest 2 ·/ }).click();
}

async function advance(objPage, arrStatuses) {
  for (const strStatus of arrStatuses) {
    await objPage.getByRole('button', { name: `Mark ${strStatus}`, exact: true }).click();
    await expect(objPage.locator('#orders-status')).toContainText(`Saved: ${strStatus}`);
    await objPage.getByRole('button', { name: 'Refresh order', exact: true }).click();
    await expect(objPage.locator('#detail-summary')).toContainText(strStatus);
  }
}

async function decide(objPage, strAction) {
  await objPage.getByLabel('Decision', { exact: true }).selectOption(strAction);
  await objPage.getByLabel('I reviewed this order and the selected decision.').check();
  await objPage.getByRole('button', { name: 'Save reviewed decision', exact: true }).click();
  await expect(objPage.locator('#admin-order-result')).toContainText(
    strAction === 'cancel' ? 'Order cancelled. Refund review is still required.' : 'Decision saved',
  );
  await objPage.getByRole('button', { name: 'Refresh order', exact: true }).click();
}

test('scheduled inventory review connects approved refund, private tracking, previews and Owner ledger', async ({ page: objPage, request: objRequest, objStaffPage, browser: objBrowser, baseURL: strBaseURL }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  const objOwnerContext = await objBrowser.newContext({ baseURL: strBaseURL, ignoreHTTPSErrors: true });
  try {
    const objOwnerPage = await objOwnerContext.newPage();
    await objOwnerPage.goto('/staff/sign-in');
    await objOwnerPage.getByLabel('Username', { exact: true }).fill('owner');
    await objOwnerPage.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
    await objOwnerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await objOwnerPage.getByLabel('Authenticator code', { exact: true }).fill(await (await objRequest.get('/__test/code?secret=owner')).text());
    await objOwnerPage.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(objOwnerPage).toHaveURL(/\/staff\/account$/);
    const strReport = '/api/staff/analytics?from=2026-10-21&to=2026-10-21';
    const objBefore = await (await objOwnerPage.request.get(strReport)).json();

    await signInAdmin(objStaffPage, objRequest);
    const strDetailPath = new URL(objStaffPage.url()).pathname;
    await objStaffPage.goto('/staff/menu');
    await objStaffPage.getByRole('button', { name: 'Mark Pepperoni unavailable', exact: true }).click();
    await expect(objStaffPage.locator('#menu-status')).toContainText('Saved.');
    await objStaffPage.goto(strDetailPath);
    await expect(objStaffPage.getByRole('button', { name: 'Mark Preparing', exact: true })).toBeDisabled();
    await objPage.goto(arrPaths[1]);
    await expect(objPage.locator('#tracking-content')).toContainText('An ingredient needed for your order is unavailable');
    await expect(objPage.locator('#tracking-content')).not.toContainText('Pepperoni');
    await expect(objPage.locator('#tracking-content')).not.toContainText('refund completed');

    await decide(objStaffPage, 'cancel');
    await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
    await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund awaiting team review.');
    await objStaffPage.getByLabel('I approve the full demonstration refund.', { exact: true }).check();
    await objStaffPage.getByRole('button', { name: 'Approve demo refund', exact: true }).click();
    await expect(objStaffPage.locator('#refund-status')).toContainText('refund completed');
    await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
    await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund completed. No money was transferred.');

    await objRequest.get('/__test/preview-process');
    await objStaffPage.getByText('Internal notification previews', { exact: true }).click();
    await expect(objStaffPage.locator('#notification-status')).toHaveText('Previews refreshed.');
    await expect(objStaffPage.locator('#notification-list')).toContainText('refund');
    await expect(objStaffPage.locator('#notification-list > li')).toHaveCount(6);
    for (const elPreview of await objStaffPage.locator('#notification-list > li').all()) {
      await expect(elPreview).toContainText('Nothing was sent or delivered.');
      await expect(elPreview).toContainText('Generation: previewed');
    }
    const objAfter = await (await objOwnerPage.request.get(strReport)).json();
    expect(objAfter.objPeriod.centsRefunds).toBeGreaterThan(objBefore.objPeriod.centsRefunds);
    expect(objBefore.objPeriod.centsNetRecorded - objAfter.objPeriod.centsNetRecorded).toBe(objAfter.objPeriod.centsRefunds - objBefore.objPeriod.centsRefunds);
    expect(objAfter.objPickup.intCompletedOrders).toBe(0);
    expect(objAfter.objPickup.arrDates[0].intCancelled).toBe(objBefore.objPickup.arrDates[0].intCancelled + 1);
  } finally { await objOwnerContext.close(); }
});

test('customer refresh preserves stale progress on network failure and clears unavailable private data', async ({ page: objPage, request: objRequest }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  await objPage.goto(arrPaths[1]);
  await expect(objPage.locator('#tracking-content')).toContainText('Ready time:');
  await expect(objPage.locator('#tracking-content')).toContainText('2:00 PM Central');
  await objPage.route('**/api/tracking', objRoute => objRoute.abort());
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('may be out of date');
  await expect(objPage.getByRole('heading', { name: 'Received', exact: true })).toBeVisible();
  await expect(objPage.locator('#cancellation-panel')).toBeHidden();
  await expect(objPage.locator('#tracking-content')).not.toHaveAttribute('aria-busy', 'true');
  await objPage.unroute('**/api/tracking');
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.locator('#tracking-status')).toHaveText('Progress refreshed.');
  await expect(objPage.locator('#cancellation-panel')).toBeVisible();
  // Inject a server-unavailable-grant response; actual expiry/revocation is service-tested.
  await objPage.route('**/api/tracking', objRoute => objRoute.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.getByRole('alert')).toContainText('Ask the team for help');
  await expect(objPage.locator('#tracking-content')).toBeEmpty();
  await expect(objPage.locator('#cancellation-panel')).toBeHidden();
});

test('customer sees genuine Ready and Completed outcomes with original Central timing', async ({ page: objPage, request: objRequest, objStaffPage }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  await signInAdmin(objStaffPage, objRequest);
  await advance(objStaffPage, ['Preparing', 'Baking', 'Ready']);
  await objPage.goto(arrPaths[1]);
  await expect(objPage.getByRole('heading', { name: 'Ready', exact: true })).toBeVisible();
  await expect(objPage.locator('#tracking-content')).toContainText('2:00 PM Central');
  await expect(objPage.locator('#cancellation-panel')).toBeHidden();
  await advance(objStaffPage, ['Completed']);
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.getByRole('heading', { name: 'Completed', exact: true })).toBeVisible();
  await expect(objPage.locator('#tracking-content')).toContainText('Original ready time:');
  await expect(objPage.locator('#tracking-content ol li')).toHaveCount(5);
  await expect(objPage.locator('#tracking-content')).not.toContainText('Synthetic Guest');
  await expect(objPage.locator('#tracking-content')).not.toContainText('refund completed');
});

test('customer sees a genuine prepared no-show without an automatic refund', async ({ page: objPage, request: objRequest, objStaffPage }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  await signInAdmin(objStaffPage, objRequest);
  await advance(objStaffPage, ['Preparing', 'Baking', 'Ready']);
  await objRequest.get('/__test/closing');
  // Advancing the clock expires the old session; require fresh password and MFA.
  await signInAdmin(objStaffPage, objRequest);
  await decide(objStaffPage, 'not-collected');
  await objPage.goto(arrPaths[1]);
  await expect(objPage.getByRole('heading', { name: 'Not collected', exact: true })).toBeVisible();
  await expect(objPage.locator('#tracking-content')).toContainText('Original ready time:');
  await expect(objPage.locator('#tracking-content')).not.toContainText('refund');
  await expect(objPage.locator('#cancellation-panel')).toBeHidden();
});

test('customer distinguishes approved cancellation, failed refund and confirmed demonstration refund', async ({ page: objPage, request: objRequest, objStaffPage }) => {
  const arrPaths = await (await objRequest.get('/__test/tracking')).json();
  await signInAdmin(objStaffPage, objRequest);
  await decide(objStaffPage, 'cancel');
  await objPage.goto(arrPaths[1]);
  await expect(objPage.getByRole('heading', { name: 'Cancelled', exact: true })).toBeVisible();
  await expect(objPage.locator('#tracking-content')).toContainText('Refund processing is a separate step.');
  await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund awaiting team review.');
  await expect(objPage.locator('#cancellation-panel')).toBeHidden();
  await objRequest.get('/__test/refund-decline');
  await objStaffPage.getByLabel('I approve the full demonstration refund.', { exact: true }).check();
  await objStaffPage.getByRole('button', { name: 'Approve demo refund', exact: true }).click();
  await expect(objStaffPage.locator('#refund-status')).toContainText('refund failed');
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund failed. The team needs to retry.');
  await objStaffPage.getByRole('button', { name: 'Refresh order', exact: true }).click();
  await expect(objStaffPage.locator('#refund-summary')).toContainText('State: failed');
  await objRequest.get('/__test/refund-approve');
  await objStaffPage.getByLabel('I approve the full demonstration refund.', { exact: true }).check();
  await objStaffPage.getByRole('button', { name: 'Approve demo refund', exact: true }).click();
  await expect(objStaffPage.locator('#refund-status')).toContainText('refund completed');
  await objPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await expect(objPage.locator('#tracking-content')).toContainText('Demonstration refund completed. No money was transferred.');
  await expect(objPage.locator('#tracking-content')).not.toContainText('refund failed');
  await expect(objPage.locator('#tracking-content')).not.toContainText('2025550100');
});
