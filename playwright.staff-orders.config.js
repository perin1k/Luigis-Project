import objConfig from './playwright.staff.config.js';
export default {...objConfig,testDir:'./tests/staff-orders-e2e',outputDir:'./test-results/staff-orders',reporter:[['list']],
  use:{...objConfig.use,baseURL:'https://localhost:3444'},webServer:{...objConfig.webServer,command:'node tests/fixtures/staff-orders-server.js',url:'https://localhost:3444/staff/sign-in'}};
