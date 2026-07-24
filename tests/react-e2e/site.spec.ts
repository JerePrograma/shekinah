import { expect, test } from '@playwright/test';

const siteOrigin = 'https://shekinah-7dl.pages.dev';
const routes = [
  '/',
  '/nosotros/',
  '/contacto/',
  '/tienda/',
  '/blog/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/terms-and-conditions/',
];

for (const route of routes) {
  test(`${route} está prerenderizada, accesible y sin errores de consola`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}${route}`);
    await expect(page.locator('body')).not.toContainText('Hello world!');
    await expect(page.locator('body')).not.toContainText('trans-current-year');
    expect(errors).toEqual([]);
  });
}

test('el menú móvil expone su estado y etiquetas completas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375x812', 'Caso específico de navegación móvil');
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menú' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Productos' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
});

test('las rutas retiradas llevan al catálogo', async ({ page }) => {
  for (const route of ['/recetas/', '/chocolate-casero/', '/receta-barra-de-cereal/']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/tienda\/$/u);
    await expect(page.getByRole('heading', { level: 1, name: 'Productos' })).toBeVisible();
  }
});

test('la interfaz no produce desbordamiento horizontal desde 320 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440x1200', 'Se ejecuta una vez con tamaños controlados');
  for (const width of [320, 360, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/tienda/', '/guayaba/', '/contacto/']) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
      await expect(page.locator('main#main-content')).toBeVisible();
    }
  }
});

test('el foco de teclado es visible en la navegación principal', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  const outline = await page.getByRole('link', { name: 'Saltar al contenido' }).evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
});

test('una ruta inexistente muestra el documento 404', async ({ page }) => {
  const response = await page.goto('/no-existe-en-shekinah/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});
