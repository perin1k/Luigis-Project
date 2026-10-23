import objConfig from './playwright.scheduling.config.js';

// Separate native checkpoint references preserve contributors' existing baselines.
export default { ...objConfig,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/test02-ci/{arg}-{projectName}-{platform}{ext}',
  updateSnapshots: 'none',
  outputDir: './test-results/test02-scheduling',
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
