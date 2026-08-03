import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { catalogIndexPlugin } from './config/catalog-index-plugin';

export default defineConfig({
  plugins: [catalogIndexPlugin(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/**/*.test.ts',
      'functions/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**'],
    css: true,
  },
});
