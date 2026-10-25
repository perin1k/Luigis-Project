import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('appearance follows the system and remembers an explicit choice across pages', async ({ page: objPage }) => {
  const arrErrors = [];
  objPage.on('pageerror', (objError) => arrErrors.push(objError.message));
  objPage.on('console', (objMessage) => { if (objMessage.type() === 'error') arrErrors.push(objMessage.text()); });
  await objPage.emulateMedia({ colorScheme: 'dark' });
  await objPage.goto('/');
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect(objPage.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('Light', { exact: true }).click();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  expect(arrErrors).toEqual([]);
  await objPage.getByRole('link', { name: 'Order online', exact: true }).click();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  await expect(objPage.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await objPage.reload();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  await objPage.getByRole('radio', { name: 'Light', exact: true }).focus();
  await objPage.keyboard.press('ArrowRight');
  await expect(objPage.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('System', { exact: true }).click();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await objPage.emulateMedia({ colorScheme: 'light' });
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'light');
});

test('appearance works when local storage is unavailable', async ({ page: objPage }) => {
  await objPage.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new Error('Storage unavailable'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('Storage unavailable'); } });
  });
  await objPage.goto('/');
  await objPage.getByRole('group', { name: 'Appearance', exact: true }).getByText('Dark', { exact: true }).click();
  await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
});

test('dark mode keeps every ordering step accessible', async ({ page: objPage }) => {
  await objPage.emulateMedia({ colorScheme: 'dark' });
  await objPage.goto('/order');
  for (let intStep = 0; intStep < 6; intStep += 1) {
    if (intStep === 1) await objPage.getByRole('button', { name: 'Add pizza', exact: true }).click();
    if (intStep === 3) {
      await objPage.getByLabel('Your name').fill('Test Guest');
      await objPage.getByLabel('Phone number').fill('3125550100');
    }
    const objResults = await new AxeBuilder({ page: objPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(objResults.violations).toEqual([]);
    if (intStep < 5) await objPage.getByRole('button', { name: intStep === 4 ? 'Continue to payment' : 'Continue', exact: true }).click();
  }
});

test('visual dark homepage and ordering shell', async ({ page: objPage }) => {
  await objPage.emulateMedia({ colorScheme: 'dark' });
  await objPage.goto('/');
  await expect(objPage).toHaveScreenshot('home-dark.png', { fullPage: true });
  const objResults = await new AxeBuilder({ page: objPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResults.violations).toEqual([]);
  await objPage.goto('/order');
  await expect(objPage).toHaveScreenshot('order-dark.png', { fullPage: true });
  await objPage.goto('/preview/confirmation');
  const objConfirmationResults = await new AxeBuilder({ page: objPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objConfirmationResults.violations).toEqual([]);
  await expect(objPage).toHaveScreenshot('confirmation-dark.png', { fullPage: true });
});
