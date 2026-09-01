import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import catalogIndexSource from '../../catalog/internal/catalog-index.json' with { type: 'json' };
import catalogDetailSource from '../../src/catalog-data/catalog-details.json' with { type: 'json' };

const publicCatalogProducts: readonly Record<string, unknown>[] = catalogIndexSource.map(
  (product) => {
    const publicProduct: Record<string, unknown> = { ...product };
    delete publicProduct.capturedAt;
    return publicProduct;
  },
);

function observePage(page: Page) {
  const runtimeErrors: string[] = [];
  const requestedUrls: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('request', (request) => requestedUrls.push(request.url()));
  return { runtimeErrors, requestedUrls };
}

function expectCleanRuntime(page: Page, observation: ReturnType<typeof observePage>) {
  const currentOrigin = new URL(page.url()).origin;
  expect(observation.runtimeErrors).toEqual([]);
  expect(
    observation.requestedUrls.filter(
      (requestedUrl) => new URL(requestedUrl).origin !== currentOrigin,
    ),
  ).toEqual([]);
  expect(observation.requestedUrls.some((url) => url.includes('/src/main.tsx'))).toBe(false);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
  await page.route('**/api/catalog**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ products: publicCatalogProducts }),
      });
      return;
    }
    const slug = pathname.startsWith('/api/catalog/')
      ? decodeURIComponent(pathname.slice('/api/catalog/'.length))
      : '';
    const summary = publicCatalogProducts.find((product) => product.slug === slug);
    const detail = catalogDetailSource[slug as keyof typeof catalogDetailSource];
    if (summary === undefined || detail === undefined) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'PRODUCT_NOT_FOUND' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ product: { ...summary, ...detail } }),
    });
  });
});

test('presenta navegación, carrito y los 510 productos compilados', async ({ page }) => {
  const observation = observePage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle('Shekinah | Hierbas y especias');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sabores naturales para todos los días.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enfoque' })).toHaveCount(0);
  const headerNavigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(headerNavigation.getByRole('link')).toHaveText(['Inicio', 'Catálogo', 'Carrito 0']);
  await expect(headerNavigation.getByRole('link', { name: 'Carrito, 0 productos' })).toBeVisible();
  const footerNavigation = page.getByRole('navigation', { name: 'Navegación del pie' });
  await expect(footerNavigation.getByRole('link')).toHaveText(['Inicio', 'Catálogo', 'Privacidad']);
  await page.getByRole('link', { name: 'Ver catálogo' }).click();
  await expect(page).toHaveURL(/\/catalogo$/u);
  await expect(page.getByRole('status')).toHaveText(
    '510 productos encontrados. Página 1 de 22.',
  );
  await expect(page.locator('[data-product]')).toHaveCount(24);
  await expect(page.getByText('Página 1 de 22', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 2 de 22', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    '510 productos encontrados. Página 2 de 22.',
  );
  await page.getByRole('searchbox').fill('  GUAYABA   ');
  await expect(page.getByRole('status')).toHaveText(
    '1 producto encontrado. Página 1 de 1.',
  );
  await page.getByRole('link', { name: 'Guayaba hojas x 50 gr' }).click();
  await expect(page).toHaveURL(/\/guayaba$/u);
  await expect(page.getByRole('button', { name: 'Producto no disponible' })).toBeDisabled();
  expectCleanRuntime(page, observation);
});

test('carga fichas sin narrativas retiradas', async ({ page }) => {
  const observation = observePage(page);
  for (const [path, title] of [
    ['/artemisa-annua-agroecologica-x-50-gr/', 'Artemisa Annua Agroecologica x 50 gr'],
    ['/guayaba/', 'Guayaba hojas x 50 gr'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Precio', { exact: true })).toBeVisible();
    await expect(page.getByText('Precio registrado')).toHaveCount(0);
    await expect(page.getByText('Disponibilidad registrada')).toHaveCount(0);
    await expect(page.getByText('23/07/2026', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/catálogo comercial recuperado/iu)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Descripción' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
  }
  expectCleanRuntime(page, observation);
});

test('preserva productos con y sin imagen o descripción', async ({ page }) => {
  const observation = observePage(page);
  await page.goto('/caldo-sin-sal-en-polvo/');
  await expect(page.getByRole('heading', { level: 1, name: 'Caldo sin sal en polvo' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();
  await page.goto('/pomelo-deshidratado-x-250-gr/');
  await expect(page.getByText('Cargando información detallada…')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Descripción' })).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
  expectCleanRuntime(page, observation);
});

test('resuelve categoría, privacidad, /enfoque y 404', async ({ page }) => {
  const observation = observePage(page);
  await page.goto('/tienda/categoria/hierbas-medicinales/');
  await expect(page).toHaveTitle('Hierbas Medicinales | Catálogo Shekinah');
  await expect(page.getByRole('status')).toHaveText(
    '205 productos encontrados. Página 1 de 9.',
  );
  await expect(page.locator('h1')).toHaveText('Hierbas Medicinales');
  await page.goto('/privacidad');
  await expect(page).toHaveTitle('Privacidad | Shekinah');
  await expect(page.locator('h1')).toHaveText('Privacidad.');
  await expect(page.getByText(/analítica first-party permanece inactiva hasta un consentimiento explícito/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carrito y pagos' })).toBeVisible();
  await page.goto('/enfoque');
  await expect(page).toHaveTitle('Página no encontrada | Shekinah');
  await expect(page.locator('h1')).toHaveText('Página no encontrada.');
  await expect(page.getByText('/enfoque')).toBeVisible();
  await page.goto('/ruta-inexistente');
  await expect(page).toHaveTitle('Página no encontrada | Shekinah');
  await expect(page.getByText('/ruta-inexistente')).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/$/u);
  expectCleanRuntime(page, observation);
});

test('resuelve un producto dinámico confirmado en acceso directo, refresh y Back/Forward', async ({ page }) => {
  const dynamicProduct = {
    id: 'producto-dinamico-e2e',
    slug: 'producto-dinamico-e2e',
    path: '/producto-dinamico-e2e/',
    name: 'Producto dinámico E2E',
    categorySlugs: ['agroecologicos'],
    categoryNames: ['Agroecologicos'],
    presentation: '100 g',
    price: { amount: 2_500, currency: 'ARS' },
    availability: 'available',
    description: 'Detalle dinámico.',
    images: [],
    variants: [],
  };
  await page.route('**/api/catalog**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/catalog/producto-dinamico-e2e') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ product: dynamicProduct }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [dynamicProduct] }),
    });
  });

  await page.goto('/producto-dinamico-e2e/');
  await expect(page.getByRole('heading', { level: 1, name: dynamicProduct.name })).toBeVisible();
  await expect(page).toHaveTitle(`${dynamicProduct.name} | Shekinah`);
  await page.goto('/catalogo');
  await page.getByRole('searchbox').fill('dinámico e2e');
  await expect(page.getByRole('status')).toHaveText(
    '1 producto encontrado. Página 1 de 1.',
  );
  await page.getByRole('link', { name: dynamicProduct.name }).click();
  await expect(page.getByRole('heading', { level: 1, name: dynamicProduct.name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: dynamicProduct.name })).toBeVisible();
  await page.getByRole('link', { name: 'Shekinah, ir al inicio' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: dynamicProduct.name })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/u);
});

test('mantiene teclado, foco y ancho usable en 320, 390, 768 y 1440 px', async ({ page }) => {
  const observation = observePage(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/catalogo');
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  await page.goto('/');
  const skipLink = page.getByRole('link', { name: 'Saltar al contenido' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.getByRole('link', { name: 'Catálogo', exact: true }).first().click();
  await expect(page.locator('#main-content')).toBeFocused();
  expectCleanRuntime(page, observation);
});
