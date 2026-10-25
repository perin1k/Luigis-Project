import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./node_modules/.cache/ms-playwright', import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  // Reviewed redesign references are native to each OS, engine and viewport.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/cleanup-regression/{arg}-{projectName}-{platform}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', colorScheme: 'light', trace: 'retain-on-failure' },
  projects: ['chromium', 'firefox', 'webkit'].flatMap((strBrowserName) =>
    ['desktop', 'mobile'].map((strViewportName) => ({
      name: `${strBrowserName}-${strViewportName}`,
      use: {
        browserName: strBrowserName,
        viewport: strViewportName === 'mobile'
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
      },
    }))),
  webServer: {
    command: 'node tests/fixtures/server.js',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3000' },
  },
});
