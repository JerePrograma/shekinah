import { duxApiFixture } from '../../src/test/dux-api-fixture';
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
        body: JSON.stringify(duxApiFixture({ products: duxCatalogProducts })),
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
      body: JSON.stringify(duxApiFixture({ product: { ...summary, ...detail } })),
    });
  });
});

async function fillWhatsappFulfillment(page: Page) {
  await page.getByLabel('¿Cómo querés recibir tu compra?').selectOption('correo_argentino');
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

test('Dux asistido no vuelve al checkout anterior cuando las solicitudes no están disponibles', async ({ page }) => {
  await page.route('**/api/catalog', async (route) => {
    const products = duxCatalogProducts.map((product) => ({ ...product,
      commerce: { ...(product.commerce as Record<string, unknown>), checkoutEligible: false,
        quantitySemanticsStatus: 'unavailable_from_v2_items' },
    }));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(duxApiFixture({ products })),
    });
  });
  await page.route('**/api/orders/request-capability', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }));
  let legacyRequests = 0;
  await page.route(/\/api\/(?:orders\/whatsapp|checkout\/preferences)$/u, async (route) => {
    legacyRequests += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', {
    name: /Agregar .* al carrito/u,
  }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  await page.getByLabel('¿Cómo querés recibir tu compra?').selectOption('correo_argentino');

  await expect(page.getByText(/No podemos iniciar tu compra en este momento/iu)).toBeVisible();
  await expect(page.getByText(/Te confirmamos el costo de envío/iu)).toBeVisible();
  const contact = page.getByRole('link', { name: '¿Necesitás ayuda? Escribinos por WhatsApp' });
  await expect(contact).toBeVisible();
  await expect(contact).toHaveAttribute('href',
    `https://wa.me/5492236216559?text=${encodeURIComponent('Hola, quiero consultar mi compra en Shekinah.')}`);
  await expect(contact).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pedir por WhatsApp' })).toHaveCount(0);
  await expect(page.getByText(/peso determinístico|cotización por WhatsApp/iu)).toHaveCount(0);
  await expect(page.getByText('1 unidad en el carrito.')).toBeVisible();
  expect(legacyRequests).toBe(0);
});

test('compra web móvil identifica errores y nunca envía una cantidad distinta de la visible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('**/api/orders/request-capability', (route) => route.fulfill({ json: { enabled: true } }));
  const requests: unknown[] = [];
  await page.route('**/api/orders/request', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: {
      reference: 'WEB-abcdefghijklmnopqrstuvwx', publicToken: 'e'.repeat(64), status: 'submitted',
      createdAt: '2026-09-27T12:00:00.000Z', updatedAt: '2026-09-27T12:00:00.000Z',
      paymentStatus: 'not_requested', paymentRequiresReview: false, reservationStatus: 'not_reserved',
      checkoutAvailable: false, totalMinor: null,
    } });
  });
  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', { name: /Agregar .* al carrito/u }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  const continueButton = page.getByRole('button', { name: /Completar mis datos|Continuar al pago/u });
  await expect(continueButton).toBeEnabled();
  await continueButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nombre completo')).toBeFocused();
  await expect(page.getByLabel('Nombre completo')).toHaveAttribute('aria-invalid', 'true');
  expect(requests).toHaveLength(0);

  await page.getByLabel('Nombre completo').fill('Cliente de prueba');
  await page.getByLabel('Celular').fill('12');
  await continueButton.click();
  await expect(page.getByLabel('Celular')).toBeFocused();
  await expect(page.getByText('Revisá el celular: incluí el código de área y el número completo.')).toBeVisible();
  expect(requests).toHaveLength(0);

  await page.getByLabel('Celular').fill('2235550100');
  const quantity = page.getByRole('spinbutton', { name: /Cantidad de /u });
  await quantity.fill('0');
  await continueButton.click();
  await expect(quantity).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Revisá las cantidades del carrito');
  expect(requests).toHaveLength(0);
  const widths = await page.evaluate(() => ({
    content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);

  await quantity.fill('2');
  await continueButton.click();
  await expect(page.getByRole('heading', { name: 'Tu compra' })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ mode: 'create', items: [{ quantity: 2 }],
    fulfillment: { fullName: 'Cliente de prueba', phone: '2235550100' } });
});

test('una referencia eliminada permite comprar con una sola acción, datos accesibles y la misma identidad', async ({ page }, testInfo) => {
  const identity = { idempotencyKey: '00000000-0000-4000-8000-000000000000', ownerSecret: 'b'.repeat(64) };
  const requests: unknown[] = [];
  await page.route('**/api/orders/request-capability', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/orders/request', async route => {
    const body: unknown = route.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1) {
      expect(body).toEqual({ mode: 'recover', ...identity });
      await route.fulfill({ status: 404, json: { error: { code: 'WEB_REQUEST_NOT_FOUND', message: 'No se encontró la solicitud.' } } });
    } else {
      expect(body).toMatchObject({ mode: 'create', ...identity });
      await route.fulfill({ status: 201, json: {
        reference: 'WEB-abcdefghijklmnopqrstuvwx', publicToken: 'e'.repeat(64), status: 'accepted',
        createdAt: '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T12:00:00Z',
        paymentStatus: 'not_requested', paymentRequiresReview: false, reservationStatus: 'not_reserved',
        preparationStatus: 'requires_review', checkoutAvailable: false, totalMinor: null,
      } });
    }
  });
  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', { name: /Agregar .* al carrito/u }).click();
  await page.evaluate(async saved => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('shekinah.web-requests.v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('attempts');
      open.onerror = () => reject(new Error('No se pudo preparar la identidad sintética.'));
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('attempts', 'readwrite');
        tx.objectStore('attempts').put(saved, 'active');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(new Error('No se guardó la identidad sintética.')); };
      };
    });
  }, identity);
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  const complete = page.getByRole('button', { name: 'Completar mis datos' });
  await expect(complete).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualizar estado' })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.cart-summary .button-primary')).toHaveCount(1);
    const dimensions = await page.evaluate(() => ({
      content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      viewport: document.documentElement.clientWidth,
      fields: [...document.querySelectorAll<HTMLInputElement>('.fulfillment-grid input')]
        .map(input => ({ height: input.getBoundingClientRect().height, font: Number.parseFloat(getComputedStyle(input).fontSize) })),
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.fields).toHaveLength(2);
    expect(dimensions.fields.every(field => field.height >= 48 && field.font >= 16)).toBe(true);
    expect((await complete.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await complete.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nombre completo')).toBeFocused();
  await expect(page.getByText('Completá tu nombre completo.')).toBeVisible();
  const header = await page.locator('.site-header').boundingBox();
  const nameField = await page.getByLabel('Nombre completo').boundingBox();
  expect(nameField?.y).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0));
  expect(requests).toHaveLength(1);
  await page.getByLabel('Nombre completo').fill('Cliente de prueba');
  await page.getByLabel('Celular').fill('2235550100');
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
  await page.locator('.cart-summary').screenshot({ path: testInfo.outputPath('buyer-cart-mobile.png') });
  await page.screenshot({ path: testInfo.outputPath('buyer-cart-mobile-full.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page.getByRole('link', { name: 'Pedir ayuda por WhatsApp' })).toBeVisible();
  await expect(page.getByLabel('Nombre completo')).toHaveCount(0);
  await expect(page.locator('.cart-summary .button-primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Actualizar estado' })).toHaveClass('text-button');
  await expect(page.locator('body')).not.toContainText(/DIRECT_RESERVATION|Dux|idempotencia/u);
  await page.locator('.cart-summary').screenshot({ path: testInfo.outputPath('buyer-review-mobile.png') });
  expect(requests).toHaveLength(2);
});

test('una conexión interrumpida muestra una sola recuperación y nunca crea otro pedido', async ({ page }, testInfo) => {
  const token = 'f'.repeat(64);
  let reads = 0;
  let creates = 0;
  await page.route('**/api/orders/request-capability', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/orders/request', route => { creates += 1; return route.fulfill({ status: 500, json: {} }); });
  await page.route(`**/api/orders/${token}/request-status`, async route => {
    reads += 1;
    if (reads === 1) await route.abort('failed');
    else await route.fulfill({ json: {
      reference: 'WEB-abcdefghijklmnopqrstuvwx', status: 'accepted',
      createdAt: '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T12:00:00Z',
      paymentStatus: 'not_requested', paymentRequiresReview: false, reservationStatus: 'confirmed',
      preparationStatus: 'prepared', checkoutAvailable: true, totalMinor: 350000,
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/carrito#solicitud=${token}`);
  await expect(page.getByRole('alert')).toHaveText('No pudimos consultar tu pedido. Tocá «Volver a intentar».');
  await expect(page.locator('.web-request-panel .button-primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toHaveCount(0);
  await page.locator('.web-request-panel').screenshot({ path: testInfo.outputPath('buyer-retry-mobile.png') });
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('button', { name: 'Ir a Mercado Pago' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Total confirmado:')).toBeVisible();
  expect(reads).toBe(2);
  expect(creates).toBe(0);
});

test('actualiza la solicitud y permite continuar a Mercado Pago sin recargar datos', async ({ page }) => {
  const token = 'a'.repeat(64);
  let reads = 0;
  let checkouts = 0;
  let creates = 0;
  await page.clock.install();
  await page.route('**/api/orders/request', async (route) => {
    creates += 1;
    await route.fulfill({ status: 409, contentType: 'application/json', body: '{}' });
  });
  await page.route(`**/api/orders/${token}/request-status`, async (route) => {
    reads += 1;
    const ready = reads > 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      reference: 'WEB-abcdefghijklmnopqrstuvwx', status: ready ? 'accepted' : 'submitted',
      createdAt: '2026-09-14T12:00:00.000Z', updatedAt: '2026-09-14T12:01:00.000Z',
      paymentStatus: 'not_requested', paymentRequiresReview: false,
      reservationStatus: ready ? 'confirmed' : 'not_reserved', checkoutAvailable: ready,
      totalMinor: ready ? 350_000 : null,
    }) });
  });
  await page.route(`**/api/orders/${token}/checkout`, async (route) => {
    checkouts += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postData()).toBeNull();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic-customer-flow',
      totalMinor: 350_000,
    }) });
  });
  await page.route('https://www.mercadopago.com.ar/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<h1>Proveedor simulado para la prueba</h1>',
  }));
  await page.goto(`/carrito#solicitud=${token}`);
  await expect(page.getByRole('heading', { name: 'Tu compra' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir a Mercado Pago' })).toHaveCount(0);
  expect(checkouts).toBe(0);
  await page.clock.fastForward(15_000);
  const pay = page.getByRole('button', { name: 'Ir a Mercado Pago' });
  await expect(pay).toBeEnabled();
  await expect(page.locator('.web-request-panel p').filter({ hasText: 'Total confirmado:' })).toContainText('3.500');
  expect(reads).toBe(2);
  expect(creates).toBe(0);
  expect(checkouts).toBe(0);
  await pay.click();
  await expect(page).toHaveURL('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic-customer-flow');
  expect(checkouts).toBe(1);
});

test('compra directa: un solo CTA prepara y redirige sin pausas adicionales tras una respuesta lenta', async ({ page }) => {
  const token = 'c'.repeat(64);
  const receipt = { reference: 'WEB-abcdefghijklmnopqrstuvwx', status: 'submitted',
    createdAt: '2026-09-21T12:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z',
    paymentStatus: 'not_requested', paymentRequiresReview: false, reservationStatus: 'not_reserved',
    checkoutAvailable: false, totalMinor: null, preparationStatus: 'preparing' };
  let creates = 0;
  let preparations = 0;
  let checkouts = 0;
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  await page.clock.install();
  await page.route('**/api/orders/request-capability', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/orders/request', async (route) => {
    creates += 1;
    expect(route.request().postDataJSON()).toMatchObject({ mode: 'create' });
    await createGate;
    return route.fulfill({ status: 201, json: { ...receipt, publicToken: token } });
  });
  await page.route(`**/api/orders/${token}/prepare`, (route) => {
    preparations += 1;
    return route.fulfill({ json: { ...receipt, status: 'accepted', preparationStatus: 'prepared',
      reservationStatus: 'confirmed', checkoutAvailable: true, totalMinor: 350000 } });
  });
  await page.route(`**/api/orders/${token}/checkout`, (route) => {
    checkouts += 1;
    expect(preparations).toBe(1);
    expect(route.request().postData()).toBeNull();
    return route.fulfill({ status: 201, json: {
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic-direct-ux', totalMinor: 350000,
    } });
  });
  await page.route('https://www.mercadopago.com.ar/**', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<h1>Checkout Pro simulado</h1>',
  }));
  await page.goto('/catalogo');
  await page.locator('[data-product]').first().getByRole('button', { name: /Agregar .* al carrito/u }).click();
  await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
  await page.getByLabel('Nombre completo').fill('Cliente de prueba UX');
  await page.getByLabel('Celular').fill('2235550100');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await expect(page.getByRole('heading', { name: 'Estamos preparando tu compra…' })).toBeVisible();
  await expect(page.getByText('Esperá un momento. Esta pantalla se actualiza sola.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Solicitud registrada|WEB-|Enlace protegido|Consultar estado de la solicitud|Dux|verificaciones/u);
  await expect(page.getByRole('button', { name: 'Actualizar estado' })).toHaveCount(0);
  expect(checkouts).toBe(0);
  await expect.poll(() => creates).toBe(1);
  await page.clock.fastForward(8000);
  releaseCreate?.();
  await expect(page).toHaveURL('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic-direct-ux', { timeout: 2000 });
  expect(creates).toBe(1);
  expect(preparations).toBe(1);
  expect(checkouts).toBe(1);
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
        orderNumber: 'SHK-1234ABCD',
        status: 'pending',
        totalMinor: 123_400,
        itemCount: 1,
        currency: 'ARS',
        updatedAt: '2026-07-30T12:00:00.000Z',
      }),
    });
  });
  await page.goto(`/pago/exito?order=${publicToken}&status=approved`);
  await expect(page.getByText('Tu pedido está registrado. No vuelvas a pagar mientras verificamos la acreditación.')).toBeVisible();
  await expect(page.getByText('SHK-1234ABCD')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¡Compra confirmada!' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Estamos confirmando tu pago' })).toBeVisible();
});

test('vacía el carrito únicamente después de una aprobación confirmada para el mismo intento', async ({ page }) => {
  const publicToken = 'b'.repeat(64);
  await page.route('**/api/orders/*/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderNumber: 'SHK-1234ABCD',
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
  await expect(page.getByRole('heading', { name: '¡Compra confirmada!' })).toBeVisible();
  await expect(page.getByText('Tu pedido es SHK-1234ABCD.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enviar mensaje por WhatsApp' })).toHaveAttribute('href', /wa\.me\/5492236216559\?text=.*SHK-1234ABCD/u);
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

  await page.getByLabel('¿Cómo querés recibir tu compra?').selectOption('correo_argentino');
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
