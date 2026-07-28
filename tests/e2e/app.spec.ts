import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

function collectRuntimeErrors(page: Page) {
  const runtimeErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  return runtimeErrors;
}

function collectRequestedUrls(page: Page) {
  const requestedUrls: string[] = [];

  page.on('request', (request) => {
    requestedUrls.push(request.url());
  });

  return requestedUrls;
}

function expectOnlySameOriginRequests(page: Page, requestedUrls: readonly string[]) {
  const currentOrigin = new URL(page.url()).origin;
  const externalRequests = requestedUrls.filter(
    (requestedUrl) => new URL(requestedUrl).origin !== currentOrigin,
  );

  expect(externalRequests).toEqual([]);
}

test('navega por rutas internas y conserva el catálogo vacío autorizado', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const requestedUrls = collectRequestedUrls(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await expect(page).toHaveTitle('Shekinah | Hierbas y especias');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Shekinah presenta una experiencia clara y accesible de hierbas y especias.',
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Una experiencia simple para descubrir nuevos sabores.',
    }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);

  await page.getByRole('link', { name: 'Explorar catálogo' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page).toHaveTitle('Catálogo | Shekinah');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Consultá el catálogo autorizado de Shekinah y su estado actual.',
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Información comercial en preparación.',
    }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('Todavía no hay productos publicados');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('[data-product]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /contacto/i })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Una experiencia simple para descubrir nuevos sabores.',
    }),
  ).toBeVisible();

  await page.screenshot({ path: 'test-results/block5-home.png', fullPage: true });
  expect(runtimeErrors).toEqual([]);
  expectOnlySameOriginRequests(page, requestedUrls);
});

test('carga privacidad y 404 mediante navegación directa', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const requestedUrls = collectRequestedUrls(page);

  await page.goto('/privacidad');

  await expect(page).toHaveTitle('Privacidad | Shekinah');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Conocé el comportamiento de privacidad de la aplicación estática de Shekinah.',
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Privacidad clara, sin funciones ocultas.',
    }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/block5-privacy.png', fullPage: true });

  await page.goto('/ruta-inexistente');

  await expect(page).toHaveTitle('Página no encontrada | Shekinah');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'La dirección solicitada no corresponde a una ruta pública de Shekinah.',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
  ).toBeVisible();
  await expect(page.getByText('/ruta-inexistente')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/block5-404.png', fullPage: true });

  expect(runtimeErrors).toEqual([]);
  expectOnlySameOriginRequests(page, requestedUrls);
});

test('mantiene foco visible y evita desbordamiento en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: 'Saltar al contenido' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  await page.getByRole('link', { name: 'Privacidad' }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Privacidad clara, sin funciones ocultas.',
    }),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);

  await page.screenshot({ path: 'test-results/block5-mobile.png', fullPage: true });
});
