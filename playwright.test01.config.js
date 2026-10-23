import objConfig from './playwright.staff-orders.config.js';

export default { ...objConfig,
  testMatch: /menu(?:-customer)?\.spec\.js/,
  snapshotPathTemplate: process.env.TEST01_NATIVE === '1'
    ? '{testDir}/{testFilePath}-snapshots/test01-ci/{arg}-{projectName}-{platform}{ext}'
    : undefined,
  outputDir: './test-results/test01-menu',
};
