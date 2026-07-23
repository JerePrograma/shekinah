#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = new URL(process.env.STORE_ORIGIN || 'https://herbalarioonline.com').origin;
const output = path.resolve(process.env.RECOVERY_OUTPUT || '.migration-work/store-surface');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]))
    : value;

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(stable(value), null, 2)}\n`, 'utf8');
}

function extensionFor(contentType, url) {
  if (contentType.includes('image/jpeg')) return '.jpg';
  if (contentType.includes('image/png')) return '.png';
  if (contentType.includes('image/webp')) return '.webp';
  if (contentType.includes('image/avif')) return '.avif';
  if (contentType.includes('image/svg')) return '.svg';
  if (contentType.includes('json')) return '.json';
  if (contentType.includes('javascript')) return '.js';
  if (contentType.includes('css')) return '.css';
  if (contentType.includes('html')) return '.html';
  const sourceExtension = path.posix.extname(new URL(url).pathname).toLowerCase();
  return sourceExtension && sourceExtension.length <= 8 ? sourceExtension : '.data';
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'es-AR',
  serviceWorkers: 'block',
  userAgent: 'ShekinahStoreSurfaceRecovery/2.0 (+https://github.com/JerePrograma/shekinah)',
  viewport: { width: 1440, height: 1600 },
});
const network = [];
const seenResponses = new Set();

function observe(page) {
  page.on('response', async (response) => {
    const url = response.url();
    if (seenResponses.has(url)) return;
    seenResponses.add(url);
    const contentType = response.headers()['content-type']?.toLowerCase() || '';
    const resourceType = response.request().resourceType();
    const visual = contentType.startsWith('image/');
    const textual = /(?:json|javascript|css|html|xml|text)/u.test(contentType);
    const interestingUrl = /(?:store|product|catalog|cart|ecommerce|zyro|hostinger|api)/iu.test(url);
    if (!visual && !(textual && interestingUrl)) return;
    const item = { url, status: response.status(), contentType, resourceType };
    try {
      const body = await response.body();
      item.size = body.length;
      item.sha256 = hash(body);
      const maximum = visual ? 20 * 1024 * 1024 : 30 * 1024 * 1024;
      if (body.length && body.length <= maximum) {
        const file = path.join(output, visual ? 'images' : 'network', `${item.sha256}${extensionFor(contentType, url)}`);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
        item.file = path.relative(output, file).replaceAll(path.sep, '/');
      }
    } catch (error) {
      item.error = error instanceof Error ? error.message : String(error);
    }
    network.push(item);
  });
}

async function acceptCookies(page) {
  for (const name of [/aceptar/iu, /accept/iu, /entendido/iu]) {
    const button = page.getByRole('button', { name });
    if (await button.first().isVisible().catch(() => false)) await button.first().click().catch(() => {});
  }
}

async function exhaustListing(page) {
  let previousSignature = '';
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const signature = await page.evaluate(() => `${document.body.scrollHeight}:${document.querySelectorAll('a[href]').length}:${document.querySelectorAll('img').length}:${document.body.innerText.length}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const buttons = page.getByRole('button', { name: /(?:cargar|mostrar|ver)\s+m[aá]s|siguiente|next/iu });
    let clicked = false;
    for (let index = 0; index < Math.min(await buttons.count(), 10); index += 1) {
      if (await buttons.nth(index).isVisible().catch(() => false)) {
        clicked = await buttons.nth(index).click({ timeout: 2500 }).then(() => true).catch(() => false) || clicked;
      }
    }
    await page.waitForTimeout(clicked ? 1000 : 400);
    if (!clicked && signature === previousSignature) break;
    previousSignature = signature;
  }
}

async function snapshot(page, label, responseStatus) {
  const data = await page.evaluate(() => {
    const clone = (value) => {
      try {
        const text = JSON.stringify(value);
        if (!text || text.length > 8_000_000) return null;
        return JSON.parse(text);
      } catch {
        return null;
      }
    };
    const globals = {};
    for (const key of Object.keys(window).filter((name) => /(store|product|catalog|cart|zyro|hostinger|ecommerce)/iu.test(name)).sort()) {
      const value = clone(window[key]);
      if (value !== null) globals[key] = value;
    }
    const storage = {};
    for (const key of Object.keys(localStorage).sort()) {
      const value = localStorage.getItem(key);
      if (value && value.length <= 8_000_000) storage[key] = value;
    }
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText,
      anchors: [...document.querySelectorAll('a[href]')].map((anchor) => ({ href: anchor.href, text: anchor.textContent?.trim() || '' })),
      images: [...document.images].map((image) => ({ src: image.src, currentSrc: image.currentSrc, srcset: image.srcset, alt: image.alt, width: image.naturalWidth, height: image.naturalHeight })),
      backgrounds: [...document.querySelectorAll('*')].map((element) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '', backgroundImage: getComputedStyle(element).backgroundImage })).filter((item) => item.backgroundImage && item.backgroundImage !== 'none'),
      islands: [...document.querySelectorAll('astro-island')].map((island, index) => ({ index, componentUrl: island.getAttribute('component-url'), rendererUrl: island.getAttribute('renderer-url'), props: island.getAttribute('props'), attrs: Object.fromEntries([...island.attributes].map((attribute) => [attribute.name, attribute.value])) })),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent),
      scripts: [...document.scripts].map((script) => ({ src: script.src, type: script.type, text: script.src ? null : script.textContent?.slice(0, 3_000_000) || null })),
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
      globals,
      storage,
    };
  });
  const html = await page.content();
  const fileBase = `${label}-${hash(data.url).slice(0, 12)}`;
  await writeFile(path.join(output, `${fileBase}.html`), html, 'utf8');
  await page.screenshot({ path: path.join(output, `${fileBase}.png`), fullPage: true }).catch(() => {});
  return { label, status: responseStatus, ...data, htmlFile: `${fileBase}.html`, screenshotFile: `${fileBase}.png` };
}

const surfaces = [];
const rootPage = await context.newPage();
observe(rootPage);
const rootResponse = await rootPage.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await rootPage.waitForTimeout(3500);
await acceptCookies(rootPage);
await exhaustListing(rootPage);
surfaces.push(await snapshot(rootPage, 'root', rootResponse?.status() || 0));

const storeLink = rootPage.getByRole('link', { name: /^tienda$/iu }).first();
if (await storeLink.isVisible().catch(() => false)) {
  const originalUrl = rootPage.url();
  await storeLink.click({ timeout: 5000 }).catch(() => {});
  if (rootPage.url() !== originalUrl) await rootPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await rootPage.waitForTimeout(2500);
  await exhaustListing(rootPage);
  surfaces.push(await snapshot(rootPage, 'store-navigation', 200));
}

const excluded = /\/(?:inicio|tienda|recetas|blog|nosotros|terms-and-conditions|category|wp-admin|wp-login)(?:\/|$)/iu;
const discovered = new Set([
  `${origin}/guayaba`,
  `${origin}/melena-de-leon-futuro-fungi-50ml`,
]);
for (const surface of surfaces) {
  for (const anchor of surface.anchors) {
    try {
      const url = new URL(anchor.href);
      if (url.origin !== origin || excluded.test(url.pathname) || url.pathname === '/') continue;
      discovered.add(url.href);
    } catch {
      // Ignore malformed public links.
    }
  }
}
const productLinks = [...discovered].sort();
const productPages = [];
for (const url of productLinks.slice(0, 1000)) {
  const productPage = await context.newPage();
  observe(productPage);
  const item = { url, status: 'failed' };
  try {
    const response = await productPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await productPage.waitForTimeout(1800);
    await acceptCookies(productPage);
    Object.assign(item, await snapshot(productPage, `product-${hash(url).slice(0, 12)}`, response?.status() || 0));
  } catch (error) {
    item.error = error instanceof Error ? error.message : String(error);
  }
  await productPage.close();
  productPages.push(item);
}
await rootPage.close();
await browser.close();

await writeJson(path.join(output, 'surfaces.json'), surfaces);
await writeJson(path.join(output, 'product-links.json'), productLinks);
await writeJson(path.join(output, 'product-pages.json'), productPages);
await writeJson(path.join(output, 'network.json'), network.sort((left, right) => left.url.localeCompare(right.url)));
await writeJson(path.join(output, 'summary.json'), {
  origin,
  surfaces: surfaces.length,
  productLinks: productLinks.length,
  capturedProducts: productPages.filter((item) => typeof item.status === 'number' && item.status < 400).length,
  networkResponses: network.length,
  downloadedImages: network.filter((item) => item.contentType?.startsWith('image/') && item.file).length,
  islands: surfaces.reduce((total, item) => total + item.islands.length, 0) + productPages.reduce((total, item) => total + (item.islands?.length || 0), 0),
});
console.log(JSON.stringify({ surfaces: surfaces.length, productLinks: productLinks.length, productPages: productPages.length, networkResponses: network.length }));
