import { expect, test } from '@playwright/test';

test('muestra el catálogo vacío autorizado en escritorio sin errores', async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Una experiencia simple para descubrir nuevos sabores.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);

  await page.getByRole('link', { name: 'Explorar catálogo' }).click();
  await expect(page).toHaveURL(/#catalogo$/);
  await expect(
    page.getByRole('heading', { level: 3, name: 'Todavía no hay productos publicados' }),
  ).toBeVisible();

  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('[data-product]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /contacto/i })).toHaveCount(0);

  await page.screenshot({ path: 'test-results/block4-desktop.png', fullPage: true });
  expect(runtimeErrors).toEqual([]);
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
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Todavía no hay productos publicados');
  await expect(page.locator('[data-product]')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/block4-mobile.png', fullPage: true });
});
