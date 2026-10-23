import { test, expect } from '@playwright/test';
import { readCookieFlags } from '../helpers/cookie-flags.js';

test.beforeEach(async ({ request: objRequest }) => { await objRequest.get('/__test/reset'); });

test('Strict session cookie is withheld on real cross-site navigation while None control is sent', async ({ page: objPage }) => {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill('employee');
  await objPage.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
  const pLogin = objPage.waitForResponse((objResponse) => objResponse.url().endsWith('/auth/login') && objResponse.request().method() === 'POST');
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  const objLogin = await pLogin;
  // Compare flags only: a failed assertion must never print the opaque session value.
  expect(readCookieFlags(await objLogin.headersArray(), '__Host-luigis-session'))
    .toEqual(expect.arrayContaining(['path=/', 'secure', 'httponly', 'samesite=strict']));
  await expect(objPage).toHaveURL(/\/staff\/account$/);
  await objPage.goto('/__test/cookie-control');
  await objPage.goto('/__test/cookie-presence');
  expect(JSON.parse(await objPage.locator('body').innerText())).toEqual({ bHasSessionCookie: true, bHasControlCookie: true });
  // 127.0.0.1 and localhost are distinct sites, despite reaching the same fixture.
  await objPage.goto('https://127.0.0.1:3443/__test/cross-site');
  await objPage.getByRole('link', { name: 'Open cookie probe', exact: true }).click();
  expect(JSON.parse(await objPage.locator('body').innerText())).toEqual({ bHasSessionCookie: false, bHasControlCookie: true });
});
