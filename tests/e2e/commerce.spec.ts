import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import catalogIndexSource from '../../catalog/internal/catalog-index.json' with { type: 'json' };
import catalogDetailSource from '../../src/catalog-data/catalog-details.json' with { type: 'json' };

const duxCatalogProducts: readonly Record<string, unknown>[] = catalogIndexSource.map(
  (product) => Object.freeze({
    ...product,
    availability: 'available',
    commerce: Object.freeze({
      source: 'dux',
      catalogVersion: 'd'.repeat(64),
      syncedAt: '2026-08-26T12:00:00.000Z',
      availabilityState: 'verified',
      checkoutEligible: true,
      mappingStatus: 'mapped',
      quantitySemanticsStatus: 'verified',
      observedStock: Object.freeze({ real: 100, reserved: 0, available: 100 }),
      unit: Object.freeze({ name: 'unidad de prueba Dux', symbol: 'u' }),
      depositName: 'Depósito E2E Dux',
    }),
  }),
);

test.beforeEach(async ({ context, page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
  await context.route('**/api/catalog**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ products: duxCatalogProducts }),
      });
      return;
    }
    const slug = pathname.startsWith('/api/catalog/')
      ? decodeURIComponent(pathname.slice('/api/catalog/'.length))
      : '';
    const summary = duxCatalogProducts.find((product) => product.slug === slug);
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

async function fillWhatsappFulfillment(page: Page) {
  await page.getByLabel('Modalidad').selectOption('correo_argentino');
  await page.getByLabel('Nombre completo').fill('Ana Pérez');
  await page.getByLabel('Celular').fill('+54 9 11 5555-4444');
  await page.getByLabel('Dirección').fill('Calle 123');
  await page.getByLabel('Localidad').fill('La Plata');
  await page.getByLabel('Provincia').fill('Buenos Aires');
  await page.getByLabel('Código postal').fill('B1900');
  await page.getByLabel(/Acepto compartir los datos/iu).check();
}

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

test('confirma agregar, ajustar y eliminar sin cambios destructivos ambiguos', async ({ page }) => {
  await page.goto('/catalogo');
  const firstProduct = page.locator('[data-product]').first();
  const productName = (await firstProduct.getByRole('heading').textContent())?.trim();
  if (productName === undefined || productName === '') {
    throw new Error('No se pudo identificar el producto E2E del carrito.');
  }

  await firstProduct.getByRole('button', { name: /Agregar .* al carrito/u }).click();
  await expect(firstProduct.getByText(`${productName}: 1 unidad en el carrito.`)).toBeVisible();
  await expect(firstProduct.getByRole('button', {
    name: `Agregar otra unidad de ${productName} al carrito`,
  })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();

  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  const quantity = page.getByRole('spinbutton', { name: /Cantidad de /u });
  const originalSubtotal = await page.locator('.cart-line-subtotal').textContent();
  await quantity.fill('2');
  await expect(page.getByText('2 unidades en el carrito.')).toBeVisible();
  await expect(page.locator('.cart-context-feedback')).toHaveText(
    `Cantidad de ${productName} actualizada a 2 unidades.`,
  );
  await expect(page.locator('.cart-line-subtotal')).not.toHaveText(originalSubtotal ?? '');

  await quantity.fill('0');
  await expect(page.getByText(/Para quitar el producto, usá Eliminar/u)).toBeVisible();
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();
  await expect(page.getByText('2 unidades en el carrito.')).toBeVisible();

  await page.getByRole('button', { name: /Eliminar .* del carrito/u }).click();
  await expect(page.getByRole('heading', { name: 'El carrito está vacío' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Carrito, 0 productos' })).toBeVisible();
});

test('mantiene feedback comprensible en móvil con movimiento reducido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  const firstProduct = page.locator('[data-product]').first();

  await firstProduct.getByRole('button', { name: /Agregar .* al carrito/u }).click();

  await expect(firstProduct.getByText(/1 unidad en el carrito/u)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrito, 1 producto' })).toBeVisible();
  await expect(page.locator('.cart-count')).toHaveCSS('animation-name', 'none');
  const widths = await page.evaluate(() => ({
    content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
});

test('mantiene Checkout cerrado sin exponer monto manual y conserva WhatsApp', async ({ page }) => {
  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();

  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Mercado Pago/u })).toHaveCount(0);
  await expect(page.getByText(/copiar|pegalo|ingresá.*monto/iu)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeDisabled();
  await fillWhatsappFulfillment(page);
  await expect(page.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeEnabled();
  await expect(page.getByText(/WhatsApp estará disponible/iu)).toHaveCount(0);
});

test('registra y reserva una sola vez antes de ofrecer el segundo gesto de WhatsApp', async ({ page }) => {
  let orderRequests = 0;
  let releaseOrder: (() => void) | undefined;
  const orderGate = new Promise<void>((resolve) => {
    releaseOrder = resolve;
  });
  await page.route('**/api/orders/whatsapp', async (route) => {
    orderRequests += 1;
    await orderGate;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(whatsappOrderFixture()),
    });
  });

  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  await fillWhatsappFulfillment(page);

  const createOrder = page.getByRole('button', { name: 'Pedir por WhatsApp' });
  await createOrder.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(page.getByRole('button', { name: 'Creando pedido…' })).toBeDisabled();
  await expect(page.getByText(/registrando el pedido y reservando las unidades/u)).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Cantidad de /u })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveCount(0);
  await expect.poll(() => orderRequests).toBe(1);
  expect(page.context().pages()).toHaveLength(1);

  releaseOrder?.();
  await expect(page.getByRole('heading', { name: 'Pedido registrado' })).toBeFocused();
  await expect(page.getByText(/quedó pendiente de aprobación/u)).toContainText('SHK-WWWWWWWW');
  const whatsappLink = page.getByRole('link', { name: 'Abrir WhatsApp' });
  await expect(whatsappLink).toHaveAttribute('target', '_blank');
  const href = await whatsappLink.getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href ?? '');
  expect(url.origin).toBe('https://wa.me');
  expect(url.searchParams.get('text')).toContain(whatsappOrderFixture().orderId);
  expect(url.searchParams.get('text')).toContain('Snapshot E2E autoritativo');
  expect(orderRequests).toBe(1);
  expect(page.context().pages()).toHaveLength(1);
  await expect(page.getByText('1 unidad en el carrito.')).toBeVisible();
});

for (const [status, message] of [
  [409, 'Algunos productos ya no tienen la cantidad solicitada.'],
  [500, 'No pudimos registrar el pedido. Revisá el carrito e intentá nuevamente.'],
] as const) {
  test(`conserva el carrito y no ofrece WhatsApp ante error ${status}`, async ({ page }) => {
    let orderRequests = 0;
    await page.route('**/api/orders/whatsapp', async (route) => {
      orderRequests += 1;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: status === 409 ? 'INSUFFICIENT_STOCK' : 'INTERNAL_ERROR', message } }),
      });
    });

    await page.goto('/catalogo');
    await page.locator('[data-product]').first().getByRole('button', {
      name: /Agregar .* al carrito/u,
    }).click();
    await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
    await fillWhatsappFulfillment(page);
    await page.getByRole('button', { name: 'Pedir por WhatsApp' }).click();

    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveCount(0);
    await expect(page.getByText('1 unidad en el carrito.')).toBeVisible();
    expect(orderRequests).toBe(1);
    expect(page.context().pages()).toHaveLength(1);
  });
}

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

test('respeta ausencia, rechazo, aceptación y revocación del consentimiento', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('shekinah.analytics-consent.v1');
  });
  const events: unknown[] = [];
  await page.route('**/api/analytics/events', async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' });
  });
  await page.route('**/api/privacy/delete-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"deleted":true}' });
  });
  await page.goto('/');
  expect(events).toHaveLength(0);
  await page.getByRole('button', { name: 'Continuar sin analítica' }).click();
  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  expect(events).toHaveLength(0);

  await page.getByRole('link', { name: 'Privacidad' }).click();
  await page.getByRole('button', { name: 'Aceptar analítica opcional' }).click();
  await expect.poll(() => events.length).toBeGreaterThan(0);
  await expect(page.getByText(/Estado actual:/u)).toContainText('aceptada');
  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  await expect(page).toHaveURL(/\/catalogo$/u);
  await expect.poll(() => events.filter(isPageView).length).toBeGreaterThan(0);

  const countBeforeWithdrawal = events.length;
  await page.getByRole('link', { name: 'Privacidad' }).click();
  await page.getByRole('button', { name: 'Retirar consentimiento y eliminar sesión' }).click();
  await expect(page.getByText(/servidor confirmó la eliminación/iu)).toBeVisible();
  await page.getByRole('link', { name: 'Inicio' }).first().click();
  expect(events).toHaveLength(countBeforeWithdrawal + 1);
});

test('mide sólo aperturas reales y conserva Checkout cerrado, pedido y WhatsApp separados', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('shekinah.analytics-consent.v1');
  });
  const events: Array<Record<string, unknown>> = [];
  let checkoutPreferenceCalls = 0;
  await page.route('**/api/analytics/events', async (route) => {
    events.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' });
  });
  await page.route('**/api/checkout/preferences', async (route) => {
    checkoutPreferenceCalls += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  let orderRequests = 0;
  await page.route('**/api/orders/whatsapp', async (route) => {
    orderRequests += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(whatsappOrderFixture()),
    });
  });

  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Aceptar analítica' }).click();
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();

  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Mercado Pago/u })).toHaveCount(0);
  expect(events.filter(isManualPaymentClick)).toHaveLength(0);

  await page.getByLabel('Modalidad').selectOption('correo_argentino');
  await page.getByRole('textbox', { name: 'Nombre completo' }).fill('Cliente de prueba');
  await page.getByRole('textbox', { name: 'Celular' }).fill('5491100000000');
  await page.getByRole('textbox', { name: 'Dirección' }).fill('Calle de prueba 123');
  await page.getByRole('textbox', { name: 'Localidad' }).fill('Mar del Plata');
  await page.getByRole('textbox', { name: 'Provincia' }).fill('Buenos Aires');
  await page.getByRole('textbox', { name: 'Código postal' }).fill('B7600');

  expect(checkoutPreferenceCalls).toBe(0);

  await page.getByLabel(/Acepto compartir los datos/iu).check();
  await page.getByRole('button', { name: 'Pedir por WhatsApp' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido registrado' })).toBeFocused();
  expect(orderRequests).toBe(1);
  expect(events.filter(isWhatsappOpen)).toHaveLength(0);
  const whatsappLink = page.getByRole('link', { name: 'Abrir WhatsApp' });
  const href = await whatsappLink.getAttribute('href');
  expect(new URL(href ?? '').searchParams.get('text')).toContain(whatsappOrderFixture().orderId);
  await whatsappLink.evaluate((link: HTMLAnchorElement) => {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.click();
  });
  await expect.poll(() => events.filter(isWhatsappOpen).length).toBe(1);
  expect(events.filter(isManualPaymentClick)).toHaveLength(0);
  expect(checkoutPreferenceCalls).toBe(0);
});

function isPageView(value: unknown): boolean {
  return typeof value === 'object' && value !== null &&
    (value as Record<string, unknown>).eventName === 'page_view';
}

function isManualPaymentClick(value: Record<string, unknown>): boolean {
  return value.eventName === 'manual_payment_click';
}

function isWhatsappOpen(value: Record<string, unknown>): boolean {
  return value.eventName === 'whatsapp_open';
}

function whatsappOrderFixture() {
  return {
    orderId: `ord_${'w'.repeat(24)}`,
    status: 'pending',
    currency: 'ARS',
    totalMinor: 123_400,
    itemCount: 1,
    createdAt: '2026-08-12T12:00:00.000Z',
    items: [{
      productId: 'producto-e2e-snapshot',
      name: 'Snapshot E2E autoritativo',
      presentation: '100 g',
      quantity: 1,
      unitPriceMinor: 123_400,
      subtotalMinor: 123_400,
    }],
  };
}
