import objConfig from './playwright.staff-orders.config.js';

export default {...objConfig, testMatch:['menu-customer.spec.js','exceptions-presentation.spec.js'],
  outputDir:'./test-results/cleanup-staff', reporter:[['list']],
  snapshotPathTemplate:'{testDir}/{testFilePath}-snapshots/cleanup-ci/{arg}-{projectName}-{platform}{ext}',
  use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
