import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface SnapshotManifest {
  productionOrigin: string;
  pages: Array<{ route: string; status: number }>;
  resources: Array<{
    url: string;
    path: string;
    contentType: string;
    external: boolean;
  }>;
}

const sourceOrigin = process.env.WORDPRESS_REFERENCE_URL;
if (!sourceOrigin) throw new Error('Falta WORDPRESS_REFERENCE_URL para la comparación visual.');
const manifest: SnapshotManifest = JSON.parse(
  await readFile(path.resolve('reference-snapshot/manifest.json'), 'utf8'),
);
const routes = manifest.pages.filter((page) => page.status === 200).map((page) => page.route);
if (routes.length === 0) throw new Error('El manifiesto no contiene páginas 200 para comparar.');
const historicalHost = 'chocolate-chimpanzee-908881.hostingersite.com';
const productionHost = new URL(manifest.productionOrigin).hostname;
const externalImages = manifest.resources.filter(
  (resource) => resource.external && resource.contentType.toLowerCase().startsWith('image/'),
);
const externalImagesByUrl = new Map(externalImages.map((resource) => [resource.url, resource]));
const externalImagesByPath = new Map<string, (typeof externalImages)[number] | null>();
for (const resource of externalImages) {
  const url = new URL(resource.url);
  const key = `${url.origin}${url.pathname}`;
  externalImagesByPath.set(key, externalImagesByPath.has(key) ? null : resource);
}

function slugForRoute(route: string) {
  return route === '/'
    ? 'home'
    : route.replaceAll(/[^a-zA-Z0-9]+/gu, '-').replaceAll(/^-+|-+$/gu, '');
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
      html, body {
        max-width: 100vw !important;
        overflow-anchor: none !important;
        overflow-x: clip !important;
        scroll-behavior: auto !important;
      }
      .hostinger-ai-menu {
        position: absolute !important;
        top: 0 !important;
      }
    `,
  });
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

async function normalizeRequiredProductionChanges(page: import('@playwright/test').Page) {
  await page.evaluate(
    ({ previousHost, publicHost }) => {
      const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const parent = current.parentElement?.tagName;
        if (!['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent ?? '')) {
          current.nodeValue = (current.nodeValue ?? '').replaceAll(previousHost, publicHost);
        }
        current = walker.nextNode();
      }
      document.title = document.title.replaceAll(previousHost, publicHost);
    },
    { previousHost: historicalHost, publicHost: productionHost },
  );
}

async function normalizeSourceDocumentBeforeLayout(
  page: import('@playwright/test').Page,
  url: string,
) {
  await page.route(
    url,
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll(historicalHost, productionHost);
      await route.fulfill({ response, body });
    },
    { times: 1 },
  );
}

async function pinVersionedExternalImages(page: import('@playwright/test').Page) {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const resource =
      externalImagesByUrl.get(requestUrl.href) ??
      externalImagesByPath.get(`${requestUrl.origin}${requestUrl.pathname}`);
    if (!resource) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: resource.contentType,
      body: await readFile(path.resolve('reference-snapshot/site', resource.path)),
    });
  });
}

async function captureExactViewportWidth(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('La prueba de fidelidad exige un viewport explícito.');
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    timeout: 120_000,
  });
}

for (const route of routes) {
  test(`${route} coincide con WordPress restaurado`, async ({ page, context }, testInfo) => {
    const sourcePage = await context.newPage();
    const deterministicScript = ({ epoch }: { epoch: number }) => {
      Date.now = () => epoch;
      Math.random = () => 0.5;
    };
    const deterministicArguments = { epoch: Date.UTC(2026, 6, 21, 12, 0, 0) };
    await Promise.all([
      sourcePage.addInitScript(deterministicScript, deterministicArguments),
      page.addInitScript(deterministicScript, deterministicArguments),
    ]);
    await pinVersionedExternalImages(sourcePage);
    await sourcePage.bringToFront();
    const sourceUrl = new URL(route, sourceOrigin).href;
    await normalizeSourceDocumentBeforeLayout(sourcePage, sourceUrl);
    await sourcePage.goto(sourceUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await normalizeRequiredProductionChanges(sourcePage);
    await settle(sourcePage);

    const snapshotName = `${slugForRoute(route)}.png`;
    const expectedPath = testInfo.snapshotPath(snapshotName);
    await mkdir(path.dirname(expectedPath), { recursive: true });
    await writeFile(expectedPath, await captureExactViewportWidth(sourcePage));
    await sourcePage.close();

    await page.bringToFront();
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await settle(page);
    const actual = await captureExactViewportWidth(page);
    expect(actual).toMatchSnapshot(snapshotName, {
      maxDiffPixels: 0,
      threshold: 0,
    });
  });
}
