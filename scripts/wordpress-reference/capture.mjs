#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith('--') ? next : 'true';
    if (parsed[key] !== 'true') index += 1;
  }
  return parsed;
}

const args = parseArguments(process.argv.slice(2));
if (!args.source) {
  throw new Error(
    'Falta --source. La URL debe construirse desde LOCAL_PORT en Run-FullMigration.ps1.',
  );
}
const source = new URL(args.source);
const production = new URL(process.env.SITE_URL ?? 'https://shekinah-7dl.pages.dev');
const output = path.resolve(args.output ?? 'reference-snapshot/site');
const screenshots = path.resolve(args.screenshots ?? 'reference-snapshot/screenshots');
const manifestPath = path.resolve(args.manifest ?? 'reference-snapshot/manifest.json');
const dataRoot = path.resolve(args.metadata ?? 'reference-snapshot/data');
const snapshotBase = path.dirname(manifestPath);
const maxPages = Number(args['max-pages'] ?? 200);
if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
  throw new Error(`--max-pages debe ser un entero positivo; recibido: ${args['max-pages']}`);
}
const oldHosts = new Set(['chocolate-chimpanzee-908881.hostingersite.com']);
const seedRoutes = [
  '/',
  '/inicio/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/terms-and-conditions/',
  '/terminos-condiciones/',
];
const blockedPathPrefixes = [
  '/wp-admin',
  '/wp-login.php',
  '/wp-cron.php',
  '/xmlrpc.php',
  '/wp-comments-post.php',
  '/wp-json/wp/v2/users',
];
const blockedExactResources = new Set(['/wp-admin/admin-ajax.php']);
const textContentTypes = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/javascript',
  'text/plain',
  'text/xml',
]);
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const maxAssetBytes = 25 * 1024 * 1024;
const hash = (body) => createHash('sha256').update(body).digest('hex');
const omittedRouteMap = new Map();

function recordOmitted(value, reason) {
  if (omittedRouteMap.size >= 5000) return;
  let route = String(value);
  try {
    const url = normalizeSourceUrl(value);
    if (url.origin !== source.origin) return;
    route = `${url.pathname}${url.search}`;
  } catch {
    // Preserve the malformed value without exposing the local origin.
  }
  route = sanitizeDiagnostic(route);
  omittedRouteMap.set(`${route}\u0000${reason}`, { route, reason });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertSnapshotPath(target, label) {
  const relative = path.relative(snapshotBase, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} debe ser una subcarpeta de ${snapshotBase}: ${target}`);
  }
}

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function normalizeSourceUrl(value) {
  const url = new URL(value, source);
  if (oldHosts.has(url.hostname)) {
    return new URL(`${url.pathname}${url.search}${url.hash}`, source);
  }
  return url;
}

function isBlockedUrl(value) {
  const url = normalizeSourceUrl(value);
  if (url.origin !== source.origin) return false;
  return (
    blockedExactResources.has(url.pathname) ||
    blockedPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))
  );
}

function routeFor(value) {
  let url;
  try {
    url = normalizeSourceUrl(value);
  } catch {
    recordOmitted(value, 'invalid-url');
    return null;
  }
  if (url.origin !== source.origin) return null;
  if (isBlockedUrl(url)) {
    recordOmitted(url, 'private-or-dynamic-endpoint');
    return null;
  }
  if (
    [...url.searchParams.keys()].some((key) =>
      /^(?:_wpnonce|preview|preview_id|preview_nonce|rest_route|s)$/iu.test(key),
    ) ||
    url.pathname.startsWith('/author/') ||
    /\/(?:embed|feed)\/?$/iu.test(url.pathname) ||
    /^\/\d{4}(?:\/\d{2})?\/?$/u.test(url.pathname)
  ) {
    recordOmitted(url, 'preview-search-feed-or-calendar');
    return null;
  }
  if (/\[(?:your|tu|su)\b|(?:your|tu|su)%20website/iu.test(url.pathname)) {
    recordOmitted(url, 'placeholder-url');
    return null;
  }
  let route;
  try {
    route = decodeURI(url.pathname);
  } catch {
    recordOmitted(url, 'invalid-path-encoding');
    return null;
  }
  if (path.posix.extname(route)) {
    recordOmitted(url, 'resource-not-page');
    return null;
  }
  if (!path.posix.extname(route) && !route.endsWith('/')) route += '/';
  return route || '/';
}

function routePath(route) {
  if (route === '/') return 'index.html';
  const clean = route.replace(/^\/+|\/+$/gu, '');
  return path.posix.extname(clean) ? clean : `${clean}/index.html`;
}

function extensionForContentType(contentType) {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  const types = {
    'application/font-woff': '.woff',
    'application/javascript': '.js',
    'application/json': '.json',
    'application/ld+json': '.json',
    'application/pdf': '.pdf',
    'application/vnd.ms-fontobject': '.eot',
    'application/xml': '.xml',
    'font/otf': '.otf',
    'font/ttf': '.ttf',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'text/css': '.css',
    'text/html': '.html',
    'text/javascript': '.js',
    'text/plain': '.txt',
    'text/xml': '.xml',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return types[normalized] ?? '';
}

function safePathname(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = url.pathname;
  }
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      [...segment]
        .map((character) => (character.codePointAt(0) < 32 ? '_' : character))
        .join('')
        .replaceAll(/[<>:"|?*]/gu, '_'),
    )
    .filter((segment) => segment !== '.' && segment !== '..');
  return segments.join('/');
}

function assetPath(value, contentType = '') {
  const original = new URL(value, source);
  const url = normalizeSourceUrl(original);
  let pathname = safePathname(url) || 'index';
  if (!path.posix.extname(pathname)) pathname += extensionForContentType(contentType);
  if (url.search) {
    const parsed = path.posix.parse(pathname);
    pathname = path.posix.join(
      parsed.dir,
      `${parsed.name}-${hash(url.search).slice(0, 12)}${parsed.ext}`,
    );
  }
  if (url.origin === source.origin) return pathname;
  const parsed = path.posix.parse(pathname);
  const filename = `${parsed.name || 'asset'}-${hash(original.href).slice(0, 16)}${parsed.ext}`;
  return path.posix.join('__external', url.hostname, parsed.dir, filename);
}

function publicValue(value) {
  const original = new URL(value, source);
  const normalized = normalizeSourceUrl(original);
  if (normalized.origin === source.origin) return `${normalized.pathname}${normalized.search}`;
  return original.href;
}

function sanitizeDiagnostic(value) {
  return String(value)
    .split(source.origin)
    .join('[source]')
    .replaceAll('chocolate-chimpanzee-908881.hostingersite.com', production.host);
}

function isTextResource(contentType, filePath) {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return (
    textContentTypes.has(normalized) || textExtensions.has(path.extname(filePath).toLowerCase())
  );
}

function extractCssReferences(content, baseUrl) {
  const references = new Set();
  for (const match of content.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/giu)) {
    const raw = match[2].trim();
    if (!raw || /^(?:data:|blob:|#)/iu.test(raw)) continue;
    try {
      references.add(new URL(raw, baseUrl).href);
    } catch {
      // Ignore malformed CSS tokens; they remain visible in the final audit.
    }
  }
  for (const match of content.matchAll(
    /@import\s+(?:url\(\s*)?(?:["']([^"']+)["']|([^\s;)]+))\s*\)?/giu,
  )) {
    try {
      references.add(new URL(match[1] ?? match[2], baseUrl).href);
    } catch {
      // Ignore malformed imports.
    }
  }
  return [...references];
}

function rewriteCss(content, baseUrl, resourceMap) {
  return content.replace(/url\(\s*(["']?)(.*?)\1\s*\)/giu, (full, quote, raw) => {
    const trimmed = raw.trim();
    if (!trimmed || /^(?:data:|blob:|#)/iu.test(trimmed)) return full;
    try {
      const resolved = new URL(trimmed, baseUrl).href;
      const local = resourceMap.get(resolved) ?? resourceMap.get(normalizeSourceUrl(resolved).href);
      const delimiter = quote || '"';
      return local ? `url(${delimiter}/${local}${delimiter})` : full;
    } catch {
      return full;
    }
  });
}

function rewriteText(content, resourceMap, relative = '', baseUrl = source) {
  let result = content;
  if (path.extname(relative).toLowerCase() === '.css') {
    result = rewriteCss(result, baseUrl, resourceMap);
  }
  for (const [url, local] of [...resourceMap].sort(
    ([left], [right]) => right.length - left.length,
  )) {
    const parsed = new URL(url);
    const variants = new Set([
      url,
      url.replaceAll('&', '&amp;'),
      `//${parsed.host}${parsed.pathname}${parsed.search}`,
    ]);
    if (parsed.origin === source.origin) {
      variants.add(`${parsed.pathname}${parsed.search}`);
      variants.add(`${parsed.pathname}${parsed.search}`.replaceAll('&', '&amp;'));
    }
    for (const variant of variants) result = result.split(variant).join(`/${local}`);
  }

  result = result
    .split(source.origin)
    .join(production.origin)
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

async function settlePage(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (const element of document.querySelectorAll('img, source, iframe, video')) {
      const source = element.getAttribute('data-src') ?? element.getAttribute('data-lazy-src');
      const sourceSet =
        element.getAttribute('data-srcset') ?? element.getAttribute('data-lazy-srcset');
      if (source) element.setAttribute('src', source);
      if (sourceSet) element.setAttribute('srcset', sourceSet);
      if ('loading' in element) element.setAttribute('loading', 'eager');
    }
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += Math.max(300, window.innerHeight * 0.75)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 15_000);
            }),
      ),
    );
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function discoverDocument(page) {
  return page.evaluate(() => {
    const resources = new Set([
      ...performance.getEntriesByType('resource').map((entry) => entry.name),
      ...[...document.querySelectorAll('[src]')].map((item) => item.src),
      ...[...document.querySelectorAll('[poster]')].map((item) => item.poster),
      ...[
        ...document.querySelectorAll(
          'link[rel~="stylesheet"][href], link[rel~="icon"][href], link[rel="preload"][href], link[rel="modulepreload"][href], link[rel="manifest"][href]',
        ),
      ].map((item) => item.href),
      ...[...document.querySelectorAll('[srcset]')].flatMap((item) =>
        item.srcset
          .split(',')
          .map((value) => value.trim().split(/\s+/u)[0])
          .filter(Boolean)
          .map((value) => new URL(value, document.baseURI).href),
      ),
    ]);

    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      for (const property of [
        'backgroundImage',
        'borderImageSource',
        'listStyleImage',
        'maskImage',
      ]) {
        const value = style[property];
        for (const match of value.matchAll(/url\(["']?(.*?)["']?\)/giu)) {
          try {
            resources.add(new URL(match[1], document.baseURI).href);
          } catch {
            // Ignore malformed computed values.
          }
        }
      }
    }
    for (const styleElement of document.querySelectorAll('style')) {
      const content = styleElement.textContent ?? '';
      const references = [
        ...[...content.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/giu)].map((match) => match[2]),
        ...[
          ...content.matchAll(/@import\s+(?:url\(\s*)?(?:["']([^"']+)["']|([^\s;)]+))\s*\)?/giu),
        ].map((match) => match[1] ?? match[2]),
      ];
      for (const reference of references) {
        if (!reference || /^(?:data:|blob:|#)/iu.test(reference)) continue;
        try {
          resources.add(new URL(reference, document.baseURI).href);
        } catch {
          // The output audit reports malformed CSS references.
        }
      }
    }

    return {
      title: document.title,
      links: [...document.querySelectorAll('a[href]')].map((item) => item.href),
      navigation: [...document.querySelectorAll('nav a[href], [role="navigation"] a[href]')].map(
        (item) => ({
          href: item.href,
          label: (item.textContent ?? '').replace(/\s+/gu, ' ').trim(),
        }),
      ),
      resources: [...resources].filter(Boolean),
      forms: [...document.querySelectorAll('form')].map((form) => ({
        action: form.action,
        method: form.method.toUpperCase(),
        fields: [...form.elements]
          .map((item) => ({
            name: item.name,
            type: item.type,
            required: item.required,
          }))
          .filter((item) => item.name && !/(?:nonce|token|security)/iu.test(item.name)),
      })),
    };
  });
}

async function serializeStaticDocument(page, resourceMap, route) {
  const mappings = Object.fromEntries(resourceMap);
  const canonicalHref = new URL(route, production).href;
  return page.evaluate(
    ({ mapping, canonical }) => {
      const root = new DOMParser().parseFromString(
        document.documentElement.outerHTML,
        'text/html',
      ).documentElement;
      const localFor = (value) => {
        if (!value || /^(?:data:|blob:|#)/iu.test(value)) return null;
        try {
          const absolute = new URL(value, document.baseURI).href;
          const local = mapping[absolute];
          return local ? `/${local}` : null;
        } catch {
          return null;
        }
      };

      for (const element of root.querySelectorAll('[src], [poster]')) {
        for (const attribute of ['src', 'poster']) {
          if (!element.hasAttribute(attribute)) continue;
          const local = localFor(element.getAttribute(attribute));
          if (local) element.setAttribute(attribute, local);
        }
      }
      for (const element of root.querySelectorAll('link[href]')) {
        const relationship = (element.getAttribute('rel') ?? '').toLowerCase();
        if (!/(?:stylesheet|icon|preload|modulepreload|manifest)/u.test(relationship)) continue;
        const local = localFor(element.getAttribute('href'));
        if (local) element.setAttribute('href', local);
      }
      for (const element of root.querySelectorAll('[srcset]')) {
        const localized = (element.getAttribute('srcset') ?? '')
          .split(',')
          .map((candidate) => {
            const parts = candidate.trim().split(/\s+/u);
            const local = localFor(parts[0]);
            return [local ?? parts[0], ...parts.slice(1)].join(' ');
          })
          .join(', ');
        element.setAttribute('srcset', localized);
      }
      for (const element of root.querySelectorAll('[style]')) {
        const localized = (element.getAttribute('style') ?? '').replace(
          /url\(\s*(["']?)(.*?)\1\s*\)/giu,
          (full, quote, value) => {
            const local = localFor(value.trim());
            const delimiter = quote || '"';
            return local ? `url(${delimiter}${local}${delimiter})` : full;
          },
        );
        element.setAttribute('style', localized);
      }

      for (const element of root.querySelectorAll(
        'link[rel="https://api.w.org/"], link[rel="EditURI"], link[rel="wlwmanifest"], link[rel="alternate"][type*="oembed" i]',
      )) {
        element.remove();
      }
      for (const script of root.querySelectorAll('script')) {
        const identifier = script.id.toLowerCase();
        const content = script.textContent ?? '';
        const scriptSource = script.getAttribute('src') ?? '';
        if (
          identifier === 'wp-emoji-settings' ||
          identifier.startsWith('hostinger-reach-subscription-block-view-js') ||
          scriptSource.includes('/wp-includes/js/wp-emoji-release') ||
          content.includes('wpEmojiSettingsSupports') ||
          content.includes('wp-emoji-loader.min.js')
        ) {
          script.remove();
        }
      }
      for (const element of root.querySelectorAll('[src], [href], [action]')) {
        if (element.tagName === 'FORM') continue;
        const value =
          element.getAttribute('src') ??
          element.getAttribute('href') ??
          element.getAttribute('action');
        if (!value) continue;
        try {
          const url = new URL(value, document.baseURI);
          if (
            url.pathname.startsWith('/wp-admin') ||
            ['/wp-login.php', '/wp-cron.php', '/xmlrpc.php', '/wp-comments-post.php'].includes(
              url.pathname,
            ) ||
            url.pathname.endsWith('/admin-ajax.php')
          ) {
            element.remove();
          }
        } catch {
          // Keep malformed non-network attributes for the final audit.
        }
      }
      for (const anchor of root.querySelectorAll('a[href]')) {
        const href = (anchor.getAttribute('href') ?? '').trim();
        if (/^\[[^\]]+\]$/u.test(href) || /^(?:https?:\/\/|mailto:|tel:)trans[-_]/iu.test(href)) {
          anchor.dataset.migrationStatus = 'link-not-configured';
          anchor.setAttribute('href', '#link-not-configured');
          anchor.setAttribute('aria-disabled', 'true');
          anchor.removeAttribute('target');
        }
      }
      const head = root.querySelector('head');
      if (head) {
        let canonicalLink = head.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
          canonicalLink = document.createElement('link');
          canonicalLink.setAttribute('rel', 'canonical');
          head.appendChild(canonicalLink);
        }
        canonicalLink.setAttribute('href', canonical);
        let openGraphUrl = head.querySelector('meta[property="og:url"]');
        if (!openGraphUrl) {
          openGraphUrl = document.createElement('meta');
          openGraphUrl.setAttribute('property', 'og:url');
          head.appendChild(openGraphUrl);
        }
        openGraphUrl.setAttribute('content', canonical);
      }
      for (const form of root.querySelectorAll('form')) {
        const original = new URL(
          form.getAttribute('action') || document.location.href,
          document.baseURI,
        );
        form.dataset.originalAction =
          original.origin === document.location.origin
            ? `${original.pathname}${original.search}`
            : original.href;
        form.dataset.originalMethod = form.method.toUpperCase();
        form.dataset.migrationStatus = 'processing-not-migrated';
        form.setAttribute('action', '#form-processing-not-migrated');
        form.setAttribute('method', 'get');
        form.setAttribute('onsubmit', 'return false');
        for (const field of form.querySelectorAll('input[type="hidden"]')) {
          if (/(?:nonce|token|security)/iu.test(field.name)) field.remove();
        }
      }
      return `<!doctype html>\n${root.outerHTML}`;
    },
    { mapping: mappings, canonical: canonicalHref },
  );
}

assertSnapshotPath(output, '--output');
assertSnapshotPath(screenshots, '--screenshots');
assertSnapshotPath(dataRoot, '--metadata');
await rm(output, { recursive: true, force: true });
await rm(screenshots, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
await mkdir(dataRoot, { recursive: true });

const sourceAvailable = await fetch(new URL('/inicio/', source), {
  redirect: 'manual',
  signal: AbortSignal.timeout(60_000),
})
  .then((response) => response.status >= 200 && response.status < 500)
  .catch(() => false);
if (!sourceAvailable) throw new Error(`WordPress no responde en ${source.origin}.`);

const copiedPublicFiles = 0;

const queue = [...seedRoutes];
const sitemapDocuments = new Set();

async function collectSitemap(value) {
  const url = normalizeSourceUrl(value);
  if (url.origin !== source.origin || sitemapDocuments.has(url.href)) return false;
  if (/(?:^|[-/])users?(?:[-/.]|$)|(?:^|[-/])authors?(?:[-/.]|$)/iu.test(url.pathname)) {
    recordOmitted(url, 'user-or-author-sitemap');
    return false;
  }
  sitemapDocuments.add(url.href);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!response?.ok) return false;
  const xml = (await response.text()).replace(
    /<sitemap>\s*<loc>[^<]*(?:users?|authors?)[^<]*<\/loc>[\s\S]*?<\/sitemap>/giu,
    '',
  );
  const relative = safePathname(url) || 'sitemap.xml';
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, xml, 'utf8');
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/giu)) {
    const found = match[1].replaceAll('&amp;', '&');
    if (/\.xml(?:\?|$)/iu.test(found)) await collectSitemap(found);
    else queue.push(found);
  }
  return true;
}

for (const sitemapName of ['wp-sitemap.xml', 'sitemap-index.xml', 'sitemap.xml']) {
  if (await collectSitemap(new URL(`/${sitemapName}`, source))) break;
}

const robotsResponse = await fetch(new URL('/robots.txt', source)).catch(() => null);
if (robotsResponse?.ok) {
  await writeFile(path.join(output, 'robots.txt'), await robotsResponse.text(), 'utf8');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  serviceWorkers: 'block',
  viewport: { width: 1440, height: 1200 },
});
let activeRoute = '/';
const neutralizedRequests = [];
await context.route('**/*', async (route) => {
  const request = route.request();
  if (isBlockedUrl(request.url())) {
    neutralizedRequests.push({
      route: activeRoute,
      resourceType: request.resourceType(),
      url: sanitizeDiagnostic(publicValue(request.url())),
    });
    await route.fulfill({ status: 204, body: '' });
    return;
  }
  const requestUrl = new URL(request.url());
  if (requestUrl.origin !== source.origin && request.resourceType() !== 'document') {
    try {
      const response = await route.fetch({ maxRetries: 3, timeout: 60_000 });
      await route.fulfill({ response });
      return;
    } catch {
      // Continue once through Chromium so the final manifest records a real failure if retries exhaust.
    }
  }
  await route.continue();
});
const page = await context.newPage();
const seen = new Set();
const pages = [];
const redirects = [];
const forms = [];
const consoleErrors = [];
const httpErrors = [];
const unrecoverablePages = [];
const resourceMap = new Map();
const resources = new Map();
const resourceBaseUrls = new Map();

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return { response };
      }
      lastError = new Error(`HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  return { response: null, error: lastError };
}

page.on('console', (message) => {
  if (message.type() === 'error') {
    if (
      activeRoute === '/__snapshot-404__/' &&
      /Failed to load resource:.*404 \(Not Found\)/iu.test(message.text())
    ) {
      return;
    }
    consoleErrors.push({ route: activeRoute, message: sanitizeDiagnostic(message.text()) });
  }
});
page.on('pageerror', (error) => {
  consoleErrors.push({ route: activeRoute, message: sanitizeDiagnostic(error.message) });
});
page.on('response', (response) => {
  if (response.status() >= 400 && response.request().resourceType() !== 'document') {
    httpErrors.push({
      route: activeRoute,
      status: response.status(),
      url: sanitizeDiagnostic(publicValue(response.url())),
      resourceType: response.request().resourceType(),
    });
  }
});

async function saveResource(value, ancestry = new Set()) {
  if (!value || !/^https?:/iu.test(value)) return;
  const original = new URL(value, source);
  const requestUrl = normalizeSourceUrl(original);
  if (isBlockedUrl(requestUrl)) return;
  if (resourceMap.has(original.href) || resourceMap.has(requestUrl.href)) return;
  if (ancestry.has(requestUrl.href)) return;

  const nextAncestry = new Set(ancestry).add(requestUrl.href);
  const fetched = await fetchWithRetry(requestUrl);
  const response = fetched.response;
  if (!response) {
    httpErrors.push({
      route: activeRoute,
      status: 0,
      url: sanitizeDiagnostic(publicValue(original)),
      resourceType: 'fetch',
      error: sanitizeDiagnostic(fetched.error?.message ?? 'fetch failed after retries'),
    });
  }
  if (!response?.ok) {
    if (response) {
      httpErrors.push({
        route: activeRoute,
        status: response.status,
        url: sanitizeDiagnostic(publicValue(original)),
        resourceType: 'fetch',
      });
    }
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > maxAssetBytes) {
    httpErrors.push({
      route: activeRoute,
      status: 0,
      url: sanitizeDiagnostic(publicValue(original)),
      resourceType: 'asset-too-large',
      error: `${body.length} bytes supera 25 MiB`,
    });
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const local = assetPath(original, contentType);
  const destination = path.join(output, local);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body);
  resourceMap.set(original.href, local);
  resourceMap.set(requestUrl.href, local);
  resourceMap.set(response.url, local);
  resourceBaseUrls.set(local, response.url || requestUrl.href);

  const normalizedOriginal = normalizeSourceUrl(original);
  resources.set(local, {
    url:
      normalizedOriginal.origin === source.origin
        ? `${normalizedOriginal.pathname}${normalizedOriginal.search}`
        : original.href,
    path: local,
    contentType,
    bytes: body.length,
    sha256: hash(body),
    external: normalizedOriginal.origin !== source.origin,
  });

  if (contentType.toLowerCase().startsWith('text/css')) {
    const css = body.toString('utf8');
    await Promise.all(
      extractCssReferences(css, response.url || requestUrl.href).map((dependency) =>
        saveResource(dependency, nextAncestry),
      ),
    );
  }
}

while (queue.length > 0 && seen.size < maxPages) {
  const route = routeFor(queue.shift());
  if (!route || seen.has(route)) continue;
  seen.add(route);
  activeRoute = route;

  const initial = await fetch(new URL(route, source), {
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  }).catch((error) => {
    unrecoverablePages.push({ route, error: sanitizeDiagnostic(error.message) });
    return null;
  });
  if (!initial) continue;

  if ([301, 302, 303, 307, 308].includes(initial.status)) {
    const location = initial.headers.get('location');
    if (!location) {
      unrecoverablePages.push({ route, status: initial.status, error: 'redirección sin Location' });
      continue;
    }
    const internalTarget = routeFor(location);
    const target = internalTarget ?? publicValue(location);
    redirects.push({ route, target, status: initial.status });
    const destination = path.join(output, routePath(route));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><meta name="robots" content="noindex"><title>Redirección</title></head><body><a href="${target}">Continuar</a></body></html>`,
      'utf8',
    );
    if (internalTarget) queue.push(internalTarget);
    continue;
  }

  if (!initial.ok) {
    unrecoverablePages.push({ route, status: initial.status, error: 'respuesta no recuperable' });
    continue;
  }

  const documentUrl = new URL(route, source).href;
  const initialHtml = await initial.text();
  const serveCapturedDocument = (requestRoute) =>
    requestRoute.fulfill({
      status: initial.status,
      contentType: 'text/html; charset=utf-8',
      body: initialHtml,
    });
  await page.route(documentUrl, serveCapturedDocument, { times: 1 });
  await page.setViewportSize({ width: 1440, height: 1200 });
  let response;
  try {
    response = await page.goto(documentUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
  } finally {
    await page.unroute(documentUrl, serveCapturedDocument);
  }
  if (!response || response.status() >= 400) {
    unrecoverablePages.push({
      route,
      status: response?.status() ?? 0,
      error: 'Chromium no obtuvo una respuesta válida',
    });
    continue;
  }

  await settlePage(page);
  let discovered = await discoverDocument(page);
  discovered.links
    .map(routeFor)
    .filter(Boolean)
    .forEach((item) => queue.push(item));
  await Promise.all([...new Set(discovered.resources)].map((resource) => saveResource(resource)));

  for (const form of discovered.forms) {
    const actionUrl = normalizeSourceUrl(form.action || route);
    const action =
      actionUrl.origin === source.origin
        ? `${actionUrl.pathname}${actionUrl.search}`
        : actionUrl.href;
    forms.push({
      route,
      action,
      method: form.method,
      fields: form.fields,
      processingMigrated: false,
      classification: 'static-interface-only',
    });
  }
  const htmlPath = routePath(route);
  const destination = path.join(output, htmlPath);

  const shots = {};
  for (const viewport of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 1200 },
  ]) {
    activeRoute = route;
    await page.setViewportSize(viewport);
    await settlePage(page);
    discovered = await discoverDocument(page);
    await Promise.all([...new Set(discovered.resources)].map((resource) => saveResource(resource)));
    const shot = path.join(
      screenshots,
      `${route === '/' ? 'home' : hash(route).slice(0, 12)}-${viewport.name}.jpg`,
    );
    try {
      await page.screenshot({
        path: shot,
        type: 'jpeg',
        quality: 85,
        fullPage: true,
        animations: 'disabled',
        timeout: 120_000,
      });
    } catch (error) {
      throw new Error(`Falló screenshot ${viewport.name} de ${route}: ${error.message}`, {
        cause: error,
      });
    }
    shots[viewport.name] = path
      .relative(path.dirname(manifestPath), shot)
      .replaceAll(path.sep, '/');
  }

  const staticHtml = await serializeStaticDocument(page, resourceMap, route);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, staticHtml, 'utf8');

  pages.push({
    route,
    status: response.status(),
    title: sanitizeDiagnostic(discovered.title),
    htmlPath,
    screenshots: shots,
    navigation: discovered.navigation,
  });
}

for (const pending of queue) {
  const route = routeFor(pending);
  if (route && !seen.has(route)) recordOmitted(route, 'max-pages-limit');
}

activeRoute = '/__snapshot-404__/';
await page.setViewportSize({ width: 1440, height: 1200 });
const missing = await page
  .goto(new URL('/__snapshot-404__/', source).href, { waitUntil: 'domcontentloaded' })
  .catch(() => null);
if (missing?.status() === 404) {
  await settlePage(page);
  const discovered = await discoverDocument(page);
  await Promise.all([...new Set(discovered.resources)].map((resource) => saveResource(resource)));
  await writeFile(
    path.join(output, '404.html'),
    await serializeStaticDocument(page, resourceMap, '/404.html'),
    'utf8',
  );
} else {
  unrecoverablePages.push({
    route: '/404.html',
    status: missing?.status() ?? 0,
    error: '404 no recuperada',
  });
}
await browser.close();

if (redirects.length > 0) {
  await writeFile(
    path.join(output, '_redirects'),
    `${redirects.map((item) => `${item.route} ${item.target} ${item.status}`).join('\n')}\n`,
    'utf8',
  );
}

if (!(await exists(path.join(output, 'robots.txt')))) {
  await writeFile(
    path.join(output, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${production.origin}/sitemap.xml\n`,
    'utf8',
  );
}

if (
  !(await exists(path.join(output, 'sitemap.xml'))) &&
  !(await exists(path.join(output, 'sitemap-index.xml'))) &&
  !(await exists(path.join(output, 'wp-sitemap.xml')))
) {
  const urls = pages
    .filter((item) => item.status === 200)
    .map((item) => `  <url><loc>${production.origin}${item.route}</loc></url>`)
    .join('\n');
  await writeFile(
    path.join(output, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8',
  );
}

for (const file of await walk(output)) {
  if (!isTextResource('', file) && path.basename(file) !== '_redirects') continue;
  const relative = path.relative(output, file).replaceAll(path.sep, '/');
  const content = await readFile(file, 'utf8').catch(() => null);
  if (content === null) continue;
  const baseUrl = resourceBaseUrls.get(relative) ?? new URL(relative, source);
  await writeFile(file, rewriteText(content, resourceMap, relative, baseUrl), 'utf8');
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
files.sort((left, right) => left.path.localeCompare(right.path));

const uniqueConsoleErrors = [
  ...new Map(consoleErrors.map((item) => [`${item.route}\u0000${item.message}`, item])).values(),
];
const uniqueHttpErrors = [
  ...new Map(
    httpErrors.map((item) => [
      `${item.route}\u0000${item.status}\u0000${item.url}\u0000${item.resourceType}`,
      item,
    ]),
  ).values(),
];
await writeFile(path.join(dataRoot, 'forms.json'), `${JSON.stringify(forms, null, 2)}\n`, 'utf8');
const snapshotFiles = [];
for (const file of [...(await walk(dataRoot)), ...(await walk(screenshots))]) {
  const body = await readFile(file);
  snapshotFiles.push({
    path: path.relative(snapshotBase, file).replaceAll(path.sep, '/'),
    bytes: body.length,
    sha256: hash(body),
  });
}
snapshotFiles.sort((left, right) => left.path.localeCompare(right.path));
const externalResources = [...resources.values()].filter((item) => item.external);
const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: 'local-wordpress-reference',
  productionOrigin: production.origin,
  pages: pages.sort((left, right) => left.route.localeCompare(right.route)),
  redirects: redirects.sort((left, right) => left.route.localeCompare(right.route)),
  resources: [...resources.values()].sort((left, right) => left.path.localeCompare(right.path)),
  externalResources,
  files,
  snapshotFiles,
  dynamicFeatures: forms,
  consoleErrors: uniqueConsoleErrors,
  httpErrors: uniqueHttpErrors,
  unrecoverablePages,
  omittedRoutes: [...omittedRouteMap.values()].sort((left, right) =>
    left.route.localeCompare(right.route),
  ),
  neutralizedRequests,
  totals: {
    pages: pages.length,
    redirects: redirects.length,
    resources: resources.size,
    externalResources: externalResources.length,
    files: files.length,
    images: files.filter((file) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu.test(file.path)).length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    copiedPublicFiles,
    forms: forms.length,
    consoleErrors: uniqueConsoleErrors.length,
    httpErrors: uniqueHttpErrors.length,
    unrecoverablePages: unrecoverablePages.length,
  },
};
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const readme = `# Snapshot WordPress de referencia

Captura pública generada desde la restauración WordPress local y preparada para Cloudflare Pages.

- Fecha UTC: ${manifest.generatedAt}
- Origen: restauración WordPress local (no versionada)
- Destino canónico: ${production.origin}
- Páginas: ${manifest.totals.pages}
- Redirecciones: ${manifest.totals.redirects}
- Recursos HTTP: ${manifest.totals.resources}
- Recursos externos localizados: ${manifest.totals.externalResources}
- Imágenes: ${manifest.totals.images}
- Archivos: ${manifest.totals.files}
- Bytes: ${manifest.totals.bytes}
- Formularios visibles: ${manifest.totals.forms}
- Errores HTTP: ${manifest.totals.httpErrors}
- Errores de consola: ${manifest.totals.consoleErrors}
- Páginas no recuperables: ${manifest.totals.unrecoverablePages}

El contenido desplegable está en \`site/\`. Los inventarios públicos sanitizados están en \`data/\`, las capturas en \`screenshots/\` y la integridad SHA-256 en \`manifest.json\`.

No se versionan SQL, usuarios, credenciales, sesiones, logs, \`.env\`, \`wp-config.php\` ni endpoints administrativos.
`;
await writeFile(path.join(snapshotBase, 'README.md'), readme, 'utf8');

if (!files.some((file) => file.path === 'index.html')) throw new Error('No se generó index.html.');
process.stdout.write(`${JSON.stringify(manifest.totals, null, 2)}\n`);
if (
  manifest.totals.httpErrors > 0 ||
  manifest.totals.consoleErrors > 0 ||
  manifest.totals.unrecoverablePages > 0
) {
  process.stderr.write(
    'La captura se generó con errores bloqueantes. Revise manifest.json; no publique hasta resolverlos.\n',
  );
  process.exitCode = 4;
}
