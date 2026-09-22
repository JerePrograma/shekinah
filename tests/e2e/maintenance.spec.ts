import { expect, test } from '@playwright/test';

for (const path of ['/', '/catalogo', '/guayaba', '/carrito', '/pago/exito']) {
  test(`conserva el mantenimiento público en ${path}`, async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({
      status: 404, contentType: 'application/json', body: '{}',
    }));
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Sitio en mantenimiento' })).toBeVisible();
    await expect(page).toHaveTitle('Mantenimiento | Shekinah');
    await expect(page.getByRole('button', { name: /pagar|comprar/iu })).toHaveCount(0);
  });
}

test('permite el ingreso administrativo durante el mantenimiento', async ({ page }) => {
  await page.route('**/api/admin/auth/session', route => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
  }));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acceso administrativo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Sitio en mantenimiento' })).toHaveCount(0);
});
