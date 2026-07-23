#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://herbalarioonline.com';
const DEFAULT_OUTPUT = '.migration-work/hostinger-public';
const USER_AGENT = 'ShekinahMigrationAudit/1.0 (+https://github.com/JerePrograma/shekinah)';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(stable(value), null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

function parseArguments(argv) {
  const options = { origin: DEFAULT_ORIGIN, output: DEFAULT_OUTPUT, maxPages: 2000, concurrency: 2, timeout: 30_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`Falta valor para ${key}`);
      index += 1;
      return next;
    };
    if (key === '--origin') options.origin = value();
    else if (key === '--output') options.output = value();
    else if (key === '--max-pages') options.maxPages = Number.parseInt(value(), 10);
    else if (key === '--concurrency') options.concurrency = Number.parseInt(value(), 10);
    else if (key === '--timeout-ms') options.timeout = Number.parseInt(value(), 10);
    else if (key === '--help' || key === '-h') options.help = true;
    else throw new Error(`Argumento desconocido: ${key}`);
  }
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 10_000) throw new Error('--max-pages debe estar entre 1 y 10000.');
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) throw new Error('--concurrency debe estar entre 1 y 4.');
  if (!Number.isInteger(options.timeout) || options.timeout < 1000 || options.timeout > 120_000) throw new Error('--timeout-ms debe estar entre 1000 y 120000.');
  return options;
}

function help() {
  return `Uso:
  node scripts/crawl-hostinger-original.mjs [opciones]

Opciones:
  --origin <url>       Origen público (${DEFAULT_ORIGIN})
  --output <dir>       Caché temporal (${DEFAULT_OUTPUT})
  --max-pages <n>      Máximo de páginas (2000)
  --concurrency <n>    Concurrencia entre 1 y 4 (2)
  --timeout-ms <n>     Timeout por solicitud (30000)
`;
}

function canonicalUrl(input, origin) {
  try {
    const url = new URL(input, origin);
    const allowed = new URL(origin);
    if (url.origin !== allowed.origin) return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const parameter of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(parameter)) url.searchParams.delete(parameter);
    }
    if (url.pathname !== '/' && !url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  } catch {
    return null;
  }
}

function htmlLinks(html, baseUrl, origin) {
  const links = new Set();
  for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu)) {
    const raw = match[1] ?? match[2] ?? match[3];
    if (!raw || /^(?:mailto:|tel:|javascript:|data:|blob:|#)/iu.test(raw)) continue;
    const normalized = canonicalUrl(raw, baseUrl);
    if (normalized && new URL(normalized).origin === new URL(origin).origin) links.add(normalized);
  }
  return [...links].sort();
}

function sitemapLinks(xml, origin) {
  const links = new Set();
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/giu)) {
    const normalized = canonicalUrl(match[1], origin);
    if (normalized) links.add(normalized);
  }
  return [...links].sort();
}

async function request(url, options = {}) {
  let failure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: options.accept ?? 'text/html,application/xhtml+xml', 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeout ?? 30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw failure;
}

async function readCached(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function capturePage(url, output, timeout) {
  const key = hash(url);
  const htmlFile = path.join(output, 'html', `${key}.html`);
  const cached = await readCached(htmlFile);
  if (cached) {
    const html = cached.toString('utf8');
    return { url, finalUrl: url, status: 200, source: 'cache', file: path.relative(output, htmlFile).replaceAll(path.sep, '/'), size: cached.length, sha256: hash(cached), links: htmlLinks(html, url, url) };
  }
  const response = await request(url, { timeout });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html')) throw new Error(`MIME no HTML: ${contentType || 'ausente'}`);
  const body = Buffer.from(await response.arrayBuffer());
  const html = body.toString('utf8');
  if (html.includes('\uFFFD')) throw new Error('HTML con UTF-8 inválido.');
  await mkdir(path.dirname(htmlFile), { recursive: true });
  await writeFile(htmlFile, body);
  return {
    url,
    finalUrl: response.url,
    status: response.status,
    source: 'network',
    file: path.relative(output, htmlFile).replaceAll(path.sep, '/'),
    size: body.length,
    sha256: hash(body),
    links: htmlLinks(html, response.url, url),
  };
}

async function crawl(options) {
  const origin = new URL(options.origin).origin;
  const output = path.resolve(options.output);
  const seeds = new Set([canonicalUrl('/', origin)]);
  const discovery = [];
  for (const pathName of ['/robots.txt', '/sitemap.xml', '/sitemap-index.xml']) {
    const url = new URL(pathName, origin).href;
    try {
      const response = await request(url, { accept: 'text/plain,application/xml,text/xml,*/*', timeout: options.timeout });
      const body = Buffer.from(await response.arrayBuffer());
      const name = pathName.slice(1).replaceAll('/', '-') || 'root';
      await mkdir(path.join(output, 'discovery'), { recursive: true });
      await writeFile(path.join(output, 'discovery', name), body);
      discovery.push({ url, status: response.status, size: body.length, sha256: hash(body) });
      if (pathName.includes('sitemap')) for (const item of sitemapLinks(body.toString('utf8'), origin)) seeds.add(item);
    } catch (error) {
      discovery.push({ url, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  const queue = [...seeds].filter(Boolean).sort();
  const scheduled = new Set(queue);
  const results = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= queue.length || index >= options.maxPages) return;
      const url = queue[index];
      if (!url) continue;
      try {
        const page = await capturePage(url, output, options.timeout);
        results.push(page);
        for (const link of page.links) {
          const normalized = canonicalUrl(link, origin);
          if (!normalized || scheduled.has(normalized) || scheduled.size >= options.maxPages) continue;
          scheduled.add(normalized);
          queue.push(normalized);
        }
      } catch (error) {
        results.push({ url, status: 'failed', error: error instanceof Error ? error.message : String(error), links: [] });
      }
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  results.sort((left, right) => left.url.localeCompare(right.url));
  const manifest = {
    origin,
    userAgent: USER_AGENT,
    configuration: { maxPages: options.maxPages, concurrency: options.concurrency, timeout: options.timeout },
    discovery,
    pages: results.map(({ links, ...page }) => ({ ...page, discoveredLinks: links.length })),
    totals: {
      scheduled: scheduled.size,
      captured: results.filter((item) => item.status !== 'failed').length,
      failed: results.filter((item) => item.status === 'failed').length,
      bytes: results.reduce((total, item) => total + (typeof item.size === 'number' ? item.size : 0), 0),
    },
  };
  await writeJson(path.join(output, 'manifest.json'), manifest);
  process.stdout.write(`${JSON.stringify(manifest.totals)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return process.stdout.write(help());
  await crawl(options);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
