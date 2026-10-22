import objConfig from './playwright.config.js';
export default { ...objConfig, testDir:'./tests/scheduling-e2e',outputDir:'./test-results/scheduling',
  fullyParallel:false,workers:1,timeout:30000,updateSnapshots:'none',reporter:[['list']],
  use:{...objConfig.use,baseURL:'http://127.0.0.1:3007',trace:'off'},
  webServer:{command:'node tests/fixtures/scheduling-server.js',url:'http://127.0.0.1:3007/order',reuseExistingServer:false,env:{NODE_ENV:'production'}} };
