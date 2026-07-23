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
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
    : value;
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(stable(value), null, 2)}\n`, 'utf8');
}
function safeName(url) { return `${hash(url)}${new URL(url).pathname.endsWith('.css') ? '.css' : new URL(url).pathname.endsWith('.js') ? '.js' : '.data'}`; }

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'es-AR',
  serviceWorkers: 'block',
  userAgent: 'ShekinahStoreSurfaceRecovery/1.0 (+https://github.com/JerePrograma/shekinah)',
  viewport: { width: 1440, height: 1600 },
});
const page = await context.newPage();
const network = [];
const seen = new Set();
page.on('response', async (response) => {
  const url = response.url();
  if (seen.has(url)) return;
  seen.add(url);
  const contentType = response.headers()['content-type']?.toLowerCase() || '';
  if (!/(?:json|javascript|css|html|xml|text)/u.test(contentType)) return;
  const host = new URL(url).hostname;
  if (!/(?:herbalarioonline\.com|zyrosite\.com|hostinger|storefront|ecommerce|cart|product|catalog)/iu.test(host + url)) return;
  const item = { url, status: response.status(), contentType, resourceType: response.request().resourceType() };
  try {
    const body = await response.body();
    item.size = body.length;
    item.sha256 = hash(body);
    if (body.length <= 25 * 1024 * 1024) {
      const file = path.join(output, 'network', safeName(url));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      item.file = path.relative(output, file).replaceAll(path.sep, '/');
    }
  } catch (error) { item.error = error instanceof Error ? error.message : String(error); }
  network.push(item);
});

const response = await page.goto(`${origin}/tienda/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
for (const name of [/aceptar/iu, /accept/iu, /entendido/iu]) {
  const button = page.getByRole('button', { name });
  if (await button.first().isVisible().catch(() => false)) await button.first().click().catch(() => {});
}
let previousSignature = '';
for (let iteration = 0; iteration < 120; iteration += 1) {
  const signature = await page.evaluate(() => `${document.body.scrollHeight}:${document.querySelectorAll('a[href]').length}:${document.querySelectorAll('img').length}:${document.body.innerText.length}`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const buttons = page.getByRole('button', { name: /(?:cargar|mostrar|ver)\s+m[aá]s|siguiente|next/iu });
  let clicked = false;
  for (let index = 0; index < Math.min(await buttons.count(), 10); index += 1) {
    if (await buttons.nth(index).isVisible().catch(() => false)) {
      clicked = await buttons.nth(index).click({ timeout: 2500 }).then(() => true).catch(() => false) || clicked;
    }
  }
  await page.waitForTimeout(clicked ? 1200 : 500);
  if (!clicked && signature === previousSignature) break;
  previousSignature = signature;
}

const surface = await page.evaluate(() => {
  const clone = (value) => {
    try {
      const text = JSON.stringify(value);
      if (!text || text.length > 5_000_000) return null;
      return JSON.parse(text);
    } catch { return null; }
  };
  const globals = {};
  for (const key of Object.keys(window).filter((name) => /(store|product|catalog|cart|zyro|hostinger|ecommerce)/iu.test(name)).sort()) {
    const value = clone(window[key]);
    if (value !== null) globals[key] = value;
  }
  const storage = {};
  for (const key of Object.keys(localStorage).sort()) {
    const value = localStorage.getItem(key);
    if (value && value.length <= 5_000_000) storage[key] = value;
  }
  return {
    url: location.href,
    title: document.title,
    text: document.body.innerText,
    htmlLength: document.documentElement.outerHTML.length,
    anchors: [...document.querySelectorAll('a[href]')].map((anchor) => ({ href: anchor.href, text: anchor.textContent?.trim() || '' })),
    images: [...document.images].map((image) => ({ src: image.src, currentSrc: image.currentSrc, srcset: image.srcset, alt: image.alt, width: image.naturalWidth, height: image.naturalHeight })),
    backgrounds: [...document.querySelectorAll('*')].map((element) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '', backgroundImage: getComputedStyle(element).backgroundImage })).filter((item) => item.backgroundImage && item.backgroundImage !== 'none'),
    islands: [...document.querySelectorAll('astro-island')].map((island, index) => ({
      index,
      componentUrl: island.getAttribute('component-url'),
      rendererUrl: island.getAttribute('renderer-url'),
      props: island.getAttribute('props'),
      attrs: Object.fromEntries([...island.attributes].map((attribute) => [attribute.name, attribute.value])),
    })),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent),
    scripts: [...document.scripts].map((script) => ({ src: script.src, type: script.type, text: script.src ? null : script.textContent?.slice(0, 2_000_000) || null })),
    resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    globals,
    storage,
  };
});
const html = await page.content();
await writeFile(path.join(output, 'tienda-hydrated.html'), html, 'utf8');
await page.screenshot({ path: path.join(output, 'tienda-full.png'), fullPage: true });
await writeJson(path.join(output, 'surface.json'), surface);
await writeJson(path.join(output, 'network.json'), network.sort((a, b) => a.url.localeCompare(b.url)));

const productLinks = [...new Set(surface.anchors
  .filter((item) => new URL(item.href).origin === origin)
  .filter((item) => !/\/(?:inicio|tienda|recetas|blog|nosotros|terms-and-conditions|category)(?:\/|$)/iu.test(new URL(item.href).pathname))
  .map((item) => item.href))].sort();
await writeJson(path.join(output, 'product-links.json'), productLinks);
const productPages = [];
for (const url of productLinks.slice(0, 1000)) {
  const productPage = await context.newPage();
  const item = { url, status: 'failed' };
  try {
    const productResponse = await productPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await productPage.waitForTimeout(1500);
    const data = await productPage.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || null,
      text: document.body.innerText,
      images: [...document.images].map((image) => ({ src: image.currentSrc || image.src, alt: image.alt, width: image.naturalWidth, height: image.naturalHeight })),
      islands: [...document.querySelectorAll('astro-island')].map((island, index) => ({ index, componentUrl: island.getAttribute('component-url'), props: island.getAttribute('props') })),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent),
    }));
    Object.assign(item, { status: productResponse?.status() || 0, finalUrl: productPage.url(), data });
    const productHtml = await productPage.content();
    const file = path.join(output, 'products', `${hash(url)}.html`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, productHtml, 'utf8');
    item.file = path.relative(output, file).replaceAll(path.sep, '/');
  } catch (error) { item.error = error instanceof Error ? error.message : String(error); }
  await productPage.close();
  productPages.push(item);
}
await writeJson(path.join(output, 'product-pages.json'), productPages);
await browser.close();
console.log(JSON.stringify({ status: response?.status() || 0, productLinks: productLinks.length, networkResponses: network.length, islands: surface.islands.length, images: surface.images.length }));
