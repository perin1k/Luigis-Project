import objConfig from './playwright.staff-orders.config.js';

export default {...objConfig, testMatch:['menu-customer.spec.js','exceptions-presentation.spec.js'],
  outputDir:'./test-results/cleanup-staff', reporter:[['list']],
  use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
