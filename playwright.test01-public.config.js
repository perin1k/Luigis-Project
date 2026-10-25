import objConfig from './playwright.config.js';

export default { ...objConfig, testMatch: 'availability.spec.js',
  workers: 1, fullyParallel: false, reporter: [['list']],
  outputDir: './test-results/test01-public',
  use: { ...objConfig.use, trace: 'off', screenshot: 'off', video: 'off' },
};
