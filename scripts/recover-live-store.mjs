#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = new URL(process.env.STORE_ORIGIN || 'https://herbalarioonline.com').origin;
const output = path.resolve(process.env.RECOVERY_OUTPUT || '.migration-work/live-store');
const limit = Math.min(2000, Math.max(1, Number(process.env.RECOVERY_MAX_PAGES || 1000)));
const userAgent = 'ShekinahStoreRecovery/1.0 (+https://github.com/JerePrograma/shekinah)';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const safeHosts = /(?:herbalarioonline\.com|zyrosite\.com|hostinger|storefront|ecommerce)/iu;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
async function json(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(stable(value), null, 2)}\n`, 'utf8');
}
function canonical(value) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    if (url.pathname !== '/' && !url.pathname.endsWith('/') && !path.posix.extname(url.pathname)) url.pathname += '/';
    return url.href;
  } catch { return null; }
}
async function fetchPublic(url, file) {
  const result = { url, status: 'failed' };
  try {
    const response = await fetch(url, { headers: { 'user-agent': userAgent }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
    const body = Buffer.from(await response.arrayBuffer());
    Object.assign(result, { status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '', size: body.length, sha256: digest(body) });
    if (response.ok && body.length <= 15 * 1024 * 1024) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      result.file = path.relative(output, file).replaceAll(path.sep, '/');
    }
  } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
  return result;
}
async function markerReport() {
  const report = { productIds: new Set(), storeIds: new Set(), apiCandidates: new Set(), urls: new Set() };
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(?:html|json|js|css|xml|txt)$/iu.test(entry.name)) {
        const text = await readFile(file, 'utf8').catch(() => '');
        for (const match of text.matchAll(/\bprod_[\w-]+\b/gu)) report.productIds.add(match[0]);
        for (const match of text.matchAll(/\bstore_[\w-]+\b/gu)) report.storeIds.add(match[0]);
        for (const match of text.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+/gu)) report.urls.add(match[0].replaceAll('\\/', '/'));
        for (const match of text.matchAll(/(?:https?:\/\/[^"'\s]+|\/[^"'\s]*api[^"'\s]*)/giu)) report.apiCandidates.add(match[0].replaceAll('\\/', '/'));
      }
    }
  }
  await walk(output);
  return Object.fromEntries(Object.entries(report).map(([key, values]) => [key, [...values].sort()]));
}

await mkdir(output, { recursive: true });
const discoveryUrls = [
  `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`,
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(new URL(origin).hostname)}/*&output=json&fl=timestamp,original,statuscode,mimetype,digest&filter=statuscode:200&collapse=digest&limit=10000`,
  `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`page.domain:${new URL(origin).hostname} OR task.domain:${new URL(origin).hostname}`)}&size=100`,
];
const discovery = [];
for (const [index, url] of discoveryUrls.entries()) discovery.push(await fetchPublic(url, path.join(output, 'discovery', `${index}.data`)));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'es-AR', serviceWorkers: 'block', userAgent, viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
const responseUrls = new Set();
const network = [];
page.on('response', async (response) => {
  const url = response.url();
  const type = response.headers()['content-type']?.toLowerCase() || '';
  if (responseUrls.has(url) || !safeHosts.test(new URL(url).hostname) || !/(?:json|javascript|css|html|xml|text)/u.test(type)) return;
  responseUrls.add(url);
  const item = { url, status: response.status(), contentType: type, resourceType: response.request().resourceType() };
  try {
    const body = await response.body();
    item.size = body.length; item.sha256 = digest(body);
    if (body.length <= 15 * 1024 * 1024) {
      const ext = type.includes('json') ? '.json' : type.includes('javascript') ? '.js' : type.includes('css') ? '.css' : type.includes('html') ? '.html' : '.txt';
      const file = path.join(output, 'network', `${item.sha256}${ext}`);
      await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body);
      item.file = path.relative(output, file).replaceAll(path.sep, '/');
    }
  } catch (error) { item.error = error instanceof Error ? error.message : String(error); }
  network.push(item);
});

const queue = ['/', '/tienda', '/guayaba', '/melena-de-leon-futuro-fungi-50ml'].map(canonical).filter(Boolean);
const scheduled = new Set(queue);
for (const item of discovery) {
  if (!item.file || !String(item.contentType).includes('xml')) continue;
  const xml = await readFile(path.join(output, item.file), 'utf8').catch(() => '');
  for (const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)) { const url = canonical(match[1]); if (url && !scheduled.has(url)) { scheduled.add(url); queue.push(url); } }
}
const pages = [];
for (let cursor = 0; cursor < queue.length && cursor < limit; cursor += 1) {
  const url = queue[cursor]; const record = { url, status: 'failed' };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 4; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(600);
      const buttons = page.getByRole('button', { name: /(?:cargar|mostrar|ver)\s+m[aá]s|siguiente|next/iu });
      for (let j = 0; j < Math.min(await buttons.count(), 5); j += 1) if (await buttons.nth(j).isVisible().catch(() => false)) await buttons.nth(j).click({ timeout: 3000 }).catch(() => {});
    }
    const snapshot = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      anchors: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: a.textContent?.trim() || null })),
      images: [...document.images].map((image) => ({ src: image.currentSrc || image.src, srcset: image.srcset || null, alt: image.alt || null, width: image.naturalWidth, height: image.naturalHeight })),
      backgrounds: [...document.querySelectorAll('*')].map((element) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '', backgroundImage: getComputedStyle(element).backgroundImage })).filter((item) => item.backgroundImage && item.backgroundImage !== 'none'),
      islands: [...document.querySelectorAll('astro-island')].map((island, index) => ({ index, componentUrl: island.getAttribute('component-url'), rendererUrl: island.getAttribute('renderer-url'), propsLength: island.getAttribute('props')?.length || 0 })),
      scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
      resourceUrls: performance.getEntriesByType('resource').map((entry) => entry.name),
      localStorageKeys: Object.keys(localStorage).sort(),
    }));
    const html = await page.content(); const hash = digest(Buffer.from(html));
    const htmlFile = path.join(output, 'html', `${hash}.html`); await mkdir(path.dirname(htmlFile), { recursive: true }); await writeFile(htmlFile, html);
    const screenshot = path.join(output, 'screenshots', `${hash}.png`); await mkdir(path.dirname(screenshot), { recursive: true }); await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    Object.assign(record, { status: response?.status() || 0, finalUrl: page.url(), sha256: hash, size: Buffer.byteLength(html), htmlFile: path.relative(output, htmlFile).replaceAll(path.sep, '/'), screenshotFile: path.relative(output, screenshot).replaceAll(path.sep, '/'), snapshot });
    for (const anchor of snapshot.anchors) {
      const candidate = canonical(anchor.href);
      if (!candidate || scheduled.has(candidate) || scheduled.size >= limit || /\/(?:wp-admin|wp-login|checkout|admin)(?:\/|$)/iu.test(new URL(candidate).pathname)) continue;
      scheduled.add(candidate); queue.push(candidate);
    }
  } catch (error) { record.error = error instanceof Error ? error.message : String(error); }
  pages.push(record);
}
await browser.close();
pages.sort((a, b) => a.url.localeCompare(b.url)); network.sort((a, b) => a.url.localeCompare(b.url));
await json(path.join(output, 'discovery.json'), discovery);
await json(path.join(output, 'network.json'), network);
await json(path.join(output, 'pages.json'), pages);
await json(path.join(output, 'markers.json'), await markerReport());
await json(path.join(output, 'summary.json'), {
  origin, scheduled: scheduled.size, pages: pages.length, captured: pages.filter((p) => p.status !== 'failed').length, failed: pages.filter((p) => p.status === 'failed').length, networkResponses: network.length,
  imageReferences: [...new Set(pages.flatMap((p) => p.snapshot?.images?.map((image) => image.src) || []))].sort(),
  backgroundReferences: [...new Set(pages.flatMap((p) => p.snapshot?.backgrounds?.map((item) => item.backgroundImage) || []))].sort(),
});
console.log(JSON.stringify({ output: path.relative(process.cwd(), output), pages: pages.length, network: network.length }));
