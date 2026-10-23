import objConfig from './playwright.config.js';

export default { ...objConfig, testMatch: 'availability.spec.js',
  workers: 1, fullyParallel: false, reporter: [['list']],
  snapshotPathTemplate: process.env.TEST01_NATIVE === '1'
    ? '{testDir}/{testFilePath}-snapshots/test01-ci/{arg}-{projectName}-{platform}{ext}'
    : undefined,
  outputDir: './test-results/test01-public',
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
