import objPublicConfig from './playwright.config.js';
import objPricingConfig from './playwright.pricing.config.js';
import objSchedulingConfig from './playwright.scheduling.config.js';
import objPaymentsConfig from './playwright.payments.config.js';
import objStaffConfig from './playwright.staff.config.js';
import objOperationsConfig from './playwright.staff-orders.config.js';

// Reuse each fixture and its assertions; only candidate storage is separate.
// Collection never overwrites historical images in a contributor's checkout.
const mapSuites = {
  public: {objConfig: objPublicConfig,
    arrFiles: ['home.spec.js', 'ordering.spec.js', 'theme.spec.js', 'confirmation.spec.js', 'availability.spec.js']},
  pricing: {objConfig: objPricingConfig, arrFiles: ['pricing.spec.js'], objGrep: /visual/},
  scheduling: {objConfig: objSchedulingConfig, arrFiles: ['scheduling.spec.js'], objGrep: /visual|scheduling policy/},
  payments: {objConfig: objPaymentsConfig, arrFiles: ['payments.spec.js', 'customer-journey.spec.js']},
  staff: {objConfig: objStaffConfig, arrFiles: ['staff.spec.js', 'roles.spec.js'], objGrep: /visual/},
  operations: {objConfig: objOperationsConfig,
    arrFiles: ['orders.spec.js', 'menu.spec.js', 'menu-customer.spec.js', 'analytics.spec.js', 'notifications.spec.js', 'privacy.spec.js'],
    // The initial collection ran the full files. Reuse those functional results
    // and compare every screenshot-producing case without repeating unrelated cases.
    objGrep: /visual|menu owner publishes|menu edits reach|private tracking explains|lost refund response/},
};
const strSuite = process.env.CLEANUP_SUITE;
if (!Object.hasOwn(mapSuites, strSuite ?? '')) {
  throw new Error('Set CLEANUP_SUITE to public, pricing, scheduling, payments, staff or operations.');
}
const {objConfig, arrFiles, objGrep} = mapSuites[strSuite];

export default {
  ...objConfig,
  testMatch: arrFiles,
  ...(objGrep ? {grep: objGrep} : {}),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  updateSnapshots: 'none',
  outputDir: `./test-results/cleanup-regression-${strSuite}`,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/cleanup-regression/{arg}-{projectName}-{platform}{ext}',
  use: {...objConfig.use, trace: 'off', screenshot: 'off', video: 'off'},
};
