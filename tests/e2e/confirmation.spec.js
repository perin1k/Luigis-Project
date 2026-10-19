import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('visual confirmation preview is accessible and unmistakably sample content', async ({ page: objPage }) => {
  await objPage.goto('/preview/confirmation');
  await expect(objPage.getByRole('main')).toContainText('No order has been placed or charged.');
  await expect(objPage.getByRole('heading', { level: 1 })).toHaveText('Thank you, Sample guest.');
  await expect(objPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const objResults = await new AxeBuilder({ page: objPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(objResults.violations).toEqual([]);
  await expect(objPage).toHaveScreenshot('confirmation-preview.png', { fullPage: true });
  await objPage.getByRole('link', { name: 'Back to the menu' }).click();
  await expect(objPage).toHaveURL(/\/#menu$/);
});
