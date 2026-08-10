import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
});

test('persiste el carrito y lo sincroniza entre pestañas', async ({ context, page }) => {
  const secondPage = await context.newPage();
  await page.goto('/catalogo');
  await secondPage.goto('/carrito');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
  await expect(secondPage.getByText('1 unidad en el carrito.')).toBeVisible();
  await secondPage.reload();
  await expect(secondPage.getByText('1 unidad en el carrito.')).toBeVisible();
});

test('habilita el Link de Pago y WhatsApp autorizados sin activar Checkout Pro', async ({ page }) => {
  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();

  const paymentLink = page.getByRole('link', { name: /Copiar .* y abrir Mercado Pago/u });
  await expect(paymentLink).toBeVisible();
  await expect(paymentLink).toHaveAttribute(
    'href',
    'https://link.mercadopago.com.ar/shekinahmoreno',
  );
  await expect(paymentLink).toHaveAttribute('target', '_blank');
  await expect(page.getByText(/Cobro temporal manual/iu)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar carrito por WhatsApp' })).toBeEnabled();
  await expect(page.getByText(/WhatsApp estará disponible/iu)).toHaveCount(0);
});

test('el retorno del navegador sólo muestra el estado confirmado por el servidor', async ({ page }) => {
  const publicToken = 'a'.repeat(64);
  await page.route('**/api/orders/*/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'pending',
        totalMinor: 123_400,
        itemCount: 1,
        currency: 'ARS',
        updatedAt: '2026-07-30T12:00:00.000Z',
      }),
    });
  });
  await page.goto(`/pago/exito?order=${publicToken}&status=approved`);
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
  await expect(page.getByText('Aprobado', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pago pendiente' })).toBeVisible();
});

test('vacía el carrito únicamente después de una aprobación confirmada para el mismo intento', async ({ page }) => {
  const publicToken = 'b'.repeat(64);
  await page.route('**/api/orders/*/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'approved',
        totalMinor: 123_400,
        itemCount: 1,
        currency: 'ARS',
        updatedAt: '2026-07-31T12:00:00.000Z',
      }),
    });
  });

  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('shekinah.cart.v1');
        if (raw === null) return 0;
        const parsed = JSON.parse(raw) as { items?: unknown[] };
        return Array.isArray(parsed.items) ? parsed.items.length : 0;
      }),
    )
    .toBe(1);

  await page.evaluate((token) => {
    const rawCart = window.localStorage.getItem('shekinah.cart.v1');
    if (rawCart === null) throw new Error('No se persistió el carrito de prueba.');
    const parsed = JSON.parse(rawCart) as { items?: Array<{ productId?: unknown; quantity?: unknown }> };
    const lines = Array.isArray(parsed.items) ? parsed.items : [];
    const fingerprint = lines
      .flatMap((line) =>
        typeof line.productId === 'string' && typeof line.quantity === 'number'
          ? [`${line.productId}:${line.quantity}`]
          : [],
      )
      .sort()
      .join('|');
    if (fingerprint === '') throw new Error('No se pudo construir la huella del carrito.');
    window.sessionStorage.setItem(
      'shekinah.checkout-order.v1',
      JSON.stringify({ publicToken: token, fingerprint, createdAt: Date.now() }),
    );
  }, publicToken);

  await page.goto(`/pago/exito?order=${publicToken}&status=pending`);
  await expect(page.getByRole('heading', { name: 'Pago aprobado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrito, 0 productos' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('shekinah.cart.v1');
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as { items?: unknown[] };
        return Array.isArray(parsed.items) ? parsed.items.length : null;
      }),
    )
    .toBe(0);
  await expect
    .poll(async () => page.evaluate(() => window.sessionStorage.getItem('shekinah.checkout-order.v1')))
    .toBeNull();
});

test('no envía analítica antes del consentimiento ni cuando el flag está cerrado', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('shekinah.analytics-consent.v1');
  });
  let eventCount = 0;
  await page.route('**/api/analytics/events', async (route) => {
    eventCount += 1;
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' });
  });
  await page.goto('/');
  expect(eventCount).toBe(0);
  await page.getByRole('button', { name: 'Aceptar analítica' }).click();
  expect(eventCount).toBe(0);
  await page.goto('/privacidad');
  await expect(page.getByText(/Estado actual:/u)).toContainText('deshabilitada por configuración');
  await page.getByRole('button', { name: 'Retirar consentimiento y eliminar sesión' }).click();
  await expect(page.getByText(/No había una sesión analítica local/iu)).toBeVisible();
  expect(eventCount).toBe(0);
});
