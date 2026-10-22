import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { MarketingCampaign, MarketingCampaignInput } from '../../src/commerce/marketing-contracts';
import { duxApiFixture } from '../../src/test/dux-api-fixture';

const product = {
  id: 'producto-marketing-e2e', slug: 'producto-marketing-e2e', path: '/producto-marketing-e2e/', name: 'Producto de prueba local',
  categorySlugs: ['rubro-prueba'], categoryNames: ['Rubro de prueba'], sku: '00123', priceStatus: 'usable', price: { amount: 1000, currency: 'ARS' },
  availability: 'available', images: [], variants: [],
  commerce: { source: 'dux', catalogVersion: 'd'.repeat(64), syncedAt: '2026-10-22T12:00:00.000Z', availabilityState: 'verified', checkoutEligible: true,
    mappingStatus: 'mapped', quantitySemanticsStatus: 'verified', observedStock: { real: 20, reserved: 0, available: 20 } },
};
function campaign(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return { id: 'mkt_0000000000000001', type: 'announcement', code: null, title: 'Novedad de prueba local', body: 'Texto autorizado para la vista previa local.',
    ctaLabel: 'Explorar productos', href: '/catalogo', placement: 'announcement', priority: 0, enabled: true, startsAt: null, endsAt: null,
    percentOff: null, minSubtotalMinor: 0, maxDiscountMinor: null, productCodes: [], maxRedemptions: null, redemptionCount: 0,
    updatedAt: '2026-10-22T12:00:00.000Z', ...overrides };
}
async function json(route: Route, value: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }); }

async function mockStore(page: Page) {
  let campaigns: MarketingCampaign[] = [campaign()];
  const writes: Array<MarketingCampaignInput & { id?: string }> = [];
  await page.addInitScript(() => {
    window.localStorage.clear(); window.sessionStorage.clear();
    window.localStorage.setItem('shekinah.analytics-consent.v1', 'rejected');
  });
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/catalog') return json(route, duxApiFixture({ products: [product] }));
    if (path === '/api/admin/auth/session') return json(route, { authenticated: true, identity: { label: 'Administración E2E local', source: 'password' } });
    if (path === '/api/admin/products') return json(route, { products: [], categories: [], manualCatalogRetired: true, imageStorageConfigured: false });
    if (path === '/api/admin/marketing') {
      if (request.method() === 'GET') return json(route, { campaigns });
      const input = request.postDataJSON() as MarketingCampaignInput & { id?: string };
      writes.push(input);
      const saved = campaign({ ...input, id: input.id ?? `mkt_000000000000000${campaigns.length + 1}` });
      campaigns = [saved, ...campaigns.filter(entry => entry.id !== saved.id)];
      return json(route, { campaign: saved }, request.method() === 'POST' ? 201 : 200);
    }
    if (path === '/api/marketing' && request.method() === 'GET') return json(route, {
      announcements: campaigns.filter(entry => entry.type === 'announcement' && entry.enabled),
      promotions: [campaign({ id: 'mkt_0000000000000099', type: 'automatic', title: 'Promoción automática de prueba', body: '', percentOff: 10,
        placement: 'home', maxDiscountMinor: 50000, minSubtotalMinor: 50000, productCodes: ['00123'], href: '', ctaLabel: '' })],
    });
    if (path === '/api/marketing' && request.method() === 'POST') {
      const input = request.postDataJSON() as { items: Array<{ quantity: number }>; couponCode?: string };
      const quantity = input.items[0]?.quantity ?? 1; const discount = input.couponCode === 'PRUEBA20' ? 20000 : 10000;
      return json(route, { quote: { campaignId: input.couponCode ? 'mkt_0000000000000088' : 'mkt_0000000000000099', title: input.couponCode ? 'Cupón local de prueba' : 'Promoción automática de prueba',
        couponCode: input.couponCode ?? null, subtotalMinor: quantity * 100000, discountMinor: quantity * discount, totalMinor: quantity * (100000 - discount),
        lines: [{ productId: product.id, code: product.sku, quantity, baseUnitPriceMinor: 100000, unitPriceMinor: 100000 - discount, discountMinor: quantity * discount }] } });
    }
    if (path === '/api/orders/request-capability') return json(route, { enabled: true });
    if (path === '/api/admin/mercadolibre/editorial/status') return json(route, { enabled: false, configured: false, connection: { connected: false }, latest: null });
    if (path === '/api/admin/dux/status') return json(route, { enabled: false, lifecycleReady: false, unitSemanticsReady: false, tenant: null, latestRun: null,
      counts: { inventoryCount: 0, mappedCount: 0, unmappedCount: 0, ambiguousCount: 0, staleCount: 0, errorCount: 0, absentCount: 0, checkoutEligibleCount: 0 }, maxAgeSeconds: 900, blockers: [] });
    if (path === '/api/admin/summary') return json(route, {});
    return json(route, {});
  });
  return { writes };
}

async function openSection(page: Page, label: string) {
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Secciones administrativas' }).getByRole('button', { name: label, exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`Marketing ${width}px: formulario accesible, alta y edición sin desbordes`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const api = await mockStore(page); await page.setViewportSize({ width, height: 900 }); await page.goto('/admin');
    await openSection(page, 'Marketing');
    await expect(page.getByRole('heading', { name: 'Marketing', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Nueva campaña', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nueva campaña', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Guardar campaña', exact: true }).click();
    await expect(page.getByLabel('Título', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Título', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Título', { exact: true }).fill('Cupón sólo para la prueba local');
    await page.getByLabel('Código del cupón').fill('PRUEBA20'); await page.getByLabel('Descuento (%)').fill('20');
    await page.getByLabel('Compra mínima (ARS)').fill('500'); await page.getByLabel('Tope de descuento (ARS)').fill('250');
    await page.getByLabel('SKU Dux participantes').fill('00123'); await page.getByLabel('Límite total de usos').fill('12');
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`marketing-editor-viewport-${width}.png`) });
    await page.screenshot({ path: testInfo.outputPath(`marketing-editor-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Guardar campaña', exact: true }).click();
    await expect(page.getByText('Borrador guardado. Podés activarlo cuando esté listo.')).toBeVisible();
    expect(api.writes).toHaveLength(1); expect(api.writes[0]).toMatchObject({ type: 'coupon', code: 'PRUEBA20', enabled: false, productCodes: ['00123'], minSubtotalMinor: 50000, maxDiscountMinor: 25000 });
    await page.getByRole('button', { name: 'Cerrar editor', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Novedad de prueba local', exact: true }).click();
    await page.getByLabel('Texto del anuncio').fill('Texto modificado en el entorno local.\nSegunda línea del anuncio.');
    await page.getByRole('button', { name: 'Guardar campaña', exact: true }).click();
    await expect(page.getByText('Campaña guardada y habilitada según su vigencia.')).toBeVisible();
    expect(api.writes[1]).toMatchObject({ id: 'mkt_0000000000000001', type: 'announcement', body: 'Texto modificado en el entorno local.\nSegunda línea del anuncio.' });
    await noOverflow(page); expect(errors).toEqual([]);
  });

  test(`Tienda ${width}px: anuncios, condiciones y cupón en resumen`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await mockStore(page); await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Anuncios de la tienda' })).toContainText('Novedad de prueba local');
    const home = page.getByRole('complementary', { name: 'Novedades y promociones' });
    await expect(home).toContainText('Sólo para retiro coordinado.'); await expect(home).toContainText('compra total mínima');
    await noOverflow(page); await page.screenshot({ path: testInfo.outputPath(`marketing-home-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Explorar productos' }).click(); await expect(page).toHaveURL(/\/catalogo$/u);
    await page.locator('[data-product]').first().getByRole('button', { name: /Agregar .* al carrito/u }).click();
    await page.getByRole('link', { name: 'Carrito, 1 producto' }).click();
    await expect(page.getByText('Promoción automática de prueba aplicada. Los beneficios no se acumulan.')).toBeVisible();
    await page.getByLabel('¿Tenés un cupón?').fill('prueba20'); await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(page.getByText('Cupón PRUEBA20 aplicado. Los beneficios no se acumulan.')).toBeVisible();
    await expect(page.locator('.cart-discount')).toContainText('Cupón local de prueba');
    expect((await page.getByLabel('¿Tenés un cupón?').boundingBox())?.width).toBeGreaterThanOrEqual(100);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`marketing-cart-viewport-${width}.png`) });
    await noOverflow(page); await page.screenshot({ path: testInfo.outputPath(`marketing-cart-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Quitar cupón' }).click();
    await expect(page.getByText('Promoción automática de prueba aplicada. Los beneficios no se acumulan.')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
