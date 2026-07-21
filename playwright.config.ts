import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const sharedUse = {
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  serviceWorkers: 'block' as const,
  trace: 'on-first-retry' as const,
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    ...sharedUse,
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile-375x812', use: { ...sharedUse, viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768x1024', use: { ...sharedUse, viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440x1200', use: { ...sharedUse, viewport: { width: 1440, height: 1200 } } },
  ],
});
