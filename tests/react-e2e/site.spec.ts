import { expect, test } from '@playwright/test';

const siteOrigin = 'https://shekinah-7dl.pages.dev';
const routes = [
  '/',
  '/nosotros/',
  '/tienda/',
  '/blog/',
  '/recetas/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
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

test('el menú móvil expone correctamente su estado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375x812', 'Caso específico de navegación móvil');
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
});

test('una ruta inexistente muestra el documento 404', async ({ page }) => {
  const response = await page.goto('/no-existe-en-shekinah/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});
