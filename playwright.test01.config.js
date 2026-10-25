import objConfig from './playwright.staff-orders.config.js';

export default { ...objConfig,
  testMatch: /menu(?:-customer)?\.spec\.js/,
  outputDir: './test-results/test01-menu',
};
