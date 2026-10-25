import objConfig from './playwright.config.js';

// Native candidates are reviewed before being committed; compare never updates them.
export default {...objConfig, testMatch:'cleanup.spec.js', workers:1,
  outputDir:'./test-results/cleanup-public', reporter:[['list']],
  snapshotPathTemplate:'{testDir}/{testFilePath}-snapshots/cleanup-ci/{arg}-{projectName}-{platform}{ext}',
  use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
