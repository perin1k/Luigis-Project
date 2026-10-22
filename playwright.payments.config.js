import objConfig from './playwright.config.js';
export default {...objConfig,testDir:'./tests/payments-e2e',outputDir:'./test-results/payments',fullyParallel:false,workers:1,timeout:30000,updateSnapshots:'none',reporter:[['list']],
  use:{...objConfig.use,baseURL:'http://127.0.0.1:3008',trace:'off'},webServer:{command:'node tests/fixtures/payments-server.js',url:'http://127.0.0.1:3008/order',reuseExistingServer:false,env:{NODE_ENV:'production'}}};
