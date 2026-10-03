import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 35000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './test-results/ui-artifacts',
  reporter: [['line'], ['json', { outputFile: './test-results/ui-results.json' }], ['html', { outputFolder: './test-results/ui-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8791', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, screenshot: 'only-on-failure', trace: 'retain-on-failure', actionTimeout: 7000 },
  projects: [
    { name: 'chromium-mobile', use: { browserName: 'chromium' } },
    { name: 'webkit-mobile', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:8791/api/session', timeout: 120000, reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
});
