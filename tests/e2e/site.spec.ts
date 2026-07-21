import { expect, test, type APIRequestContext } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface SnapshotManifest {
  pages: Array<{ route: string; status: number }>;
  redirects: Array<{ route: string; status: number; target: string }>;
}

const fallbackRoutes = [
  '/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/terms-and-conditions/',
];

const manifestPath = path.resolve('reference-snapshot/manifest.json');
const manifest: SnapshotManifest | null = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
const criticalRoutes = manifest
  ? manifest.pages.filter((page) => page.status === 200).map((page) => page.route)
  : fallbackRoutes;

for (const route of criticalRoutes) {
  test(`${route} responde con el contenido publicado`, async ({ page }) => {
    const failedResources: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && response.request().resourceType() !== 'document') {
        failedResources.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/\S+/u);

    const html = (await page.content()).toLowerCase();
    expect(html).not.toContain('http://localhost');
    expect(html).not.toContain('https://localhost');
    expect(html).not.toContain('chocolate-chimpanzee-908881.hostingersite.com');
    expect(failedResources).toEqual([]);
  });
}

test('las imágenes publicadas cargan', async ({ page }) => {
  for (const route of criticalRoutes) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const images = page.locator('img');
    for (let index = 0; index < (await images.count()); index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
  }
});

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

if (manifest) {
  for (const redirect of manifest.redirects) {
    test(`${redirect.route} conserva la redirección recuperada`, async ({ request }) => {
      await expectRedirect(request, redirect.route, redirect.target);
    });
  }
}

test('la respuesta 404 está disponible', async ({ request }) => {
  expect((await request.get('/ruta-inexistente-para-prueba/')).status()).toBe(404);
});
