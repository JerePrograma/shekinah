import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  base: process.env.SITE_BASE_PATH || '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4321,
  },
  preview: {
    host: '127.0.0.1',
    port: 4321,
  },
});
