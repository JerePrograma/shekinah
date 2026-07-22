#!/usr/bin/env node
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssr = path.join(root, '.ssr');
const templatePath = path.join(dist, 'index.html');
const serverEntry = path.join(ssr, 'entry-server.js');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(templatePath))) throw new Error('Vite no generó dist/index.html.');
if (!(await exists(serverEntry))) throw new Error('Vite SSR no generó .ssr/entry-server.js.');

const template = await readFile(templatePath, 'utf8');
const { canonicalRoutes, redirects, render } = await import(`${pathToFileURL(serverEntry).href}?v=${Date.now()}`);

function outputPath(route) {
  if (route === '/') return path.join(dist, 'index.html');
  return path.join(dist, route.replace(/^\//u, ''), 'index.html');
}

async function writeRoute(route, renderPath = route) {
  const result = render(renderPath);
  const html = template.replace('<!--app-head-->', result.head).replace('<!--app-html-->', result.html);
  const destination = outputPath(route);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
}

for (const route of canonicalRoutes) await writeRoute(route);
const notFound = render('/404/');
await writeFile(
  path.join(dist, '404.html'),
  template.replace('<!--app-head-->', notFound.head).replace('<!--app-html-->', notFound.html),
  'utf8',
);

const indexable = canonicalRoutes.filter((route) => route !== '/category/uncategorized/');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
  .map((route) => `  <url><loc>https://shekinah-7dl.pages.dev${route}</loc></url>`)
  .join('\n')}\n</urlset>\n`;
await writeFile(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(
  path.join(dist, 'robots.txt'),
  'User-agent: *\nAllow: /\nSitemap: https://shekinah-7dl.pages.dev/sitemap.xml\n',
  'utf8',
);
await writeFile(
  path.join(dist, '_redirects'),
  `${redirects.map((item) => `${item.from} ${item.to} ${item.status}`).join('\n')}\n`,
  'utf8',
);
await rm(ssr, { recursive: true, force: true });
process.stdout.write(`Prerender completo: ${canonicalRoutes.length} rutas, ${redirects.length} redirecciones y 404.\n`);
