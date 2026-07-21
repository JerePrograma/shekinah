#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, list) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), list[index + 1]]);
    return pairs;
  }, []),
);
const source = new URL(args.source ?? 'http://localhost:8081');
const output = path.resolve(args.output ?? 'reference-snapshot/site');
const screenshots = path.resolve(args.screenshots ?? 'reference-snapshot/screenshots');
const manifestPath = path.resolve(args.manifest ?? 'reference-snapshot/manifest.json');
const dataRoot = path.resolve(args.metadata ?? 'reference-snapshot/data');
const wordpressRoot = args['wordpress-root'] ? path.resolve(args['wordpress-root']) : '';
const maxPages = Number(args['max-pages'] ?? 200);
const production = new URL(process.env.SITE_URL ?? 'https://shekinah-7dl.pages.dev');
const seedRoutes = [
  '/',
  '/inicio/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/terms-and-conditions/',
  '/terminos-condiciones/',
];
const publicExtensions = new Set([
  '.avif',
  '.css',
  '.csv',
  '.doc',
  '.docx',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.mp3',
  '.mp4',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.svg',
  '.ttf',
  '.txt',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xls',
  '.xlsx',
  '.xml',
]);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const skipped = [
  '/wp-admin',
  '/wp-login.php',
  '/wp-cron.php',
  '/xmlrpc.php',
  '/wp-comments-post.php',
];
const hash = (body) => createHash('sha256').update(body).digest('hex');
const exists = async (file) =>
  access(file)
    .then(() => true)
    .catch(() => false);

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function copyAssets(from, to) {
  let copied = 0;
  for (const file of await walk(from)) {
    if (!publicExtensions.has(path.extname(file).toLowerCase())) continue;
    const target = path.join(to, path.relative(from, file));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(file, target, { force: true });
    copied += 1;
  }
  return copied;
}

function routeFor(value) {
  const url = new URL(value, source);
  if (url.origin !== source.origin || skipped.some((prefix) => url.pathname.startsWith(prefix))) {
    return null;
  }
  let route = decodeURI(url.pathname);
  if (!path.posix.extname(route) && !route.endsWith('/')) route += '/';
  return route || '/';
}

function routePath(route) {
  if (route === '/') return 'index.html';
  const clean = route.replace(/^\/+|\/+$/gu, '');
  return path.posix.extname(clean) ? clean : `${clean}/index.html`;
}

function assetPath(value, contentType = '') {
  const url = new URL(value);
  let pathname = decodeURIComponent(url.pathname);
  if (!path.posix.extname(pathname)) {
    const types = {
      'text/css': '.css',
      'text/javascript': '.js',
      'application/javascript': '.js',
      'application/json': '.json',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/svg+xml': '.svg',
      'image/webp': '.webp',
      'font/woff2': '.woff2',
    };
    pathname = `${pathname.replace(/\/$/u, '') || '/index'}${types[contentType.split(';')[0]] ?? ''}`;
  }
  if (url.search) {
    const parsed = path.posix.parse(pathname);
    pathname = path.posix.join(
      parsed.dir,
      `${parsed.name}-${hash(url.search).slice(0, 10)}${parsed.ext}`,
    );
  }
  if (url.origin === source.origin) return pathname.replace(/^\/+/, '');
  return `__external/${url.hostname}/${hash(value).slice(0, 16)}-${path.posix.basename(pathname) || 'asset'}`;
}

function rewrite(content, resourceMap, relative = '') {
  const absolute = relative.endsWith('.xml') || path.posix.basename(relative) === 'robots.txt';
  let result = content.split(source.origin).join(absolute ? production.origin : '');
  for (const [url, local] of [...resourceMap].sort(([a], [b]) => b.length - a.length)) {
    result = result.split(url).join(`/${local}`);
    result = result.split(url.replaceAll('&', '&amp;')).join(`/${local}`);
  }
  result = result
    .replaceAll('chocolate-chimpanzee-908881.hostingersite.com', production.host)
    .replace(
      /(<link\b[^>]*rel=["']canonical["'][^>]*href=["'])\/([^"']*)/giu,
      `$1${production.origin}/$2`,
    )
    .replace(
      /(<meta\b[^>]*property=["']og:url["'][^>]*content=["'])\/([^"']*)/giu,
      `$1${production.origin}/$2`,
    );
  return result;
}

await rm(output, { recursive: true, force: true });
await rm(screenshots, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
await mkdir(dataRoot, { recursive: true });
if (
  !(await fetch(source)
    .then((response) => response.ok)
    .catch(() => false))
) {
  throw new Error(`WordPress no responde en ${source.origin}.`);
}

let copiedPublicFiles = 0;
if (wordpressRoot) {
  copiedPublicFiles += await copyAssets(
    `${wordpressRoot}/wp-content/uploads`,
    `${output}/wp-content/uploads`,
  );
  copiedPublicFiles += await copyAssets(
    `${wordpressRoot}/wp-content/themes`,
    `${output}/wp-content/themes`,
  );
  copiedPublicFiles += await copyAssets(
    `${wordpressRoot}/wp-content/plugins`,
    `${output}/wp-content/plugins`,
  );
}

const queue = [...seedRoutes];
for (const sitemapName of ['wp-sitemap.xml', 'sitemap-index.xml', 'sitemap.xml']) {
  const sitemapUrl = new URL(`/${sitemapName}`, source);
  const response = await fetch(sitemapUrl).catch(() => null);
  if (!response?.ok) continue;
  const xml = await response.text();
  await writeFile(path.join(output, sitemapName), xml);
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/giu)) {
    const value = match[1].replaceAll('&amp;', '&');
    if (value.endsWith('.xml')) {
      const nested = await fetch(value).catch(() => null);
      if (nested?.ok) {
        const nestedXml = await nested.text();
        await writeFile(path.join(output, path.posix.basename(new URL(value).pathname)), nestedXml);
        for (const item of nestedXml.matchAll(/<loc>([^<]+)<\/loc>/giu)) queue.push(item[1]);
      }
    } else queue.push(value);
  }
}
const robots = await fetch(new URL('/robots.txt', source)).catch(() => null);
if (robots?.ok) await writeFile(path.join(output, 'robots.txt'), await robots.text());

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  serviceWorkers: 'block',
  viewport: { width: 1440, height: 1200 },
});
const page = await context.newPage();
const seen = new Set();
const pages = [];
const redirects = [];
const forms = [];
const consoleErrors = [];
const resourceMap = new Map();
const resources = new Map();
page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
page.on('pageerror', (error) => consoleErrors.push(error.message));

async function saveResource(url) {
  if (!/^https?:/u.test(url) || resources.has(url)) return;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return;
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const local = assetPath(url, contentType);
  const destination = path.join(output, local);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body);
  resourceMap.set(url, local);
  const parsed = new URL(url);
  resources.set(url, {
    url: parsed.origin === source.origin ? `${parsed.pathname}${parsed.search}` : url,
    path: local,
    contentType,
    bytes: body.length,
    sha256: hash(body),
    external: parsed.origin !== source.origin,
  });
}

while (queue.length && seen.size < maxPages) {
  const route = routeFor(queue.shift());
  if (!route || seen.has(route)) continue;
  seen.add(route);
  const initial = await fetch(new URL(route, source), { redirect: 'manual' }).catch(() => null);
  if (!initial) continue;
  if ([301, 302, 303, 307, 308].includes(initial.status)) {
    const location = initial.headers.get('location');
    if (!location) continue;
    const target = routeFor(location) ?? location;
    redirects.push({ route, target, status: initial.status });
    const destination = path.join(output, routePath(route));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      `<!doctype html><meta http-equiv="refresh" content="0;url=${target}"><meta name="robots" content="noindex"><title>Redirección</title><a href="${target}">Continuar</a>`,
    );
    queue.push(target);
    continue;
  }
  if (!initial.ok) {
    pages.push({ route, status: initial.status });
    continue;
  }

  const response = await page.goto(new URL(route, source).href, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += Math.max(300, innerHeight * 0.75)) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    scrollTo(0, 0);
    if (document.fonts?.ready) await document.fonts.ready;
  });
  const discovered = await page.evaluate(() => ({
    title: document.title,
    links: [...document.querySelectorAll('a[href]')].map((item) => item.href),
    resources: [
      ...[...document.querySelectorAll('[src]')].map((item) => item.src),
      ...[...document.querySelectorAll('[poster]')].map((item) => item.poster),
      ...[...document.querySelectorAll('link[href]')].map((item) => item.href),
      ...[...document.querySelectorAll('[srcset]')].flatMap((item) =>
        item.srcset
          .split(',')
          .map((value) => new URL(value.trim().split(/\s+/u)[0], document.baseURI).href),
      ),
    ].filter(Boolean),
    forms: [...document.querySelectorAll('form')].map((form) => ({
      action: form.action,
      method: form.method,
      inputs: [...form.elements]
        .map((item) => ({ name: item.name, type: item.type }))
        .filter((item) => item.name),
    })),
  }));
  discovered.links
    .map(routeFor)
    .filter(Boolean)
    .forEach((item) => queue.push(item));
  await Promise.allSettled([...new Set(discovered.resources)].map(saveResource));
  discovered.forms.forEach((form) => forms.push({ route, ...form }));

  const htmlPath = routePath(route);
  const destination = path.join(output, htmlPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, await page.content());
  const shots = {};
  for (const viewport of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 1200 },
  ]) {
    await page.setViewportSize(viewport);
    const shot = path.join(
      screenshots,
      `${route === '/' ? 'home' : hash(route).slice(0, 12)}-${viewport.name}.png`,
    );
    await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' });
    shots[viewport.name] = path.relative(process.cwd(), shot).replaceAll(path.sep, '/');
  }
  pages.push({
    route,
    status: response?.status() ?? 200,
    title: discovered.title,
    htmlPath,
    screenshots: shots,
  });
}

const missing = await page
  .goto(new URL('/__snapshot-404__/', source).href, { waitUntil: 'domcontentloaded' })
  .catch(() => null);
if (missing?.status() === 404) await writeFile(path.join(output, '404.html'), await page.content());
await browser.close();
if (redirects.length)
  await writeFile(
    path.join(output, '_redirects'),
    `${redirects.map((item) => `${item.route} ${item.target} ${item.status}`).join('\n')}\n`,
  );

for (const root of [output, dataRoot]) {
  for (const file of await walk(root)) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    const content = await readFile(file, 'utf8').catch(() => null);
    if (content !== null) await writeFile(file, rewrite(content, resourceMap, relative));
  }
}

const files = [];
for (const file of await walk(output)) {
  const body = await readFile(file);
  files.push({
    path: path.relative(output, file).replaceAll(path.sep, '/'),
    bytes: body.length,
    sha256: hash(body),
  });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'local-wordpress-reference',
  productionOrigin: production.origin,
  pages: pages.sort((a, b) => a.route.localeCompare(b.route)),
  redirects,
  resources: [...resources.values()].sort((a, b) => a.path.localeCompare(b.path)),
  files,
  dynamicFeatures: forms,
  consoleErrors: [...new Set(consoleErrors)],
  totals: {
    pages: pages.length,
    redirects: redirects.length,
    resources: resources.size,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    copiedPublicFiles,
  },
};
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (!files.some((file) => file.path === 'index.html')) throw new Error('No se generó index.html.');
process.stdout.write(`${JSON.stringify(manifest.totals, null, 2)}\n`);
