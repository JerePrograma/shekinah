#!/usr/bin/env node
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const maxAssetBytes = 25 * 1024 * 1024;
const maxFiles = 20_000;
const allowedProductionHost = 'shekinah-7dl.pages.dev';
const forbidden = [
  /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/giu,
  /chocolate-chimpanzee-908881\.hostingersite\.com/giu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  /\b(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|DB_PASSWORD)\s*[:=]/giu,
];
const activeDynamicEndpoints = [
  /(?:href|src|action)=["'][^"']*(?:\/wp-admin\/|\/wp-login\.php|\/xmlrpc\.php|\/wp-cron\.php|\/wp-comments-post\.php|admin-ajax\.php)[^"']*["']/giu,
  /<form\b[^>]*\baction=["']https?:\/\//giu,
];
const textExtensions = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.xml',
  '.txt',
  '.webmanifest',
  '.svg',
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

function resolvePublicReference(htmlFile, reference) {
  const clean = reference.split('#')[0].split('?')[0];
  if (!clean || /^(?:https?:|mailto:|tel:|data:|javascript:|blob:)/iu.test(clean)) return null;
  const relative = clean.startsWith('/')
    ? clean.slice(1)
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(path.relative(root, htmlFile)), clean),
      );
  if (relative.endsWith('/')) return path.join(root, relative, 'index.html');
  if (path.extname(relative)) return path.join(root, relative);
  return path.join(root, relative, 'index.html');
}

if (!(await exists(root))) {
  process.stderr.write(
    'Auditoría bloqueada: no existe dist/. Ejecute primero npm run build y corrija el primer error del build.\n',
  );
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

  if (files.length > maxFiles) {
    report.errors.push(`dist contiene ${files.length} archivos; Cloudflare Pages Free admite ${maxFiles}`);
  }

  for (const file of files) {
    const fileStat = await stat(file);
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    report.totalBytes += fileStat.size;
    if (fileStat.size > report.largestFile.bytes) {
      report.largestFile = { path: relative, bytes: fileStat.size };
    }
    if (fileStat.size > maxAssetBytes) report.errors.push(`${relative}: supera 25 MiB`);
    if (relative.endsWith('.map')) report.errors.push(`${relative}: sourcemap no permitido`);
    if (
      /\.(?:bak|gz|log|php|sql|tar|zip)$/iu.test(relative) ||
      /(?:^|\/)wp-config\.php$/iu.test(relative)
    ) {
      report.errors.push(`${relative}: archivo prohibido`);
    }

    const extension = path.extname(file).toLowerCase();
    if (!textExtensions.has(extension) && path.basename(file) !== '_redirects') continue;
    const content = await readFile(file, 'utf8').catch(() => '');

    for (const pattern of forbidden) {
      if (pattern.test(content)) report.errors.push(`${relative}: contiene patrón prohibido ${pattern}`);
      pattern.lastIndex = 0;
    }
    if (extension === '.html') {
      for (const pattern of activeDynamicEndpoints) {
        if (pattern.test(content)) report.errors.push(`${relative}: endpoint dinámico activo ${pattern}`);
        pattern.lastIndex = 0;
      }
    }

    if (extension !== '.html') continue;
    report.htmlFiles += 1;
    if (!/<title>[^<]+<\/title>/iu.test(content)) report.errors.push(`${relative}: falta título`);

    const references = [
      ...content.matchAll(/\bsrc=["']([^"']+)["']/giu),
      ...content.matchAll(/\bposter=["']([^"']+)["']/giu),
      ...content.matchAll(/\bsrcset=["']([^"']+)["']/giu),
      ...content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/giu),
      ...content.matchAll(
        /<link\b(?=[^>]*\brel=["'](?:stylesheet|icon|preload|modulepreload)["'])[^>]*\bhref=["']([^"']+)["']/giu,
      ),
    ].flatMap((match) =>
      match[0].toLowerCase().includes('srcset=')
        ? match[1].split(',').map((part) => part.trim().split(/\s+/u)[0])
        : [match[1]],
    );

    for (const reference of references) {
      if (/^https?:\/\//iu.test(reference)) {
        const url = new URL(reference);
        if (url.hostname !== allowedProductionHost) report.externalResourceOrigins.add(url.origin);
        continue;
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
  }

  for (const requiredFile of ['index.html', '404.html', 'robots.txt']) {
    if (!(await exists(path.join(root, requiredFile)))) report.errors.push(`falta ${requiredFile}`);
  }
  if (
    !(await exists(path.join(root, 'sitemap.xml'))) &&
    !(await exists(path.join(root, 'sitemap-index.xml'))) &&
    !(await exists(path.join(root, 'wp-sitemap.xml')))
  ) {
    report.errors.push('falta sitemap.xml, sitemap-index.xml o wp-sitemap.xml');
  }

  const redirectsPath = path.join(root, '_redirects');
  if (await exists(redirectsPath)) {
    const rules = (await readFile(redirectsPath, 'utf8'))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (rules.length > 2100) {
      report.errors.push(`_redirects contiene ${rules.length} reglas; máximo 2100`);
    }
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
