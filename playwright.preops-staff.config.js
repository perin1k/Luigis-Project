import objConfig from './playwright.staff-orders.config.js';
export default {...objConfig,testMatch:['shared-records.spec.js'],retries:0,
  outputDir:'./test-results/preops-staff',globalTimeout:15*60*1000,
  use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
