import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const PASSWORD = 'Synthetic staff browser passphrase only';
async function code(objRequest, strSecret) {
  return (await objRequest.get(`/__test/code${strSecret ? `?secret=${encodeURIComponent(strSecret)}` : ''}`)).text();
}
async function signIn(objPage, objRequest, strUser = 'employee') {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill(strUser);
  await objPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (strUser === 'admin') {
    await expect(objPage.getByLabel('Authenticator code', { exact: true })).toBeVisible();
    expect((await objPage.request.get('/auth/session')).status()).toBe(401);
    await objPage.getByLabel('Authenticator code', { exact: true }).fill(await code(objRequest));
    await objPage.getByRole('button', { name: 'Verify and sign in' }).click();
  }
  await expect(objPage).toHaveURL(/\/staff\/account$/);
}
async function audit(objPage) {
  await expect.poll(() => objPage.evaluate(() => document.getAnimations().filter((objAnimation) => objAnimation.playState === 'running').length)).toBe(0);
  const objResults = await new AxeBuilder({ page: objPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResults.violations).toEqual([]);
}
test.beforeEach(async ({ request: objRequest }) => { await objRequest.get('/__test/reset'); });
test('employee sign-in, safe cookies, password change and revoked old session', async ({ page: objPage, request: objRequest, context: objContext }) => {
  await signIn(objPage, objRequest);
  await expect(objPage.getByRole('heading', { name: 'Invite an employee' })).toHaveCount(0);
  const arrCookies = await objContext.cookies();
  const objSession = arrCookies.find((objCookie) => objCookie.name === '__Host-luigis-session');
  expect(objSession).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' });
  await audit(objPage);
  await objPage.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  await objPage.getByLabel('New password', { exact: true }).fill('A different synthetic staff passphrase');
  await objPage.getByRole('button', { name: 'Change password and sign out' }).click();
  await expect(objPage).toHaveURL(/sign-in$/);
  await objPage.goto('/staff/account'); await expect(objPage).toHaveURL(/sign-in$/);
  await objPage.getByLabel('Username', { exact: true }).fill('employee');
  await objPage.getByLabel('Password', { exact: true }).fill('A different synthetic staff passphrase');
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(objPage).toHaveURL(/account$/);
});
test('admin MFA, invitation enrollment, revoke and employee deactivation', async ({ page: objPage, request: objRequest, browser: objBrowser }) => {
  await signIn(objPage, objRequest, 'admin');
  await expect(objPage.getByText('employee · active', { exact: false })).toBeVisible();
  await audit(objPage);
  await objPage.getByLabel('Verify your password').fill(PASSWORD);
  await objPage.getByLabel('Fresh code for recovery codes').fill(await code(objRequest));
  await objPage.getByRole('button', { name: 'Replace recovery codes' }).click();
  await expect(objPage.getByLabel('Private recovery codes')).toBeVisible();
  await objPage.getByRole('button', { name: 'I saved my codes — hide them' }).click();
  await objPage.getByLabel('Employee username', { exact: true }).fill('new.employee');
  await objPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
  const elToken = objPage.getByLabel('Private invitation token — shown once'); await expect(elToken).toBeVisible();
  const strToken = await elToken.inputValue(); expect(strToken).toMatch(/^[a-f0-9]{64}$/);
  const objRecipientContext = await objBrowser.newContext({ ignoreHTTPSErrors: true });
  const objRecipient = await objRecipientContext.newPage();
  try {
    await objRecipient.goto('https://localhost:3443/staff/enroll');
    await objRecipient.getByLabel('Invitation token', { exact: true }).fill(strToken);
    await objRecipient.getByLabel('Choose a password').fill(PASSWORD);
    await objRecipient.getByRole('button', { name: 'Create my staff account' }).click();
    await expect(objRecipient.getByRole('status')).toContainText('Your account is ready');
    await objPage.getByRole('button', { name: 'Refresh employees', exact: true }).click();
    await expect(objPage.getByRole('button', { name: 'Deactivate new.employee', exact: true })).toBeVisible();
    objPage.once('dialog', (objDialog) => objDialog.accept());
    await objPage.getByRole('button', { name: 'Deactivate new.employee', exact: true }).click();
    await expect(objPage.getByText('new.employee · disabled', { exact: true })).toBeVisible();
    await objPage.getByLabel('Employee username', { exact: true }).fill('revoked.employee');
    await objPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const elRevoke = objPage.getByRole('button', { name: 'Revoke invitation for revoked.employee', exact: true });
    await expect(elRevoke).toBeVisible(); objPage.once('dialog', (objDialog) => objDialog.accept()); await elRevoke.click();
    await expect(objPage.getByText('revoked.employee · revoked', { exact: true })).toBeVisible();
  } finally { await objRecipientContext.close(); }
});
test('admin recovery requires new MFA and exposes replacement codes once', async ({ page: objPage, request: objRequest },objTestInfo) => {
  await objPage.goto('/staff/recovery'); await audit(objPage);
  await objPage.getByLabel('Username', { exact: true }).fill('admin');
  await objPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await objPage.getByLabel('Unused recovery code').fill(await (await objRequest.get('/__test/recovery-code')).text());
  await objPage.getByRole('button', { name: 'Begin authenticator replacement' }).click();
  const elKey = objPage.getByLabel('Private setup key'); await expect(elKey).toBeVisible();
  const elQr=objPage.getByRole('img',{name:'Private authenticator setup QR code'});
  await expect(elQr).toBeVisible();
  expect(await elQr.evaluate(elCanvas=>{
    const objContext=elCanvas.getContext('2d');
    return {bWhiteQuietZone:[...objContext.getImageData(0,0,1,1).data].join(',')==='255,255,255,255',
      bBlackFinder:[...objContext.getImageData(16,16,1,1).data].join(',')==='0,0,0,255'};
  })).toEqual({bWhiteQuietZone:true,bBlackFinder:true});
  await audit(objPage);
  const objViewport=objPage.viewportSize();
  await objPage.setViewportSize({width:320,height:900});
  for(const strTheme of ['Dark','Light']){
    await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await audit(objPage);
    expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const objBox=await elQr.boundingBox();expect(objBox.x>=0&&objBox.x+objBox.width<=320).toBe(true);
    if(objTestInfo.project.name==='chromium-desktop'&&strTheme==='Dark')
      await objPage.screenshot({path:objTestInfo.outputPath('synthetic-authenticator-qr.png'),fullPage:true});
  }
  await objPage.setViewportSize(objViewport);
  const strSecret = await elKey.inputValue();
  await objPage.getByRole('button',{name:'Hide setup key and QR code'}).click();
  await expect(elQr).toBeHidden();await expect(elKey).toHaveValue('');
  expect(await objPage.locator('#authenticator-qr').evaluate(elCanvas=>elCanvas.width===0&&elCanvas.height===0)).toBe(true);
  await objPage.getByLabel('New authenticator code').fill(await code(objRequest, strSecret));
  await objPage.getByRole('button', { name: 'Confirm replacement' }).click();
  const elCodes = objPage.getByLabel('Private recovery codes'); await expect(elCodes).toBeVisible();
  expect((await elCodes.inputValue()).split('\n')).toHaveLength(10);
  await objPage.getByRole('button', { name: 'I saved my codes — hide them' }).click(); await expect(elCodes).toBeHidden();
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill('admin'); await objPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await objPage.getByLabel('Authenticator code', { exact: true }).fill(await code(objRequest, strSecret));
  await objPage.getByRole('button', { name: 'Verify and sign in' }).click(); await expect(objPage).toHaveURL(/account$/);
});
test('authenticator QR expiry clears private pixels and key without browser storage',async({page:objPage,request:objRequest})=>{
  await objPage.clock.install();
  await objPage.goto('/staff/recovery');
  await objPage.getByLabel('Username',{exact:true}).fill('admin');
  await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);
  await objPage.getByLabel('Unused recovery code').fill(await(await objRequest.get('/__test/recovery-code')).text());
  await objPage.getByRole('button',{name:'Begin authenticator replacement'}).click();
  await expect(objPage.locator('#authenticator-qr')).toBeVisible();
  await objPage.clock.fastForward(600001);
  await expect(objPage.locator('#authenticator-qr')).toBeHidden();
  await expect(objPage.locator('#setup-key')).toHaveValue('');
  expect(await objPage.locator('#authenticator-qr').evaluate(elCanvas=>elCanvas.width===0&&elCanvas.height===0)).toBe(true);
  expect(await objPage.evaluate(()=>localStorage.length===0&&sessionStorage.length===0)).toBe(true);
});

test('authenticator QR failure preserves manual setup and page exit clears secrets',async({page:objPage,request:objRequest})=>{
  await objPage.route('**/auth/recovery/start',async objRoute=>{
    const objResponse=await objRoute.fetch();const objBody=await objResponse.json();
    objBody.objQrCode={intSize:21,strModules:'invalid'};
    await objRoute.fulfill({response:objResponse,json:objBody});
  });
  await objPage.goto('/staff/recovery');
  await objPage.getByLabel('Username',{exact:true}).fill('admin');
  await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);
  await objPage.getByLabel('Unused recovery code').fill(await(await objRequest.get('/__test/recovery-code')).text());
  await objPage.getByRole('button',{name:'Begin authenticator replacement'}).click();
  await expect(objPage.locator('#staff-status')).toContainText('QR display is unavailable');
  await expect(objPage.locator('#authenticator-qr')).toBeHidden();
  await expect(objPage.getByLabel('Private setup key')).toBeVisible();
  await objPage.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(objPage.locator('#setup-key')).toHaveValue('');
  await expect(objPage.locator('#recovery-enrollment')).toBeHidden();
});

test('validation, network failure, expired session, keyboard and responsive themes', async ({ page: objPage, request: objRequest }) => {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username', { exact: true }).fill('employee');
  await objPage.getByLabel('Password', { exact: true }).fill('incorrect');
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(objPage.getByRole('status')).toContainText('Unable to complete');
  await expect(objPage.getByLabel('Password', { exact: true })).toHaveValue('');
  await objPage.route('**/auth/login', (objRoute) => objRoute.abort());
  await objPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(objPage.getByRole('status')).not.toHaveText('Working…');
  await objPage.unroute('**/auth/login');
  await objPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await objPage.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(objPage).toHaveURL(/account$/);
  await objRequest.get('/__test/expire'); await objPage.reload(); await expect(objPage).toHaveURL(/sign-in$/);
  await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('Dark', { exact: true }).click(); await audit(objPage);
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await objPage.getByLabel('Username', { exact: true }).focus(); await objPage.keyboard.press('Tab');
  await expect(objPage.getByLabel('Password', { exact: true })).toBeFocused();
});

for (const strMode of ['sign-in', 'enroll', 'recovery', 'account']) {
  test(`visual ${strMode} in light and dark themes with accessible responsive controls`, async ({ page: objPage, request: objRequest }, objInfo) => {
    if (strMode === 'account') await signIn(objPage, objRequest, 'admin');
    else await objPage.goto(`/staff/${strMode}`);
    for (const strTheme of ['Light', 'Dark']) {
      await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText(strTheme, { exact: true }).click();
      if (strMode === 'account') await expect(objPage.getByText('employee · active', { exact: false })).toBeVisible();
      await audit(objPage);
      expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await objPage.screenshot({ path: objInfo.outputPath(`review-${strMode}-${strTheme.toLowerCase()}.png`), fullPage: true });
      await expect.soft(objPage).toHaveScreenshot(`staff-${strMode}-${strTheme.toLowerCase()}.png`, { fullPage: true });
    }
  });
}

test('employee pagination preserves keyboard context and handles lost authorization', async ({ page: objPage, request: objRequest }) => {
  await objRequest.get('/__test/seed-employees'); await signIn(objPage, objRequest, 'admin');
  const elSection = objPage.locator('[data-list=employees]');
  await expect(elSection.getByText(/Showing 1–10/)).toBeVisible();
  await elSection.getByRole('button', { name: 'Next employees', exact: true }).click();
  await expect(elSection.getByText(/Showing 11–13/)).toBeVisible();
  await expect(elSection.getByRole('heading', { name: 'Employees', exact: true })).toBeFocused();
  await elSection.getByRole('button', { name: 'Previous employees', exact: true }).click();
  await expect(elSection.getByText(/Showing 1–10/)).toBeVisible();
  await objPage.getByLabel('Verify your password').fill(PASSWORD);
  await objPage.getByLabel('Fresh code for recovery codes').fill(await code(objRequest));
  await objPage.getByRole('button', { name: 'Replace recovery codes' }).click();
  await expect(objPage.getByLabel('Private recovery codes')).toBeVisible();
  await objRequest.get('/__test/expire');
  await elSection.getByRole('button', { name: 'Refresh employees', exact: true }).click();
  await expect(elSection.getByText('Unable to load current records.')).toBeVisible();
  await expect(elSection.getByRole('button', { name: /^Deactivate/ })).toHaveCount(0);
  await expect(objPage.getByLabel('Private recovery codes')).toBeHidden();
  await expect(objPage.getByLabel('Private recovery codes')).toHaveValue('');
  await expect(objPage.getByRole('status')).toContainText('Unable to complete');
  await expect(objPage.getByRole('link', { name: 'Go to sign-in', exact: true })).toBeVisible();
});

test('320px reflow, logout and employee permission boundary', async ({ page: objPage, request: objRequest }) => {
  await objPage.setViewportSize({ width: 320, height: 844 });
  for (const strMode of ['sign-in', 'enroll', 'recovery']) {
    await objPage.goto(`/staff/${strMode}`); await audit(objPage);
    expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await signIn(objPage, objRequest, 'admin'); await audit(objPage);
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await objPage.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(objPage).toHaveURL(/sign-in$/);
  await signIn(objPage, objRequest, 'employee');
  const objCsrf = await (await objPage.request.get('/auth/csrf')).json();
  const objDenied = await objPage.request.post('/auth/employees/invitations', {
    headers: { Origin: 'https://localhost:3443', 'X-CSRF-Token': objCsrf.strCsrfToken }, data: { strUsername: 'forbidden.employee' },
  });
  expect(objDenied.status()).toBe(403);
  expect((await objPage.request.get('/auth/session')).status()).toBe(200);
  await objPage.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(objPage).toHaveURL(/sign-in$/);
});
