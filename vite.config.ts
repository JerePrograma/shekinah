import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    appType: 'spa',
    base: env.SITE_BASE_PATH || '/',
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
  };
});
