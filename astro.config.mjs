import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://shekinah-7dl.pages.dev';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
  redirects: {
    '/inicio': '/',
    '/terminos-condiciones': '/terms-and-conditions',
    '/privacy-policy': '/terms-and-conditions',
    '/hello-world': '/blog',
  },
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});