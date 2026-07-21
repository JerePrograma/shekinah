#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const forbidden = [
  /https?:\/\/localhost(?::\d+)?/giu,
  /chocolate-chimpanzee-908881\.hostingersite\.com/giu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  /\b(?:AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|DB_PASSWORD)\s*[:=]/giu,
  /\.php(?:["'<\s?]|$)/giu,
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

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

function resolvePublicReference(htmlFile, reference) {
  const clean = reference.split('#')[0].split('?')[0];
  if (!clean || /^(?:https?:|mailto:|tel:|data:|javascript:)/iu.test(clean)) return null;

  const relative = clean.startsWith('/')
    ? clean.slice(1)
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(path.relative(root, htmlFile)), clean),
      );

  if (relative.endsWith('/')) return path.join(root, relative, 'index.html');
  const direct = path.join(root, relative);
  if (path.extname(relative)) return direct;
  return path.join(root, relative, 'index.html');
}

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

for (const file of files) {
  const fileStat = await stat(file);
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  report.totalBytes += fileStat.size;
  if (fileStat.size > report.largestFile.bytes) {
    report.largestFile = { path: relative, bytes: fileStat.size };
  }
  if (fileStat.size > 95 * 1024 * 1024) report.errors.push(`${relative}: supera 95 MiB`);
  if (relative.endsWith('.map')) report.errors.push(`${relative}: sourcemap no permitido`);

  const extension = path.extname(file).toLowerCase();
  if (!textExtensions.has(extension) && path.basename(file) !== '_redirects') continue;
  const content = await readFile(file, 'utf8').catch(() => '');

  for (const pattern of forbidden) {
    if (pattern.test(content)) report.errors.push(`${relative}: contiene patrón prohibido ${pattern}`);
    pattern.lastIndex = 0;
  }

  if (extension !== '.html') continue;
  report.htmlFiles += 1;
  if (!/<title>[^<]+<\/title>/iu.test(content)) report.errors.push(`${relative}: falta título`);

  const references = [
    ...content.matchAll(/\bsrc=["']([^"']+)["']/giu),
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
      if (!['shekinah-7dl.pages.dev'].includes(url.hostname)) {
        report.externalResourceOrigins.add(url.origin);
      }
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

const printable = {
  ...report,
  externalResourceOrigins: [...report.externalResourceOrigins].sort(),
};
process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
if (report.errors.length > 0) {
  throw new Error(`Auditoría de salida fallida con ${report.errors.length} error(es).`);
}
