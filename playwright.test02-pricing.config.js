import objConfig from './playwright.pricing.config.js';

// Separate native checkpoint references preserve contributors' existing baselines.
export default { ...objConfig,
  grep: /payment summary|visual priced review/,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/test02-ci/{arg}-{projectName}-{platform}{ext}',
  updateSnapshots: 'none',
  outputDir: './test-results/test02-pricing',
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
