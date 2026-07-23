import { expect, test } from '@playwright/test';

const siteOrigin = 'https://jereprograma.github.io/shekinah';
const productRoutes = ['/guayaba/', '/melena-de-leon-futuro-fungi-50ml/'];

for (const route of productRoutes) {
  test(`${route} prerenderiza producto, precio y Product schema`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.product-price')).toBeVisible();
    await expect(page.locator('.product-price')).toContainText(/\d/u);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}${route}`);
    const jsonLd = await page.locator('script[data-shekinah-jsonld]').textContent();
    expect(jsonLd).toContain('Product');
    expect(jsonLd).toContain('BreadcrumbList');
    expect(errors).toEqual([]);
  });
}

test('la tienda pagina, busca y filtra el catálogo completo', async ({ page }) => {
  await page.goto('/tienda/');
  await expect(page.getByRole('heading', { level: 1, name: 'Tienda' })).toBeVisible();
  const initialCards = await page.locator('.product-card').count();
  expect(initialCards).toBeGreaterThan(1);
  expect(initialCards).toBeLessThanOrEqual(24);
  const resultText = await page.locator('.catalog-result').textContent();
  const total = Number(resultText?.match(/(\d+) productos\b/iu)?.[1] ?? 0);
  expect(total).toBeGreaterThan(1);
  if (total > 24) await expect(page.getByRole('navigation', { name: 'Paginación del catálogo' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('guayaba');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Guayaba hojas x 50 gr' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('');
  await page.getByLabel('Categoría').selectOption({ label: 'Suplementos' });
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('melena');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Melena de león Futuro fungi 50ml' })).toBeVisible();
});

test('el carrito agrega, persiste, actualiza, elimina y prepara WhatsApp', async ({ page }) => {
  await page.goto('/guayaba/');
  await page.getByLabel('Cantidad').fill('2');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  const dialog = page.getByRole('dialog', { name: 'Carrito' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Guayaba hojas x 50 gr');
  await expect(dialog).toContainText('17.998');
  const whatsapp = dialog.getByRole('link', { name: 'Consultar por WhatsApp' });
  await expect(whatsapp).toHaveAttribute('href', /wa\.me\/542236216559\?text=/u);
  await page.getByRole('button', { name: 'Cerrar carrito' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Carrito \(2\)/u }).click();
  await expect(dialog).toContainText('Guayaba hojas x 50 gr');
  await dialog.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await expect(dialog.locator('.quantity-control input')).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(dialog).toContainText('El carrito está vacío');
});

test('el carrito cierra con Escape y devuelve el foco', async ({ page }) => {
  await page.goto('/tienda/');
  const trigger = page.getByRole('button', { name: /Carrito \(0\)/u });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Carrito' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Carrito' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('las categorías son navegables y canónicas', async ({ page }) => {
  const route = '/tienda/categoria/hierbas-medicinales/';
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: /Hierbas Medicinales/iu })).toBeVisible();
  expect(await page.locator('.product-card').count()).toBeGreaterThan(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteOrigin}${route}`);
});
