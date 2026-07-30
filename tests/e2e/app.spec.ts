import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

function observePage(page: Page) {
  const runtimeErrors: string[] = [];
  const requestedUrls: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('request', (request) => {
    requestedUrls.push(request.url());
  });

  return { runtimeErrors, requestedUrls };
}

function expectCleanRuntime(
  page: Page,
  observation: ReturnType<typeof observePage>,
) {
  const currentOrigin = new URL(page.url()).origin;
  expect(observation.runtimeErrors).toEqual([]);
  expect(
    observation.requestedUrls.filter(
      (requestedUrl) => new URL(requestedUrl).origin !== currentOrigin,
    ),
  ).toEqual([]);
  expect(observation.requestedUrls.some((url) => url.includes('/src/main.tsx'))).toBe(false);
}

test('presenta navegación comercial y recorre los 510 productos compilados', async ({ page }) => {
  const observation = observePage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await expect(page).toHaveTitle('Shekinah | Hierbas y especias');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sabores naturales para todos los días.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enfoque' })).toHaveCount(0);
  await expect(page.getByText('Ver el enfoque')).toHaveCount(0);

  const headerNavigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(headerNavigation.getByRole('link')).toHaveText(['Inicio', 'Catálogo']);
  const footerNavigation = page.getByRole('navigation', { name: 'Navegación del pie' });
  await expect(footerNavigation.getByRole('link')).toHaveText([
    'Inicio',
    'Catálogo',
    'Privacidad',
  ]);

  await page.getByRole('link', { name: 'Ver catálogo' }).click();
  await expect(page).toHaveURL(/\/catalogo$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nuestros productos.' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('510 productos encontrados');
  await expect(page.locator('[data-product]')).toHaveCount(24);
  await expect(page.getByText('Página 1 de 22')).toBeVisible();
  await expect(page.locator('.catalog-notices')).toHaveCount(0);

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 2 de 22')).toBeVisible();
  await page.getByRole('searchbox').fill('  GUAYABA   ');
  await expect(page.getByRole('status')).toHaveText('1 producto encontrado');
  await expect(page.getByText('Página 1 de 1')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Guayaba hojas x 50 gr' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Guayaba hojas x 50 gr' }).click();
  await expect(page).toHaveURL(/\/guayaba$/u);
  await expect(page.getByRole('heading', { level: 2, name: 'Descripción' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/catalogo$/u);

  await page.getByRole('combobox').selectOption('hierbas-medicinales');
  await expect(page.getByRole('status')).toHaveText('205 productos encontrados');
  await expect(page.locator('[data-product]')).toHaveCount(24);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
  expectCleanRuntime(page, observation);
});

test('carga fichas comerciales sin fechas ni avisos retirados', async ({ page }) => {
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
    await expect(page.getByText('Datos comerciales capturados')).toHaveCount(0);
    await expect(page.getByText('23/07/2026', { exact: true })).toHaveCount(0);
    await expect(page.locator('.catalog-notices')).toHaveCount(0);
    await expect(page.getByText(/catálogo comercial recuperado/iu)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Descripción' })).toBeVisible();
    await expect(page.locator('.product-detail-image')).toHaveAttribute('loading', 'lazy');
    await expect(page.locator('h1')).toHaveCount(1);
  }

  expectCleanRuntime(page, observation);
});

test('preserva productos con y sin imagen o descripción', async ({ page }) => {
  const observation = observePage(page);

  await page.goto('/caldo-sin-sal-en-polvo/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Caldo sin sal en polvo' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();
  await expect(page.locator('.product-detail-image')).toHaveCount(0);
  await expect(page.getByText('Precio', { exact: true })).toBeVisible();
  await expect(page.getByText('23/07/2026')).toHaveCount(0);

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
  await expect(page.getByRole('status')).toHaveText('205 productos encontrados');
  await expect(page.locator('h1')).toHaveText('Hierbas Medicinales');
  await expect(page.getByText('205 productos en esta categoría.')).toBeVisible();

  await page.goto('/privacidad');
  await expect(page).toHaveTitle('Privacidad | Shekinah');
  await expect(page.locator('h1')).toHaveText('Privacidad.');
  await expect(
    page.getByText('No utilizamos analítica, publicidad ni rastreadores de terceros.'),
  ).toBeVisible();

  await page.goto('/enfoque');
  await expect(page).toHaveTitle('Página no encontrada | Shekinah');
  await expect(page.locator('h1')).toHaveText('Página no encontrada.');
  await expect(page.getByText('/enfoque')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enfoque' })).toHaveCount(0);

  await page.goto('/ruta-inexistente');
  await expect(page).toHaveTitle('Página no encontrada | Shekinah');
  await expect(page.getByText('/ruta-inexistente')).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/\/$/u);

  expectCleanRuntime(page, observation);
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
