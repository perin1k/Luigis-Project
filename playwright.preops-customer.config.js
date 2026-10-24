import objConfig from './playwright.payments.config.js';
export default {...objConfig,testMatch:['customer-journey.spec.js'],retries:0,
  outputDir:'./test-results/preops-customer',globalTimeout:15*60*1000,
  use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
