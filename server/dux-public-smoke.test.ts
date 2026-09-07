import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const harness = `
  import { verifyPublicDuxCatalog } from './scripts/verify-dux-public-catalog.mjs';
  const scenario = process.env.PUBLIC_SMOKE_SCENARIO;
  const version = 'a'.repeat(64);
  const products = ['usable', 'placeholder', 'missing_or_zero', 'invalid'].map((status, index) => ({
    id: 'dux-product-' + index, slug: 'dux-product-' + index, path: '/dux-product-' + index + '/',
    sku: String(index + 1), name: 'Producto ' + index, priceStatus: status,
    price: status === 'usable' ? { amount: 350, currency: 'ARS' } : null,
    categorySlugs: ['dux-category'], categoryNames: ['Categoría Dux'],
    commerce: { source: 'dux', checkoutEligible: false, catalogVersion: version,
      syncedAt: '2026-09-07T02:00:00.000Z', availabilityState: 'unavailable',
      mappingStatus: 'unmapped', quantitySemanticsStatus: 'unavailable_from_v2_items' },
  }));
  const catalog = { schemaVersion: 2, source: 'dux', products,
    categories: [{ slug: 'dux-category', path: '/tienda/categoria/dux-category/', name: 'Categoría Dux', productCount: 4 }] };
  if (scenario === 'sentinel') products[1].price = { amount: 1, currency: 'ARS' };
  if (scenario === 'precision') products[0].price.amount = 2.000000001;
  if (scenario === 'checkout') products[0].commerce.checkoutEligible = true;
  if (scenario === 'missing_sync') delete products[0].commerce.syncedAt;
  if (scenario === 'local_copy') products[0].presentation = 'Texto del catálogo local';
  if (scenario === 'duplicate') products[1].sku = products[0].sku;
  if (scenario === 'local') catalog.source = 'legacy-bootstrap';
  if (scenario === 'categories') catalog.categories[0].productCount = 3;
  let listReads = 0;
  const requests = [];
  const fetcher = async (url, options) => {
    if (url.origin !== 'https://shekinah.ar' || options.method !== 'GET' ||
        options.redirect !== 'error' || options.credentials !== 'omit' ||
        options.headers.authorization !== undefined) throw new Error('Unsafe public request');
    requests.push(url.pathname);
    if (scenario === 'tls') throw new Error('certificate validation failed');
    let data = catalog;
    if (url.pathname === '/api/catalog') {
      listReads++;
      if (scenario === 'changed' && listReads === 2) products[0].name = 'Changed during check';
    } else if (url.pathname.startsWith('/api/catalog/')) {
      const product = structuredClone(products.find((item) => url.pathname.endsWith('/' + item.id)));
      product.images = []; product.variants = [];
      if (scenario === 'missing_images') delete product.images;
      if (scenario === 'detail') product.name = 'Wrong detail';
      if (scenario === 'detail_id') {
        product.id = 'other-id'; product.slug = 'other-id'; product.path = '/other-id/';
      }
      data = { schemaVersion: 2, product };
    } else return new Response('<html><div id="root"></div></html>', { headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  try {
    console.log(JSON.stringify(await verifyPublicDuxCatalog({ fetcher, allDetails: true })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  console.log('REQUESTS=' + JSON.stringify(requests));
`;

function run(scenario: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', harness], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5_000,
    env: { ...process.env, PUBLIC_SMOKE_SCENARIO: scenario },
  });
}

describe('smoke público canónico de Dux', () => {
  it('comprueba todas las fichas con GET, TLS normal y sin credenciales', () => {
    const result = run('success');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"products":4');
    expect(result.stdout).toContain('"productDetailsVerified":4');
    expect(result.stdout).toContain('"allProductDetailsVerified":true');
    expect(result.stdout).toContain('"checkoutEligible":0');
    expect(result.stdout).toContain('"placeholder":1');
    expect(result.stdout).toContain('"missing_or_zero":1');
  });

  it.each([
    ['sentinel', 'precio no usable expuesto'],
    ['precision', 'precio usable inválido'],
    ['checkout', 'transaccionable'],
    ['missing_sync', 'syncedAt'],
    ['local_copy', 'presentación o descripción corta local'],
    ['missing_images', 'detalle'],
    ['duplicate', 'duplicados'],
    ['local', 'Dux v2 requerido'],
    ['categories', 'categoría pública incorrecta'],
    ['detail', 'ficha y listado discrepan'],
    ['detail_id', 'identidad de ficha distinta'],
    ['changed', 'snapshot cambió'],
    ['tls', 'certificate validation failed'],
  ])('rechaza %s sin mutaciones ni retry de Dux', (scenario, error) => {
    const result = run(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
    expect(result.stdout).not.toContain('"allProductDetailsVerified":true');
    expect(result.stdout).not.toContain('/reconcile');
    expect(result.stdout).not.toContain('/sync');
  });
});
