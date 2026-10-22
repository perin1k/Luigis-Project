import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('./node_modules/.cache/ms-playwright', import.meta.url));
export default defineConfig({
  testDir: './tests/staff-e2e', outputDir: './test-results/staff', workers: 1, fullyParallel: false, timeout: 60000, updateSnapshots: 'none',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/staff', open: 'never' }]],
  use: { baseURL: 'https://localhost:3443', ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off', video: 'off' },
  // Self-signed certificates and synthetic secrets exist only in this isolated test fixture.
  projects: ['chromium', 'firefox', 'webkit'].flatMap((strBrowserName) => ['desktop', 'mobile'].map((strSize) => ({
    name: `${strBrowserName}-${strSize}`, use: { browserName: strBrowserName,
      viewport: strSize === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 } },
  }))),
  webServer: { command: 'node tests/fixtures/staff-server.js', url: 'https://localhost:3443/staff/sign-in',
    ignoreHTTPSErrors: true, reuseExistingServer: false, env: { NODE_ENV: 'production' } },
});
