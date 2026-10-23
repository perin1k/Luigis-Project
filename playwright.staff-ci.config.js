import objStaffConfig from './playwright.staff.config.js';

// Functional CI is distinct from the strict, OS-specific visual acceptance suite.
export default { ...objStaffConfig, grepInvert: /visual/, reporter: [['list']],
  outputDir: './test-results/staff-ci', globalTimeout: 15 * 60 * 1000 };
