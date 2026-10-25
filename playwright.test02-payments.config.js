import objConfig from './playwright.payments.config.js';

// Separate native checkpoint references preserve contributors' existing baselines.
export default { ...objConfig,
  updateSnapshots: 'none',
  outputDir: './test-results/test02-payments',
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
