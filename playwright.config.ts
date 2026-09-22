import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/maintenance.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-maintenance',
      testMatch: '**/maintenance.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
    },
  ],
  webServer: [{
    // Neither test build may replace the deployable dist or change its maintenance setting.
    command: 'npm exec vite -- build --outDir node_modules/.cache/shekinah-e2e/storefront && npm run preview -- --outDir node_modules/.cache/shekinah-e2e/storefront',
    env: {
      ...process.env,
      VITE_PUBLIC_MAINTENANCE_ENABLED: 'false',
      VITE_ANALYTICS_ENABLED: 'true',
      VITE_COMMERCE_ENABLED: 'false',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: 'npm run build -- --outDir node_modules/.cache/shekinah-e2e/maintenance && npm run preview -- --outDir node_modules/.cache/shekinah-e2e/maintenance --port 4174',
    env: { ...process.env, VITE_PUBLIC_MAINTENANCE_ENABLED: 'true' },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  }],
});
