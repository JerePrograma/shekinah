import { expect, test } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';

import { formatOrderNumber } from '../../src/commerce/contracts';

const FIXTURE_USERNAME = 'admin-e2e-ficticio';
const FIXTURE_PASSWORD = 'Clave-E2E-totalmente-ficticia-2026!';
const TECHNICAL_PRODUCT_NAME = 'Producto técnico E2E 2026';
const TECHNICAL_PRODUCT_ID = 'producto-tecnico-e2e-2026';
const MANAGED_IMAGE_PATH =
  '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.png';
const TECHNICAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type AdminProduct = {
  id: string;
  slug: string;
  path: string;
  name: string;
  categorySlugs: string[];
  categoryNames: string[];
  presentation?: string;
  price: { amount: number; currency: 'ARS' };
  salePrice?: { amount: number; currency: 'ARS' };
  sku?: string;
  availability?: 'available' | 'unavailable';
  commerce?: {
    source: 'dux';
    catalogVersion: string;
    syncedAt: string;
    availabilityState: 'verified' | 'out_of_stock';
    checkoutEligible: boolean;
    mappingStatus: 'mapped';
    quantitySemanticsStatus: 'verified';
    observedStock: { real: number; reserved: number; available: number };
  };
  shortDescription?: string;
  description?: string;
  primaryImage?: { src: string; alt: string };
  images: Array<{ src: string; alt: string }>;
  variants: unknown[];
};

type RecordedRequest = Readonly<{
  body?: unknown;
  method: string;
  pathname: string;
}>;

type MockAdminOrder = {
  order: {
    id: string;
    channel: 'checkout_pro' | 'whatsapp';
    status: string;
    currency: 'ARS';
    total_minor: number;
    item_count: number;
    created_at: string;
    delivery_method: string;
    full_name: string;
    [key: string]: unknown;
  };
  items: Array<{
    product_id: string;
    quantity: number;
    [key: string]: unknown;
  }>;
  payments: unknown[];
};

type StatefulAdminApiOptions = Readonly<{
  orders?: readonly MockAdminOrder[];
  deferOrderAction?: boolean;
  conflictOnOrderAction?: Readonly<{
    orderId: string;
    authoritativeStatus: 'approved' | 'rejected';
  }>;
}>;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
});

test('UI simulada: inicia y cierra una sesión administrativa sin persistir credenciales', async ({ page }) => {
  // Vite Preview no ejecuta Pages Functions. Este estado simulado valida únicamente la UI;
  // la autenticación, cookie y autorización reales se validan en integración y en Pages.
  const api = await installStatefulAdminApi(page, []);

  await page.goto('/admin');
  await expect(page).toHaveTitle('Administración | Shekinah');

  const favicon = page.locator('head link[rel~="icon"]');
  await expect(favicon).toHaveAttribute('href', '/assets/favicon-shekinah.svg');
  await expect(favicon).toHaveAttribute('type', 'image/svg+xml');
  await expect(favicon).toHaveAttribute('sizes', 'any');
  const faviconResponse = await page.request.get('/assets/favicon-shekinah.svg');
  expect(faviconResponse.status()).toBe(200);
  expect(faviconResponse.headers()['content-type']).toContain('image/svg+xml');
  expect((await faviconResponse.body()).byteLength).toBeGreaterThan(0);

  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Usuario' })).toHaveAttribute(
    'autocomplete',
    'username',
  );
  await expect(page.getByLabel('Contraseña')).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Usuario' }).fill(FIXTURE_USERNAME);
  await page.getByLabel('Contraseña').fill('Credencial-ficticia-incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo iniciar sesión. Revisá las credenciales e intentá nuevamente.',
  );

  await loginWithFixture(page, 'summary');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Resumen operativo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Productos' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Catálogo de productos' })).toBeVisible();
  await page.getByRole('button', { name: 'Pedidos' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pedidos' })).toBeVisible();
  await page.getByRole('button', { name: 'Analítica' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Analítica first-party' })).toBeVisible();
  await page.getByRole('button', { name: 'Auditoría' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Auditoría administrativa' })).toBeVisible();
  await expect(page.getByText(/Sesión iniciada como/u)).toContainText('Administración E2E');

  const storedValues = await page.evaluate(() => JSON.stringify({
    local: Object.values(window.localStorage),
    session: Object.values(window.sessionStorage),
  }));
  expect(storedValues).not.toContain(FIXTURE_PASSWORD);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Usuario' })).toBeFocused();
  const protectedStatus = await page.evaluate(async () => {
    const response = await fetch('/api/admin/products', { credentials: 'same-origin' });
    return response.status;
  });
  expect(protectedStatus).toBe(401);
  expect(api.authenticated()).toBe(false);

  await page.getByRole('link', { name: 'Shekinah, ir al inicio' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/u);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
});

test('gestiona el catálogo con inventario Dux de solo lectura, disponibilidad e imagen', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await installStatefulAdminApi(page, [
    product('aceite-inicial-e2e', 'Aceite inicial E2E', {
      categoryName: 'Aceites',
      categorySlug: 'aceites',
      price: 1_500,
      sku: 'ACE-E2E-1',
      duxStock: { real: 4, reserved: 0, available: 4 },
    }),
    product('producto-pausado-e2e', 'Producto pausado E2E', {
      availability: 'unavailable',
      categoryName: 'Agroecologicos',
      categorySlug: 'agroecologicos',
      price: 2_000,
    }),
  ]);

  await page.goto('/admin');
  await loginWithFixture(page);
  await expect(page.getByRole('heading', { level: 4, name: 'Aceite inicial E2E' })).toBeVisible();
  await page.getByRole('button', { name: 'Pausar Aceite inicial E2E' }).click();
  await expect(page.getByText('Aceite inicial E2E quedó pausado manualmente.')).toBeVisible();
  expect(requiredProduct(api.products(), 'aceite-inicial-e2e').availability).toBe('unavailable');
  await page.getByRole('button', { name: 'Reactivar Aceite inicial E2E' }).click();
  await expect(page.getByText('Aceite inicial E2E quedó disponible para venta.')).toBeVisible();
  expect(requiredProduct(api.products(), 'aceite-inicial-e2e').availability).toBe('available');

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('ace-e2e-1');
  await page.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('aceites');
  await page.getByRole('combobox', { name: 'Disponibilidad', exact: true }).selectOption('available');
  await page.getByRole('combobox', { name: 'Stock', exact: true }).selectOption('in-stock');
  await expect(page.getByText('1 producto encontrado')).toBeVisible();
  await expect(page.getByRole('heading', { level: 4, name: 'Aceite inicial E2E' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 4, name: 'Producto pausado E2E' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Catálogo' }).first().click();
  await expect(page).toHaveURL(/\/catalogo$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/u);
  await page.getByRole('button', { name: 'Productos' }).click();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('ace-e2e-1');

  await page.getByRole('button', { name: 'Editar Aceite inicial E2E' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Editar Aceite inicial E2E' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Precio en pesos' }).fill('1750.25');
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Hay cambios de producto sin guardar');
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Shekinah, ir al inicio' }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole('alert')).toHaveText(
    'Los cambios siguen sin guardar. Permanecés en Administración.',
  );
  await expect(page.getByRole('spinbutton', { name: 'Precio en pesos' })).toHaveValue('1750.25');
  const forwardDialogPromise = page.waitForEvent('dialog');
  await page.evaluate(() => window.history.forward());
  const forwardDialog = await forwardDialogPromise;
  expect(forwardDialog.message()).toContain('Hay cambios de producto sin guardar');
  await forwardDialog.dismiss();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole('spinbutton', { name: 'Precio en pesos' })).toHaveValue('1750.25');
  await page.getByRole('button', { name: 'Resumen' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Resumen operativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Productos' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Precio en pesos' })).toHaveValue('1750.25');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible();
  await expect(page.getByText('Los cambios siguen sin guardar. Permanecés en Administración.'))
    .toHaveCount(0);
  expect(requiredProduct(api.products(), 'aceite-inicial-e2e').price.amount).toBe(1_750.25);

  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Nuevo producto' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nombre' }).fill(TECHNICAL_PRODUCT_NAME);
  await expect(page.getByText(`Dirección pública: /${TECHNICAL_PRODUCT_ID}/`)).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Precio en pesos' }).fill('9876.54');
  await page.getByRole('checkbox', { name: 'Aceites', exact: true }).check();
  await expect(page.getByText(/Inventario: Dux\. Shekinah no guarda ni permite editar stock/u))
    .toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Stock físico' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /Disponible manualmente para venta/u }).uncheck();
  await expect(page.getByText(/Estado efectivo: No disponible manualmente/u)).toBeVisible();

  await page.getByLabel('Seleccionar imagen').setInputFiles({
    name: 'producto-tecnico.png',
    mimeType: 'image/png',
    buffer: TECHNICAL_PNG,
  });
  await expect(page.getByText(/producto-tecnico\.png/u)).toBeVisible();
  const preview = page.getByRole('img', {
    name: `Vista previa de ${TECHNICAL_PRODUCT_NAME}`,
  });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((element) => (
    element as HTMLImageElement
  ).naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText('Producto creado correctamente.')).toBeVisible();
  await expect(page.getByRole('heading', {
    level: 3,
    name: `Editar ${TECHNICAL_PRODUCT_NAME}`,
  })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Buscar' }).fill(TECHNICAL_PRODUCT_NAME);
  const createdRow = page.getByRole('article', { name: TECHNICAL_PRODUCT_NAME });
  await expect(createdRow).toBeVisible();
  await expect(createdRow.getByText('No disponible manualmente')).toBeVisible();
  await expect(createdRow.getByRole('img', { name: TECHNICAL_PRODUCT_NAME })).toHaveAttribute(
    'src',
    MANAGED_IMAGE_PATH,
  );
  expect(requiredProduct(api.products(), TECHNICAL_PRODUCT_ID)).toMatchObject({
    availability: 'unavailable',
    price: { amount: 9_876.54, currency: 'ARS' },
  });
  expect(Object.hasOwn(requiredProduct(api.products(), TECHNICAL_PRODUCT_ID), 'stockQuantity'))
    .toBe(false);

  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await page.getByRole('button', { name: `Editar ${TECHNICAL_PRODUCT_NAME}` }).click();
  await page.getByRole('checkbox', { name: /Disponible manualmente para venta/u }).check();
  await page.getByRole('spinbutton', { name: 'Precio en pesos' }).fill('9999');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible();

  // La recarga fuerza una nueva lectura GET del estado simulado y comprueba persistencia.
  await page.reload();
  await page.getByRole('button', { name: 'Productos' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Catálogo de productos' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill(TECHNICAL_PRODUCT_ID);
  const persistedRow = page.getByRole('article', { name: TECHNICAL_PRODUCT_NAME });
  await expect(persistedRow).toBeVisible();
  await expect(persistedRow.getByText('Disponible manualmente')).toBeVisible();
  await expect(persistedRow).toContainText('Sin snapshot Dux verificable · venta bloqueada');
  await expect(persistedRow.getByRole('img', { name: TECHNICAL_PRODUCT_NAME })).toHaveAttribute(
    'src',
    MANAGED_IMAGE_PATH,
  );
  await page.getByRole('button', { name: `Editar ${TECHNICAL_PRODUCT_NAME}` }).click();
  await expect(page.getByRole('spinbutton', { name: 'Precio en pesos' })).toHaveValue('9999');
  await expect(page.getByRole('spinbutton', { name: 'Stock físico' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', {
    name: /Disponible manualmente para venta/u,
  })).toBeChecked();

  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await page.getByRole('button', {
    name: `Quitar ${TECHNICAL_PRODUCT_NAME} del catálogo`,
  }).click();
  await expect(page.getByRole('dialog', {
    name: `¿Quitar ${TECHNICAL_PRODUCT_NAME}?`,
  })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(page.getByText(`${TECHNICAL_PRODUCT_NAME} fue quitado del catálogo público.`)).toBeVisible();
  await expect(page.getByRole('article', { name: TECHNICAL_PRODUCT_NAME })).toHaveCount(0);
  await expect(page.getByText('0 productos encontrados')).toBeVisible();
  expect(api.products().some(({ id }) => id === TECHNICAL_PRODUCT_ID)).toBe(false);

  expect(api.requests.some(({ method, pathname }) => (
    method === 'POST' && pathname === '/api/admin/products'
  ))).toBe(true);
  expect(api.requests.some(({ method, pathname }) => (
    method === 'PUT' && pathname === `/api/admin/products/${TECHNICAL_PRODUCT_ID}/image`
  ))).toBe(true);
  expect(api.requests.some(({ method, pathname }) => (
    method === 'DELETE' && pathname === `/api/admin/products/${TECHNICAL_PRODUCT_ID}`
  ))).toBe(true);
});

test('abre bajo demanda un detalle completo de pedido sin controles financieros', async ({ page }) => {
  const orderId = 'ord_e2e_123456789012345678901234';
  await installStatefulAdminApi(page, []);
  await page.route('**/api/admin/orders/*', async (route) => {
    await json(route, orderDetailFixture(orderId));
  });
  await page.route('**/api/admin/orders?*', async (route) => {
    await json(route, {
      rows: [{
        id: orderId,
        channel: 'checkout_pro',
        status: 'approved',
        currency: 'ARS',
        total_minor: 12_500,
        item_count: 2,
        delivery_method: 'correo_argentino',
        full_name: 'Cliente E2E',
        created_at: '2026-08-10T12:00:00.000Z',
      }],
    });
  });

  await page.goto('/admin');
  await loginWithFixture(page, 'summary');
  await page.getByRole('button', { name: 'Pedidos' }).click();
  await expect(page.getByRole('table', {
    name: 'Pedidos del período y pedidos de WhatsApp pendientes',
  })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Detalle de/u })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('heading', { name: `Detalle de ${formatOrderNumber(orderId)}` })).toBeFocused();
  await expect(page.getByRole('table', { name: 'Items del pedido' })).toContainText('Producto E2E');
  await expect(page.getByRole('table', { name: 'Pagos reportados por el proveedor' })).toContainText('Mercado Pago');
  await expect(page.getByText(/Sólo los pedidos de WhatsApp pendientes admiten aprobación o rechazo/u)).toBeVisible();
  await expect(page.getByRole('button', { name: /aprobar|rechazar|cambiar estado/i })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoGlobalHorizontalOverflow(page);
  await expect(page.getByRole('button', { name: 'Cerrar detalle' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await expect(page.getByRole('heading', { name: `Detalle de ${formatOrderNumber(orderId)}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver detalle' })).toBeFocused();
});

test('concilia Checkout Pro y hace visible que un reintegro no repone stock', async ({ page }) => {
  const orderId = 'ord_checkout_reconcile_e2e_1234567890';
  const pending = orderDetailFixture(orderId);
  pending.order.status = 'pending';
  pending.order.approved_at = null;
  pending.order.stock_consumed_at = null;
  pending.order.stock_reservation_state = 'reserved';
  pending.payments = [];
  const api = await installStatefulAdminApi(page, [], { orders: [pending] });

  await page.goto('/admin');
  await loginWithFixture(page, 'summary');
  await page.getByRole('button', { name: 'Pedidos' }).click();
  await page.getByRole('button', { name: 'Ver detalle' }).click();

  await expect(page.getByText('Reservado')).toBeVisible();
  await page.getByRole('button', { name: 'Conciliar con Mercado Pago' }).click();
  await expect(page.locator('.admin-feedback-success')).toContainText('1 pago verificado');
  await expect(page.getByText(/El reintegro no repone stock automáticamente/u)).toBeVisible();
  expect(api.requests.filter(({ method, pathname }) => (
    method === 'POST' && pathname === `/api/admin/orders/${orderId}/reconcile`
  ))).toHaveLength(1);
});

test('prioriza la reserva WhatsApp pendiente y la aprueba una sola vez', async ({ page }) => {
  const orderId = 'ord_whatsapp_pending_approve_e2e';
  const api = await installStatefulAdminApi(page, [
    product('producto-reservado-e2e', 'Producto reservado E2E', {
      categoryName: 'Aceites',
      categorySlug: 'aceites',
      price: 5_000,
      duxStock: { real: 5, reserved: 2, available: 3 },
    }),
  ], {
    // El orden de entrada es deliberado: el mock debe priorizar el pendiente WhatsApp.
    orders: [
      orderDetailFixture('ord_checkout_approved_older_e2e'),
      whatsappOrderDetailFixture(orderId),
    ],
    deferOrderAction: true,
  });

  await page.goto('/admin');
  await loginWithFixture(page, 'summary');
  await page.getByRole('button', { name: 'Pedidos' }).click();

  const table = page.getByRole('table', {
    name: 'Pedidos del período y pedidos de WhatsApp pendientes',
  });
  const firstOrderRow = table.locator('tbody tr').first();
  await expect(firstOrderRow).toContainText(formatOrderNumber(orderId));
  await expect(firstOrderRow).toContainText('WhatsApp');
  await expect(firstOrderRow).toContainText('Pendiente');
  await firstOrderRow.getByRole('button', { name: 'Ver detalle' }).click();

  await expect(page.getByRole('heading', { name: `Detalle de ${formatOrderNumber(orderId)}` })).toBeFocused();
  const reservedItems = page.getByRole('table', { name: 'Productos y unidades reservadas' });
  await expect(reservedItems).toContainText('Producto reservado E2E');
  await expect(reservedItems).toContainText('2');
  await expect(page.getByText(/Aprobar consume la reserva y descuenta el stock físico/u)).toBeVisible();

  await page.getByRole('button', { name: 'Aprobar' }).click();
  const approvingButton = page.getByRole('button', { name: 'Aprobando…' });
  await expect(approvingButton).toBeVisible();
  await expect(approvingButton).toBeDisabled();
  expect(actionRequests(api.requests, orderId, 'approve')).toHaveLength(1);

  api.releaseOrderAction();
  await expect(page.locator('.admin-feedback-success')).toContainText('Pedido aprobado');
  await expect(page.getByRole('button', { name: /Aprobar|Rechazar/u })).toHaveCount(0);
  expect(actionRequests(api.requests, orderId, 'approve')).toHaveLength(1);
  expect(requiredProduct(api.products(), 'producto-reservado-e2e')).toMatchObject({
    commerce: { observedStock: { real: 5, reserved: 2, available: 3 } },
  });
});

test('confirma el rechazo sin mutar el snapshot autoritativo Dux', async ({ page }) => {
  const orderId = 'ord_whatsapp_pending_reject_e2e';
  const api = await installStatefulAdminApi(page, [
    product('producto-liberado-e2e', 'Producto liberado E2E', {
      categoryName: 'Aceites',
      categorySlug: 'aceites',
      price: 5_000,
      duxStock: { real: 5, reserved: 2, available: 3 },
    }),
  ], {
    orders: [whatsappOrderDetailFixture(orderId, 'producto-liberado-e2e', 'Producto liberado E2E')],
    deferOrderAction: true,
  });

  await page.goto('/admin');
  await loginWithFixture(page, 'summary');
  await page.getByRole('button', { name: 'Pedidos' }).click();
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await page.getByRole('button', { name: 'Rechazar' }).click();

  const confirmation = page.getByRole('alertdialog', { name: `Rechazar ${formatOrderNumber(orderId)}` });
  await expect(confirmation).toContainText(
    'todas sus unidades reservadas volverán a estar disponibles',
  );
  await expect(confirmation.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Rechazar pedido' }).click();
  const rejectingButton = confirmation.getByRole('button', { name: 'Rechazando…' });
  await expect(rejectingButton).toBeVisible();
  await expect(rejectingButton).toBeDisabled();
  expect(actionRequests(api.requests, orderId, 'reject')).toHaveLength(1);

  api.releaseOrderAction();
  await expect(page.locator('.admin-feedback-success')).toContainText('Pedido rechazado');
  await expect(page.getByRole('button', { name: /Aprobar|Rechazar/u })).toHaveCount(0);
  expect(actionRequests(api.requests, orderId, 'reject')).toHaveLength(1);
  expect(requiredProduct(api.products(), 'producto-liberado-e2e')).toMatchObject({
    commerce: { observedStock: { real: 5, reserved: 2, available: 3 } },
  });

  await page.getByRole('button', { name: 'Productos' }).click();
  const productRow = page.getByRole('article', { name: 'Producto liberado E2E' });
  await expect(productRow).toContainText('Stock observado: real 5 · reservado 2 · disponible 3');
});

test('ante un conflicto 409 refresca el estado autoritativo del pedido', async ({ page }) => {
  const orderId = 'ord_whatsapp_conflict_e2e';
  const api = await installStatefulAdminApi(page, [
    product('producto-conflicto-e2e', 'Producto conflicto E2E', {
      categoryName: 'Aceites',
      categorySlug: 'aceites',
      price: 5_000,
      duxStock: { real: 5, reserved: 2, available: 3 },
    }),
  ], {
    orders: [whatsappOrderDetailFixture(orderId, 'producto-conflicto-e2e', 'Producto conflicto E2E')],
    conflictOnOrderAction: { orderId, authoritativeStatus: 'rejected' },
  });

  await page.goto('/admin');
  await loginWithFixture(page, 'summary');
  await page.getByRole('button', { name: 'Pedidos' }).click();
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();

  await expect(page.getByRole('alert')).toContainText('El pedido ya fue resuelto por otra persona.');
  await expect(page.locator('.admin-order-detail')).toContainText('Rechazado');
  await expect(page.getByRole('button', { name: /Aprobar|Rechazar/u })).toHaveCount(0);
  expect(actionRequests(api.requests, orderId, 'approve')).toHaveLength(1);
  expect(detailRequests(api.requests, orderId)).toHaveLength(2);
});

test('mantiene listado y editor dentro del viewport en desktop, notebook, tablet y móvil', async ({ page }, testInfo) => {
  await installStatefulAdminApi(page, [
    product('responsive-e2e', 'Producto responsive E2E', {
      categoryName: 'Aceites',
      categorySlug: 'aceites',
      price: 1_500,
      duxStock: { real: 9, reserved: 0, available: 9 },
    }),
  ]);
  await page.goto('/admin');
  await loginWithFixture(page);
  await page.getByRole('button', { name: 'Editar Producto responsive E2E' }).click();
  await page.getByRole('spinbutton', { name: 'Precio en pesos' }).fill('');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  const feedback = page.locator('.admin-feedback');
  await expect(feedback).toBeVisible();

  const viewports = [
    { width: 1_440, height: 900 },
    { width: 1_024, height: 768 },
    { width: 768, height: 1_024 },
    { width: 390, height: 844 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (process.env.ADMIN_VISUAL_REVIEW === 'true') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`admin-${viewport.width}-top.png`),
      });
    }
    const editorTitle = page.getByRole('heading', {
      level: 3,
      name: 'Editar Producto responsive E2E',
    });
    await editorTitle.scrollIntoViewIfNeeded();
    await expect(editorTitle).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
    await expectNoGlobalHorizontalOverflow(page);
    await expectHorizontallyInsideViewport(page.getByRole('button', { name: 'Guardar cambios' }), viewport.width);
    await expectHorizontallyInsideViewport(page.getByRole('button', { name: 'Cerrar editor' }), viewport.width);
    await expect(feedback).toHaveCSS('position', viewport.width <= 700 ? 'static' : 'sticky');
    if (process.env.ADMIN_VISUAL_REVIEW === 'true') {
      await page.screenshot({
        path: testInfo.outputPath(`admin-${viewport.width}-editor.png`),
      });
    }
  }
});

async function loginWithFixture(
  page: Page,
  section: 'summary' | 'products' = 'products',
): Promise<void> {
  await page.getByRole('textbox', { name: 'Usuario' }).fill(FIXTURE_USERNAME);
  await page.getByLabel('Contraseña').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administración / Backoffice' }),
  ).toBeVisible();
  if (section === 'products') {
    await page.getByRole('button', { name: 'Productos' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Catálogo de productos' })).toBeVisible();
  }
}

async function expectNoGlobalHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(Math.max(widths.body, widths.document)).toBeLessThanOrEqual(widths.viewport + 1);
}

async function expectHorizontallyInsideViewport(
  locator: Locator,
  viewportWidth: number,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(-1);
  expect((box?.x ?? viewportWidth + 2) + (box?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth + 1,
  );
}

async function installStatefulAdminApi(
  page: Page,
  initialProducts: readonly AdminProduct[],
  options: StatefulAdminApiOptions = {},
): Promise<Readonly<{
  authenticated: () => boolean;
  orders: () => readonly MockAdminOrder[];
  products: () => readonly AdminProduct[];
  releaseOrderAction: () => void;
  requests: readonly RecordedRequest[];
}>> {
  let authenticated = false;
  let orders = structuredClone(options.orders ?? []) as MockAdminOrder[];
  let products = structuredClone(initialProducts) as AdminProduct[];
  let conflictOnOrderAction = options.conflictOnOrderAction;
  let releaseDeferredOrderAction: (() => void) | undefined;
  const deferredOrderAction = options.deferOrderAction === true
    ? new Promise<void>((resolve) => {
        releaseDeferredOrderAction = resolve;
      })
    : null;
  const requests: RecordedRequest[] = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const requestRecord: { body?: unknown; method: string; pathname: string } = {
      method,
      pathname,
    };
    if (request.headers()['content-type']?.startsWith('application/json') === true) {
      requestRecord.body = request.postDataJSON() as unknown;
    }
    requests.push(requestRecord);

    if (pathname === '/api/catalog' && method === 'GET') {
      await json(route, { products });
      return;
    }
    if (pathname.startsWith('/api/catalog-images/') && (method === 'GET' || method === 'HEAD')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        ...(method === 'HEAD' ? {} : { body: TECHNICAL_PNG }),
      });
      return;
    }
    if (pathname === '/api/admin/auth/session' && method === 'GET') {
      await json(route, authenticated
        ? {
            authenticated: true,
            identity: { label: 'Administración E2E', source: 'password' },
          }
        : { authenticated: false });
      return;
    }
    if (pathname === '/api/admin/auth/login' && method === 'POST') {
      const credentials = request.postDataJSON() as Record<string, unknown>;
      if (
        credentials.username !== FIXTURE_USERNAME ||
        credentials.password !== FIXTURE_PASSWORD
      ) {
        await json(route, { error: { code: 'INVALID_CREDENTIALS' } }, 401);
        return;
      }
      authenticated = true;
      await json(route, {
        authenticated: true,
        identity: { label: 'Administración E2E', source: 'password' },
      });
      return;
    }
    if (pathname === '/api/admin/auth/logout' && method === 'POST') {
      authenticated = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (!authenticated) {
      await json(route, { error: { code: 'ADMIN_UNAUTHORIZED' } }, 401);
      return;
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      const status = new URL(request.url()).searchParams.get('status');
      const rows = orders
        .filter(({ order }) => status === null || order.status === status)
        .slice()
        .sort((left, right) => {
          const pendingPriority = orderPriority(left) - orderPriority(right);
          return pendingPriority === 0
            ? right.order.created_at.localeCompare(left.order.created_at)
            : pendingPriority;
        })
        .map(({ order }) => order);
      await json(route, { rows });
      return;
    }

    const reconcileMatch = /^\/api\/admin\/orders\/([^/]+)\/reconcile$/u.exec(pathname);
    if (reconcileMatch !== null && method === 'POST') {
      const orderId = decodeURIComponent(reconcileMatch[1] ?? '');
      const current = orders.find(({ order }) => order.id === orderId);
      if (current?.order.channel !== 'checkout_pro') {
        await json(route, { error: { code: 'ORDER_CHANNEL_CONFLICT' } }, 409);
        return;
      }
      const reconciledAt = '2026-08-22T20:00:00.000Z';
      const updated: MockAdminOrder = {
        ...current,
        order: {
          ...current.order,
          status: 'refunded',
          updated_at: reconciledAt,
          stock_consumed_at: reconciledAt,
          stock_reservation_state: 'consumed',
        },
        payments: [{
          provider: 'mercadopago',
          provider_payment_id: 'payment-reconciled-e2e',
          mapped_status: 'refunded',
          provider_status: 'refunded',
          status_detail: 'refunded',
          amount_minor: current.order.total_minor,
          currency: current.order.currency,
          approved_at: reconciledAt,
          provider_updated_at: reconciledAt,
          updated_at: reconciledAt,
        }],
      };
      orders = orders.map((candidate) => candidate.order.id === orderId ? updated : candidate);
      await json(route, { ...updated, reconciliation: { checkedPayments: 1 } });
      return;
    }

    const orderActionMatch = /^\/api\/admin\/orders\/([^/]+)\/(approve|reject)$/u.exec(pathname);
    if (orderActionMatch !== null && method === 'POST') {
      const orderId = decodeURIComponent(orderActionMatch[1] ?? '');
      const requestedStatus = orderActionMatch[2] === 'approve' ? 'approved' : 'rejected';
      if (deferredOrderAction !== null) await deferredOrderAction;
      if (conflictOnOrderAction?.orderId === orderId) {
        const resolved = resolveMockOrder(
          orders,
          products,
          orderId,
          conflictOnOrderAction.authoritativeStatus,
        );
        orders = resolved.orders;
        products = resolved.products;
        conflictOnOrderAction = undefined;
        await json(route, {
          error: {
            code: 'ORDER_STATE_CONFLICT',
            message: 'El pedido ya fue resuelto por otra persona.',
          },
        }, 409);
        return;
      }
      const current = orders.find(({ order }) => order.id === orderId);
      if (current?.order.channel !== 'whatsapp' || current.order.status !== 'pending') {
        await json(route, {
          error: {
            code: 'ORDER_STATE_CONFLICT',
            message: 'El pedido ya no está pendiente.',
          },
        }, 409);
        return;
      }
      const resolved = resolveMockOrder(orders, products, orderId, requestedStatus);
      orders = resolved.orders;
      products = resolved.products;
      await json(route, { ...requiredMockOrder(orders, orderId), changed: true });
      return;
    }

    const orderDetailMatch = /^\/api\/admin\/orders\/([^/]+)$/u.exec(pathname);
    if (orderDetailMatch !== null && method === 'GET') {
      const orderId = decodeURIComponent(orderDetailMatch[1] ?? '');
      const detail = orders.find(({ order }) => order.id === orderId);
      if (detail === undefined) {
        await json(route, { error: { code: 'ORDER_NOT_FOUND' } }, 404);
        return;
      }
      await json(route, detail);
      return;
    }

    if (pathname === '/api/admin/products' && method === 'GET') {
      await json(route, { imageStorageConfigured: true, products });
      return;
    }
    if (pathname === '/api/admin/products' && method === 'POST') {
      const created = request.postDataJSON() as AdminProduct;
      if (products.some(({ id }) => id === created.id)) {
        await json(route, { error: { message: 'El producto ya existe.' } }, 409);
        return;
      }
      products = [...products, structuredClone(created)];
      await json(route, { product: created }, 201);
      return;
    }

    const imageMatch = /^\/api\/admin\/products\/([^/]+)\/image$/u.exec(pathname);
    if (imageMatch !== null && method === 'PUT') {
      const id = decodeURIComponent(imageMatch[1] ?? '');
      const current = requiredProduct(products, id);
      const imageBody = request.postDataBuffer();
      if (
        request.headers()['content-type'] !== 'image/png' ||
        imageBody === null ||
        !imageBody.equals(TECHNICAL_PNG)
      ) {
        await json(route, { error: { message: 'Imagen inválida.' } }, 422);
        return;
      }
      const image = { src: MANAGED_IMAGE_PATH, alt: current.name };
      const updated = { ...current, images: [image], primaryImage: image };
      products = replaceProduct(products, updated);
      await json(route, { product: updated });
      return;
    }
    if (imageMatch !== null && method === 'DELETE') {
      const id = decodeURIComponent(imageMatch[1] ?? '');
      const current = requiredProduct(products, id);
      const updated = { ...current, images: [] };
      delete updated.primaryImage;
      products = replaceProduct(products, updated);
      await json(route, { product: updated });
      return;
    }

    const productMatch = /^\/api\/admin\/products\/([^/]+)$/u.exec(pathname);
    if (productMatch !== null) {
      const id = decodeURIComponent(productMatch[1] ?? '');
      if (method === 'GET') {
        await json(route, { product: requiredProduct(products, id) });
        return;
      }
      if (method === 'PUT') {
        const updated = request.postDataJSON() as AdminProduct;
        products = replaceProduct(products, structuredClone(updated));
        await json(route, { product: updated });
        return;
      }
      if (method === 'PATCH') {
        const patch = request.postDataJSON() as {
          availability?: 'available' | 'unavailable';
        };
        const updated = { ...requiredProduct(products, id) };
        if (patch.availability !== undefined) updated.availability = patch.availability;
        products = replaceProduct(products, updated);
        await json(route, { product: updated });
        return;
      }
      if (method === 'DELETE') {
        products = products.filter((productValue) => productValue.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
    }

    await fulfillProtectedReadOnlyRoute(route, pathname);
  });

  return Object.freeze({
    authenticated: () => authenticated,
    orders: () => orders,
    products: () => products,
    releaseOrderAction: () => {
      if (releaseDeferredOrderAction === undefined) {
        throw new Error('No hay una acción de pedido diferida para liberar.');
      }
      const release = releaseDeferredOrderAction;
      releaseDeferredOrderAction = undefined;
      release();
    },
    requests,
  });
}

async function fulfillProtectedReadOnlyRoute(route: Route, pathname: string): Promise<void> {
  if (pathname === '/api/admin/summary') {
    await json(route, adminSummary());
    return;
  }
  if (pathname === '/api/admin/orders' || pathname === '/api/admin/audit') {
    await json(route, { rows: [] });
    return;
  }
  if (pathname.startsWith('/api/admin/analytics/')) {
    await json(route, []);
    return;
  }
  await json(route, { error: { code: 'NOT_FOUND' } }, 404);
}

function adminSummary() {
  return {
    order_count: 0,
    approved_revenue_minor: 0,
    approved_count: 0,
    approved_payment_count: 0,
    preference_pending_count: 0,
    pending_count: 0,
    rejected_count: 0,
    cancelled_count: 0,
    refunded_count: 0,
    failed_count: 0,
    average_ticket_minor: 0,
    consented_session_count: 0,
    page_view_count: 0,
    page_view_session_count: 0,
    product_view_session_count: 0,
    cart_add_session_count: 0,
    manual_payment_click_count: 0,
    manual_payment_click_session_count: 0,
    whatsapp_open_count: 0,
    whatsapp_open_session_count: 0,
  };
}

function orderDetailFixture(orderId: string): MockAdminOrder {
  return {
    order: {
      id: orderId,
      channel: 'checkout_pro',
      status: 'approved',
      currency: 'ARS',
      total_minor: 12_500,
      products_total_minor: 10_000,
      shipping_minor: 2_500,
      item_count: 2,
      created_at: '2026-08-10T12:00:00.000Z',
      updated_at: '2026-08-10T12:05:00.000Z',
      approved_at: '2026-08-10T12:05:00.000Z',
      resolved_at: null,
      resolved_by: null,
      last_error_code: null,
      mp_preference_id: 'preference-e2e',
      stock_reserved_at: '2026-08-10T12:00:00.000Z',
      stock_reservation_expires_at: '2026-08-10T12:30:00.000Z',
      stock_consumed_at: '2026-08-10T12:05:00.000Z',
      stock_reservation_state: 'consumed',
      delivery_method: 'correo_argentino',
      full_name: 'Cliente E2E',
      phone: '5491100000000',
      address: 'Calle E2E 123',
      locality: 'Mar del Plata',
      province: 'Buenos Aires',
      postal_code: 'B7600',
      total_weight_grams: 500,
    },
    items: [{
      product_id: 'producto-e2e',
      name: 'Producto E2E',
      presentation: '100 g',
      sku: 'SKU-E2E',
      quantity: 2,
      unit_price_minor: 5_000,
      subtotal_minor: 10_000,
      stock_controlled: 1,
    }],
    payments: [{
      provider: 'mercadopago',
      provider_payment_id: 'payment-e2e',
      mapped_status: 'approved',
      provider_status: 'approved',
      status_detail: 'accredited',
      amount_minor: 12_500,
      currency: 'ARS',
      approved_at: '2026-08-10T12:05:00.000Z',
      provider_updated_at: '2026-08-10T12:05:00.000Z',
      updated_at: '2026-08-10T12:05:00.000Z',
    }],
  };
}

function whatsappOrderDetailFixture(
  orderId: string,
  productId = 'producto-reservado-e2e',
  productName = 'Producto reservado E2E',
): MockAdminOrder {
  return {
    order: {
      id: orderId,
      channel: 'whatsapp',
      status: 'pending',
      currency: 'ARS',
      total_minor: 10_000,
      products_total_minor: 10_000,
      shipping_minor: 0,
      item_count: 2,
      created_at: '2026-08-12T12:00:00.000Z',
      updated_at: '2026-08-12T12:00:00.000Z',
      approved_at: null,
      resolved_at: null,
      resolved_by: null,
      last_error_code: null,
      mp_preference_id: null,
      stock_reserved_at: null,
      stock_reservation_expires_at: null,
      stock_consumed_at: null,
      stock_reservation_state: 'reserved',
      delivery_method: 'coordinated_pickup',
      full_name: 'Cliente WhatsApp E2E',
      phone: '5491100000001',
      address: 'Calle WhatsApp 123',
      locality: 'Mar del Plata',
      province: 'Buenos Aires',
      postal_code: 'B7600',
      total_weight_grams: 200,
    },
    items: [{
      product_id: productId,
      name: productName,
      presentation: '100 g',
      sku: 'WA-E2E',
      quantity: 2,
      unit_price_minor: 5_000,
      subtotal_minor: 10_000,
      stock_controlled: 1,
    }],
    payments: [],
  };
}

function product(
  id: string,
  name: string,
  options: Readonly<{
    availability?: 'available' | 'unavailable';
    categoryName: string;
    categorySlug: string;
    price: number;
    sku?: string;
    duxStock?: Readonly<{ real: number; reserved: number; available: number }>;
  }>,
): AdminProduct {
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name,
    categorySlugs: [options.categorySlug],
    categoryNames: [options.categoryName],
    presentation: '100 ml',
    price: { amount: options.price, currency: 'ARS' },
    ...(options.sku === undefined ? {} : { sku: options.sku }),
    availability: options.availability ?? 'available',
    ...(options.duxStock === undefined ? {} : {
      commerce: {
        source: 'dux' as const,
        catalogVersion: 'd'.repeat(64),
        syncedAt: '2026-09-01T12:00:00.000Z',
        availabilityState: options.duxStock.available > 0
          ? 'verified' as const
          : 'out_of_stock' as const,
        checkoutEligible: options.duxStock.available > 0,
        mappingStatus: 'mapped' as const,
        quantitySemanticsStatus: 'verified' as const,
        observedStock: { ...options.duxStock },
      },
    }),
    images: [],
    variants: [],
  };
}

function requiredProduct(products: readonly AdminProduct[], id: string): AdminProduct {
  const value = products.find((candidate) => candidate.id === id);
  if (value === undefined) throw new Error(`No existe el producto E2E ${id}.`);
  return value;
}

function replaceProduct(
  products: readonly AdminProduct[],
  updated: AdminProduct,
): AdminProduct[] {
  return products.map((candidate) => candidate.id === updated.id ? updated : candidate);
}

function orderPriority({ order }: MockAdminOrder): number {
  return order.channel === 'whatsapp' && order.status === 'pending' ? 0 : 1;
}

function requiredMockOrder(orders: readonly MockAdminOrder[], id: string): MockAdminOrder {
  const value = orders.find(({ order }) => order.id === id);
  if (value === undefined) throw new Error(`No existe el pedido E2E ${id}.`);
  return value;
}

function resolveMockOrder(
  orders: readonly MockAdminOrder[],
  products: readonly AdminProduct[],
  id: string,
  status: 'approved' | 'rejected',
): Readonly<{ orders: MockAdminOrder[]; products: AdminProduct[] }> {
  const current = requiredMockOrder(orders, id);
  const resolvedAt = '2026-08-12T12:05:00.000Z';
  const nextOrder: MockAdminOrder = {
    ...current,
    order: {
      ...current.order,
      status,
      updated_at: resolvedAt,
      resolved_at: resolvedAt,
      resolved_by: 'Administración E2E',
      approved_at: status === 'approved' ? resolvedAt : current.order.approved_at,
    },
  };
  return Object.freeze({
    orders: orders.map((candidate) => candidate.order.id === id ? nextOrder : candidate),
    products: [...products],
  });
}

function actionRequests(
  requests: readonly RecordedRequest[],
  orderId: string,
  action: 'approve' | 'reject',
): readonly RecordedRequest[] {
  return requests.filter(({ method, pathname }) => (
    method === 'POST' && pathname === `/api/admin/orders/${orderId}/${action}`
  ));
}

function detailRequests(
  requests: readonly RecordedRequest[],
  orderId: string,
): readonly RecordedRequest[] {
  return requests.filter(({ method, pathname }) => (
    method === 'GET' && pathname === `/api/admin/orders/${orderId}`
  ));
}

async function json(route: Route, value: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
}
