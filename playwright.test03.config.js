import objConfig from './playwright.staff-orders.config.js';

// Keep checkpoint-native references separate from contributors' local images.
export default { ...objConfig,
  testMatch: ['orders.spec.js', 'employee-presentation.spec.js',
    'tracking-presentation.spec.js', 'exceptions-presentation.spec.js',
    'notifications.spec.js', 'analytics.spec.js'],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/test03-ci/{arg}-{projectName}-{platform}{ext}',
  updateSnapshots: 'none',
  outputDir: './test-results/test03',
  globalTimeout: 25 * 60 * 1000,
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
