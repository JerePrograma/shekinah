import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { catalogIndexPlugin } from './config/catalog-index-plugin';

export default defineConfig({
  plugins: [catalogIndexPlugin(), react()],
  build: {
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
});
