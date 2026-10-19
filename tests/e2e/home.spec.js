import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage presents the approved menu and operating information', async ({ page: objPage }) => {
  const objResponse = await objPage.goto('/');
  expect(objResponse.status()).toBe(200);
  await expect(objPage).toHaveTitle("Luigi's Pizza | Dine-in & Carry-out");
  await expect(objPage.getByRole('heading', { level: 1 })).toHaveText(/Good pizza\.\s*Great company\./);
  await expect(objPage.getByRole('main')).toContainText('10:00 AM–11:00 PM');
  await expect(objPage.getByRole('table')).toContainText('$5.00');
  await expect(objPage.getByRole('table')).toContainText('$7.00');
  await expect(objPage.getByRole('table')).toContainText('$9.00');
  await objPage.getByRole('link', { name: 'Explore the menu' }).click();
  await expect(objPage).toHaveURL(/#menu$/);
  await expect(objPage.getByRole('heading', { name: 'Your pizza, your way.' })).toBeInViewport();
  await expect(objPage.getByRole('main')).not.toContainText('coming soon');
  await objPage.getByRole('link', { name: 'Start your order' }).first().click();
  await expect(objPage).toHaveURL(/\/order$/);
});

test('keyboard users can skip directly to the main content', async ({ page: objPage }) => {
  await objPage.goto('/');
  await objPage.keyboard.press('Tab');
  await expect(objPage.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await objPage.keyboard.press('Enter');
  await expect(objPage.getByRole('main')).toBeFocused();
});

test('homepage has no automated WCAG A/AA violations or horizontal overflow', async ({ page: objPage }) => {
  await objPage.goto('/');
  const objResults = await new AxeBuilder({ page: objPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResults.violations).toEqual([]);
  expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('content remains available without browser JavaScript', async ({ browser: objBrowser }) => {
  const objContext = await objBrowser.newContext({ javaScriptEnabled: false });
  const objPage = await objContext.newPage();
  await objPage.goto('http://127.0.0.1:3000');
  await expect(objPage.getByRole('heading', { name: 'Your pizza, your way.' })).toBeVisible();
  await objPage.goto('http://127.0.0.1:3000/order');
  await expect(objPage.getByText('Please enable JavaScript to customize your order.', { exact: false })).toBeVisible();
  await objContext.close();
});

test('server does not expose repository files', async ({ request: objRequest }) => {
  for (const strPath of ['/AGENTS.md', '/src/app.js', '/.env', '/missing', '/node_modules/bootstrap/package.json']) {
    const objResponse = await objRequest.get(strPath);
    expect(objResponse.status()).toBe(404);
  }
});

test('visual homepage baseline', async ({ page: objPage }) => {
  await objPage.goto('/');
  await expect(objPage).toHaveScreenshot('homepage.png', { fullPage: true, animations: 'disabled' });
});
