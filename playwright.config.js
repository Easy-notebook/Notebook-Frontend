import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179/tests/browser/storage.html',
    reuseExistingServer: false,
  },
});
