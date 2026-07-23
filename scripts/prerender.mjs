#!/usr/bin/env node
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const ssr = path.join(root, '.ssr');
const templatePath = path.join(dist, 'index.html');
const serverEntry = path.join(ssr, 'entry-server.js');
const siteOrigin = (process.env.SITE_ORIGIN ?? 'https://shekinah-7dl.pages.dev').replace(/\/+$/u, '');
const configuredBase = process.env.SITE_BASE_PATH ?? '/';
const siteBasePath = configuredBase === '/' ? '' : `/${configuredBase.replace(/^\/+|\/+$/gu, '')}`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function publicPath(route) {
  if (!siteBasePath) return route;
  return route === '/' ? `${siteBasePath}/` : `${siteBasePath}${route}`;
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

for (const redirect of redirects) {
  const target = publicPath(redirect.to);
  const absoluteTarget = new URL(target, `${siteOrigin}/`).toString();
  const html = `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
    <link rel="canonical" href="${escapeHtml(absoluteTarget)}" />
    <title>Redirigiendo — Shekinah</title>
  </head>
  <body>
    <p>La página cambió de dirección. <a href="${escapeHtml(target)}">Continuar</a>.</p>
  </body>
</html>
`;
  const destination = outputPath(redirect.from);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
}

const notFound = render('/404/');
await writeFile(
  path.join(dist, '404.html'),
  template.replace('<!--app-head-->', notFound.head).replace('<!--app-html-->', notFound.html),
  'utf8',
);

const indexable = canonicalRoutes.filter((route) => route !== '/category/uncategorized/');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
  .map((route) => `  <url><loc>${siteOrigin}${route}</loc></url>`)
  .join('\n')}\n</urlset>\n`;
await writeFile(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`,
  'utf8',
);
await rm(ssr, { recursive: true, force: true });
process.stdout.write(`Prerender completo: ${canonicalRoutes.length} rutas, ${redirects.length} redirecciones y 404.\n`);
