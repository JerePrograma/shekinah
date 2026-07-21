import { defineConfig } from '@playwright/test';

const sharedUse = {
  browserName: 'chromium' as const,
  colorScheme: 'light' as const,
  locale: 'es-AR',
  reducedMotion: 'reduce' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  serviceWorkers: 'block' as const,
  timezoneId: 'America/Argentina/Buenos_Aires',
  trace: 'retain-on-failure' as const,
};

export default defineConfig({
  testDir: './tests/fidelity',
  snapshotDir: './.migration-work/fidelity-snapshots',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    ...sharedUse,
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile-375x812', use: { ...sharedUse, viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768x1024', use: { ...sharedUse, viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440x1200', use: { ...sharedUse, viewport: { width: 1440, height: 1200 } } },
  ],
});
