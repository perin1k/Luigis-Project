// Run only against tests/fixtures/staff-server.js, never a real staff account.
import lighthouse from 'lighthouse';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../node_modules/.cache/ms-playwright', import.meta.url));
const { chromium } = await import('@playwright/test');
const objBrowser = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9222', '--ignore-certificate-errors'] });
const objContext = await objBrowser.newContext({ ignoreHTTPSErrors: true });
const objPage = await objContext.newPage();
const arrReports = [];
try {
  const objFixtureCheck = await objContext.request.get('https://localhost:3443/__test/reset');
  if (!objFixtureCheck.ok() || await objFixtureCheck.text() !== 'reset') throw new Error('Disposable staff fixture required.');
  for (const strMode of ['sign-in', 'enroll', 'recovery', 'account']) {
    if (strMode === 'account') {
      await objContext.request.get('https://localhost:3443/__test/reset');
      await objPage.goto('https://localhost:3443/staff/sign-in');
      await objPage.getByLabel('Username', { exact: true }).fill('admin');
      await objPage.getByLabel('Password', { exact: true }).fill('Synthetic staff browser passphrase only');
      await objPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      const strCode = await (await objContext.request.get('https://localhost:3443/__test/code')).text();
      await objPage.getByLabel('Authenticator code', { exact: true }).fill(strCode);
      await objPage.getByRole('button', { name: 'Verify and sign in' }).click();
      await objPage.waitForURL('**/staff/account');
    }
    const strCookie = (await objContext.cookies()).map((objCookie) => `${objCookie.name}=${objCookie.value}`).join('; ');
    const objResult = await lighthouse(`https://localhost:3443/staff/${strMode}`, {
      port: 9222, logLevel: 'error', output: 'json', disableStorageReset: true,
      extraHeaders: strCookie ? { Cookie: strCookie } : undefined,
    });
    const objReport = { strPath: `/staff/${strMode}`, strVersion: objResult.lhr.lighthouseVersion,
      strProfile: 'Default Lighthouse mobile simulated throttling; isolated loopback HTTPS; macOS arm64; production NODE_ENV',
      objConfiguration: { strFormFactor: objResult.lhr.configSettings.formFactor, strThrottlingMethod: objResult.lhr.configSettings.throttlingMethod,
        objScreenEmulation: objResult.lhr.configSettings.screenEmulation, objThrottling: objResult.lhr.configSettings.throttling },
      objScores: Object.fromEntries(Object.entries(objResult.lhr.categories).map(([strId, objCategory]) => [strId, objCategory.score * 100])),
      arrFailures: Object.values(objResult.lhr.audits).filter((objAudit) => objAudit.score !== null && objAudit.score < 1)
        .map((objAudit) => ({ strId: objAudit.id, strTitle: objAudit.title, numScore: objAudit.score, strDisplayValue: objAudit.displayValue, numValue: objAudit.numericValue })),
    };
    arrReports.push(objReport);
    console.log(JSON.stringify(objReport));
  }
  mkdirSync('reports', { recursive: true });
  // Retain category/audit outcomes only: no cookies, request headers or recovery material.
  writeFileSync('reports/staff-lighthouse.json', JSON.stringify(arrReports, null, 2));
} finally { await objContext.close(); await objBrowser.close(); }
