import objConfig from './playwright.config.js';
export default { ...objConfig, testDir: './tests/pricing-e2e', outputDir: './test-results/pricing',
  fullyParallel: false, workers: 1, timeout: 60000, updateSnapshots: 'none',
  reporter: [['list']], use: { ...objConfig.use, baseURL: 'http://127.0.0.1:3004', trace: 'off' },
  webServer: { command: 'node tests/fixtures/pricing-server.js', url: 'http://127.0.0.1:3004/order',
    reuseExistingServer: false, env: { NODE_ENV: 'production' } } };
