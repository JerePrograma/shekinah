#!/usr/bin/env node
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const maxAssetBytes = 25 * 1024 * 1024;
const maxFiles = 20_000;
const siteOrigin = (process.env.SITE_ORIGIN ?? 'https://shekinah-7dl.pages.dev').replace(/\/+$/u, '');
const productionUrl = new URL(`${siteOrigin}/`);
const configuredBase = process.env.SITE_BASE_PATH ?? '/';
const siteBasePath = configuredBase === '/' ? '' : `/${configuredBase.replace(/^\/+|\/+$/gu, '')}`;
const forbidden = [
  /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/giu,
  /chocolate-chimpanzee-908881\.hostingersite\.com/giu,
  /jereprograma\.github\.io\/shekinah/giu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  /\b(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|DB_PASSWORD)\s*[:=]/giu,
];
const activeDynamicEndpoints = [
  /\s(?:href|src|action)=["'][^"']*(?:\/wp-admin\/|\/wp-login\.php|\/xmlrpc\.php|\/wp-cron\.php|\/wp-comments-post\.php|admin-ajax\.php)[^"']*["']/giu,
  /<form\b[^>]*\saction=["']https?:\/\//giu,
];
const textExtensions = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.webmanifest', '.svg']);
const inferableExtensions = new Set([
  ...textExtensions,
  '.avif',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function stripBasePath(value) {
  if (!siteBasePath) return value;
  if (value === siteBasePath || value === `${siteBasePath}/`) return '/';
  if (value.startsWith(`${siteBasePath}/`)) return value.slice(siteBasePath.length);
  return value;
}

function resolvePublicReference(htmlFile, reference) {
  let clean = reference.split('#')[0].split('?')[0];
  if (!clean || /^(?:https?:|mailto:|tel:|data:|javascript:|blob:|#)/iu.test(clean)) return null;
  clean = stripBasePath(clean);
  const relative = clean.startsWith('/')
    ? clean.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(path.relative(root, htmlFile)), clean));
  if (relative.endsWith('/')) return path.join(root, relative, 'index.html');
  if (path.extname(relative)) return path.join(root, relative);
  return path.join(root, relative, 'index.html');
}

if (!(await exists(root))) {
  process.stderr.write('Auditoría bloqueada: no existe dist/. Ejecute primero npm run build.\n');
  process.exitCode = 2;
} else {
  const files = await walk(root);
  const report = {
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes: 0,
    largestFile: { path: '', bytes: 0 },
    htmlFiles: 0,
    externalResourceOrigins: new Set(),
    errors: [],
  };

  if (files.length > maxFiles) report.errors.push(`dist contiene ${files.length} archivos; supera el límite operativo de ${maxFiles}`);

  for (const file of files) {
    const fileStat = await stat(file);
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    report.totalBytes += fileStat.size;
    if (fileStat.size > report.largestFile.bytes) report.largestFile = { path: relative, bytes: fileStat.size };
    if (fileStat.size > maxAssetBytes) report.errors.push(`${relative}: supera 25 MiB`);
    if (fileStat.size === 0) report.errors.push(`${relative}: archivo vacío inesperado`);
    if (relative.endsWith('.map')) report.errors.push(`${relative}: sourcemap no permitido`);
    if (/\.(?:bak|gz|log|php|sql|tar|zip)$/iu.test(relative) || /(?:^|\/)wp-config\.php$/iu.test(relative)) {
      report.errors.push(`${relative}: archivo prohibido`);
    }

    const extension = path.extname(file).toLowerCase();
    if (!inferableExtensions.has(extension)) report.errors.push(`${relative}: tipo MIME no inferible por extensión`);
    if (!textExtensions.has(extension)) continue;
    const content = await readFile(file, 'utf8').catch(() => '');

    for (const pattern of forbidden) {
      if (pattern.test(content)) report.errors.push(`${relative}: contiene un patrón prohibido`);
      pattern.lastIndex = 0;
    }

    if (extension !== '.html') continue;
    report.htmlFiles += 1;
    if (!/<title>[^<]+<\/title>/iu.test(content)) report.errors.push(`${relative}: falta título`);
    for (const pattern of activeDynamicEndpoints) {
      if (pattern.test(content)) report.errors.push(`${relative}: contiene un endpoint dinámico activo`);
      pattern.lastIndex = 0;
    }

    const resourceReferences = [
      ...content.matchAll(/\bsrc=["']([^"']+)["']/giu),
      ...content.matchAll(/\bposter=["']([^"']+)["']/giu),
      ...content.matchAll(/\bsrcset=["']([^"']+)["']/giu),
      ...content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/giu),
      ...content.matchAll(/<link\b(?=[^>]*\brel=["'](?:stylesheet|icon|preload|modulepreload)["'])[^>]*\bhref=["']([^"']+)["']/giu),
    ].flatMap((match) =>
      match[0].toLowerCase().includes('srcset=')
        ? match[1].split(',').map((part) => part.trim().split(/\s+/u)[0])
        : [match[1]],
    );
    const references = [
      ...resourceReferences,
      ...[...content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/giu)].map((match) => match[1]),
    ];

    for (let reference of references) {
      if (/^https?:\/\//iu.test(reference)) {
        const url = new URL(reference);
        if (url.origin !== productionUrl.origin) {
          report.externalResourceOrigins.add(url.origin);
          if (resourceReferences.includes(reference)) report.errors.push(`${relative}: recurso externo activo ${url.origin}`);
          continue;
        }
        reference = `${url.pathname}${url.search}${url.hash}`;
      }
      const resolved = resolvePublicReference(file, reference);
      if (!resolved) continue;
      try {
        const targetStat = await stat(resolved);
        if (!targetStat.isFile()) report.errors.push(`${relative}: referencia inválida ${reference}`);
      } catch {
        report.errors.push(`${relative}: referencia rota ${reference}`);
      }
    }

    if (!/<meta\b[^>]*http-equiv=["']refresh["']/iu.test(content) && relative !== '404.html') {
      const canonical = content.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/iu)?.[1];
      if (!canonical?.startsWith(`${siteOrigin}/`)) report.errors.push(`${relative}: canonical ausente o fuera del dominio final`);
    }
  }

  for (const requiredFile of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) {
    if (!(await exists(path.join(root, requiredFile)))) report.errors.push(`falta ${requiredFile}`);
  }

  const robotsPath = path.join(root, 'robots.txt');
  if (await exists(robotsPath)) {
    const robots = await readFile(robotsPath, 'utf8');
    if (/\bSitemap:/iu.test(robots) && !robots.includes(`${siteOrigin}/`)) {
      report.errors.push('robots.txt referencia un sitemap fuera del dominio final');
    }
  }

  const sitemapPath = path.join(root, 'sitemap.xml');
  if (await exists(sitemapPath)) {
    const sitemap = await readFile(sitemapPath, 'utf8');
    if (!sitemap.includes(`${siteOrigin}/`)) report.errors.push('sitemap.xml no referencia el dominio final');
  }

  const printable = {
    ...report,
    externalResourceOrigins: [...report.externalResourceOrigins].sort(),
  };
  process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
  if (report.errors.length > 0) {
    process.stderr.write(`Auditoría de salida fallida con ${report.errors.length} error(es).\n`);
    process.exitCode = 3;
  }
}
