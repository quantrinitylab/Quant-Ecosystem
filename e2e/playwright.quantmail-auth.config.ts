import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/quantmail-auth',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node fixtures/quantmail-auth-backend.mjs',
      url: 'http://127.0.0.1:3010/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command:
        'cd .. && pnpm --filter @quant/quantmail exec next dev --hostname 127.0.0.1 --port 3100',
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: '/api',
        NEXT_PUBLIC_AUTH_URL: '',
        QUANTMAIL_BACKEND_URL: 'http://127.0.0.1:3010',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
