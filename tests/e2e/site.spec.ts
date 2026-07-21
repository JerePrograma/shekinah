import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface SnapshotManifest {
  productionOrigin: string;
  pages: Array<{ route: string; status: number; title?: string }>;
  redirects: Array<{ route: string; status: number; target: string }>;
  dynamicFeatures: Array<{
    route: string;
    processingMigrated: boolean;
    classification: string;
  }>;
}

const manifestPath = path.resolve('reference-snapshot/manifest.json');
if (!existsSync(manifestPath)) {
  throw new Error('Falta reference-snapshot/manifest.json; los E2E requieren el snapshot real.');
}
const manifest: SnapshotManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const criticalRoutes = [
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
const pageByRoute = new Map(manifest.pages.map((item) => [item.route, item]));
const redirectByRoute = new Map(manifest.redirects.map((item) => [item.route, item]));
const escapedProductionOrigin = manifest.productionOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
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
  });
}

async function expectRedirect(request: APIRequestContext, route: string, target: string) {
  const response = await request.get(route, { maxRedirects: 0 });
  if ([301, 302, 303, 307, 308].includes(response.status())) {
    expect(response.headers().location).toBe(target);
    return;
  }
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('http-equiv="refresh"');
  expect(html).toContain(`url=${target}`);
}

for (const route of criticalRoutes) {
  test(`${route} está representada por una página o redirección recuperada`, async ({
    page,
    request,
  }) => {
    const recoveredPage = pageByRoute.get(route);
    const recoveredRedirect = redirectByRoute.get(route);
    expect(Boolean(recoveredPage || recoveredRedirect)).toBe(true);

    if (recoveredRedirect) {
      await expectRedirect(request, route, recoveredRedirect.target);
      return;
    }

    const failedResources: string[] = [];
    const externalRequests: string[] = [];
    const consoleErrors: string[] = [];
    page.on('request', (request_) => {
      const url = new URL(request_.url());
      if (['blob:', 'data:', 'about:'].includes(url.protocol)) return;
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request_.url());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.request().resourceType() !== 'document') {
        failedResources.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await settle(page);
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(recoveredPage?.title ?? /\S+/u);

    const html = (await page.content()).toLowerCase();
    expect(html).not.toContain('http://localhost');
    expect(html).not.toContain('https://localhost');
    expect(html).not.toContain('127.0.0.1');
    expect(html).not.toContain('chocolate-chimpanzee-908881.hostingersite.com');
    expect(failedResources).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);

    const imageStates = await page.locator('img').evaluateAll((images) =>
      images.map((image) => {
        const element = image as HTMLImageElement;
        return {
          naturalWidth: element.naturalWidth,
          source: element.currentSrc || element.src,
          sourceSet: element.srcset,
        };
      }),
    );
    for (const image of imageStates) {
      expect(image.naturalWidth).toBeGreaterThan(0);
      expect(image.source).not.toContain('localhost');
      expect(image.source).not.toContain('hostingersite.com');
      expect(image.sourceSet).not.toContain('localhost');
      expect(image.sourceSet).not.toContain('hostingersite.com');
    }

    const stylesheets = page.locator('link[rel="stylesheet"]');
    for (let index = 0; index < (await stylesheets.count()); index += 1) {
      const href = await stylesheets.nth(index).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toMatch(/^https?:\/\/(?!shekinah-7dl\.pages\.dev)/iu);
    }
    expect(await page.evaluate(() => document.fonts?.status ?? 'loaded')).toBe('loaded');

    const canonical = page.locator('link[rel="canonical"]');
    if ((await canonical.count()) > 0) {
      await expect(canonical.first()).toHaveAttribute(
        'href',
        new RegExp(`^${escapedProductionOrigin}`),
      );
    }
    const openGraphUrl = page.locator('meta[property="og:url"]');
    if ((await openGraphUrl.count()) > 0) {
      await expect(openGraphUrl.first()).toHaveAttribute(
        'content',
        new RegExp(`^${escapedProductionOrigin}`),
      );
    }
  });
}

test('los enlaces internos recuperados mantienen navegación local', async ({ page }) => {
  const route = pageByRoute.has('/inicio/') ? '/inicio/' : '/';
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const visibleLocalLinks = page.locator('a[href^="/"]:visible');
  expect(await visibleLocalLinks.count()).toBeGreaterThan(0);
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((anchors) =>
      anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
  const localRoutes = hrefs
    .filter((href) => href.startsWith('/'))
    .map((href) => new URL(href, manifest.productionOrigin).pathname);
  expect(localRoutes.some((href) => pageByRoute.has(href.endsWith('/') ? href : `${href}/`))).toBe(
    true,
  );
});

for (const redirect of manifest.redirects) {
  test(`${redirect.route} conserva la redirección recuperada`, async ({ request }) => {
    await expectRedirect(request, redirect.route, redirect.target);
  });
}

test('robots y sitemap usan el dominio final', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).not.toContain('localhost');
  expect(robotsText).not.toContain('hostingersite.com');

  let sitemapResponse = await request.get('/sitemap.xml');
  if (sitemapResponse.status() === 404) sitemapResponse = await request.get('/sitemap-index.xml');
  if (sitemapResponse.status() === 404) sitemapResponse = await request.get('/wp-sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemapText = await sitemapResponse.text();
  expect(sitemapText).toContain(manifest.productionOrigin);
  expect(sitemapText).not.toContain('localhost');
  expect(sitemapText).not.toContain('hostingersite.com');
});

test('los formularios visibles están clasificados y neutralizados', async ({ page }) => {
  for (const feature of manifest.dynamicFeatures) {
    expect(feature.processingMigrated).toBe(false);
    expect(feature.classification).toBe('static-interface-only');
  }
  for (const route of [...new Set(manifest.dynamicFeatures.map((item) => item.route))]) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const forms = page.locator('form');
    for (let index = 0; index < (await forms.count()); index += 1) {
      const form = forms.nth(index);
      await expect(form).toHaveAttribute('data-migration-status', 'processing-not-migrated');
      await expect(form).toHaveAttribute('action', '#form-processing-not-migrated');
    }
  }
});

test('la respuesta 404 está disponible', async ({ request }) => {
  expect((await request.get('/ruta-inexistente-para-prueba/')).status()).toBe(404);
});
