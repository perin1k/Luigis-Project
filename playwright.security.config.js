import objConfig from './playwright.staff-orders.config.js';
export default {...objConfig,testMatch:['privacy.spec.js'],outputDir:'./test-results/security',
  globalTimeout:12*60*1000,use:{...objConfig.use,trace:'off',screenshot:'off',video:'off'}};
