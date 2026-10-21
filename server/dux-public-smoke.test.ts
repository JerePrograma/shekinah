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
  if (scenario === 'stock_payload') products[0].commerce.observedStock = { real: 'PRIVATE_PUBLIC_SMOKE', reserved: 0, available: 3 };
  if (scenario === 'local_copy') products[0].presentation = 'Texto del catálogo local';
  if (scenario === 'duplicate') products[1].sku = products[0].sku;
  if (scenario === 'local') catalog.source = 'legacy-bootstrap';
  if (scenario === 'categories') catalog.categories[0].productCount = 3;
  let listReads = 0;
  const requests = [];
  const sleeps = [];
  let elapsed = 0;
  const privateValue = 'PRIVATE_PUBLIC_SMOKE https://private.invalid Authorization: Bearer PRIVATE_TOKEN';
  const fetcher = async (url, options) => {
    if (url.origin !== 'https://shekinah.ar' || options.method !== 'GET' ||
        options.redirect !== 'error' || options.credentials !== 'omit' ||
        options.headers.authorization !== undefined) throw new Error('Unsafe public request');
    requests.push(url.pathname);
    if (scenario === 'tls') throw Object.assign(new TypeError(privateValue), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: privateValue } });
    if ((scenario === 'transport_retry' && requests.length === 4) || scenario === 'transport_exhausted') {
      throw Object.assign(new TypeError(privateValue), { cause: { code: 'UND_ERR_SOCKET', address: privateValue } });
    }
    if (scenario === 'unknown_transport') throw Object.assign(new Error(privateValue), { name: privateValue, code: privateValue, cause: { code: privateValue } });
    if (scenario === 'body_retry' && requests.length === 4) {
      return new Response(new ReadableStream({ start(controller) {
        controller.error(Object.assign(new TypeError(privateValue), { code: 'ECONNRESET' }));
      } }), { headers: { 'content-type': 'application/json' } });
    }
    if (scenario === 'http_retry' && requests.length <= 2) {
      return new Response(privateValue, { status: requests.length === 1 ? 429 : 503, headers: { 'retry-after': '2' } });
    }
    if (scenario === 'http_exhausted' || scenario === 'http_permanent' || scenario === 'retry_after_long') {
      return new Response(privateValue, { status: scenario === 'http_permanent' ? 404 : 429,
        headers: { 'retry-after': scenario === 'retry_after_long' ? '120' : '0' } });
    }
    if (scenario === 'invalid_json') return new Response(privateValue, { headers: { 'content-type': 'application/json' } });
    if (scenario === 'invalid_type') return new Response(privateValue, { headers: { 'content-type': 'application/private; token=PRIVATE_TOKEN' } });
    if (scenario === 'deadline') elapsed = 12 * 60_000;
    let data = catalog;
    if (url.pathname === '/api/catalog') {
      listReads++;
      if (scenario === 'changed' && listReads === 2) products[0].name = 'Changed during check';
    } else if (url.pathname.startsWith('/api/catalog/')) {
      const product = structuredClone(products.find((item) => url.pathname.endsWith('/' + item.id)));
      product.images = []; product.variants = [];
      if (scenario === 'unsafe_image') product.images = [{ src: privateValue, alt: privateValue }];
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
    console.log(JSON.stringify(await verifyPublicDuxCatalog({ fetcher, allDetails: true,
      clock: () => elapsed, sleep: async milliseconds => { sleeps.push(milliseconds); elapsed += milliseconds; } })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  console.log('REQUESTS=' + JSON.stringify(requests));
  console.log('SLEEPS=' + JSON.stringify(sleeps));
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
    ['missing_sync', 'contrato del catálogo o producto inválido'],
    ['local_copy', 'presentación o descripción corta local'],
    ['missing_images', 'contrato del catálogo o producto inválido'],
    ['duplicate', 'duplicados'],
    ['local', 'Dux v2 requerido'],
    ['categories', 'categoría pública incorrecta'],
    ['detail', 'ficha y listado discrepan'],
    ['detail_id', 'identidad de ficha distinta'],
    ['changed', 'snapshot cambió'],
    ['tls', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
  ])('rechaza %s sin mutaciones ni retry de Dux', (scenario, error) => {
    const result = run(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
    expect(result.stdout).not.toContain('"allProductDetailsVerified":true');
    expect(result.stdout).not.toContain('/reconcile');
    expect(result.stdout).not.toContain('/sync');
  });

  it.each(['transport_retry', 'body_retry', 'http_retry'])('reintenta GETs de %s sin reiniciar el catálogo ni llamar al inventario', scenario => {
    const result = run(scenario);
    expect(result.status).toBe(0);
    const requests = readLine(result.stdout, 'REQUESTS=') as string[];
    expect(requests.every(path => path === '/' || path === '/catalogo' || path.startsWith('/api/catalog') || path.startsWith('/dux-product-'))).toBe(true);
    expect(requests.filter(path => path === '/api/catalog')).toHaveLength(scenario === 'http_retry' ? 4 : 2);
    expect(requests.filter(path => path === '/api/catalog/dux-product-0')).toHaveLength(scenario === 'http_retry' ? 1 : 2);
    expect(result.stdout).toContain('"allProductDetailsVerified":true');
    expect(readLine(result.stdout, 'SLEEPS=')).toEqual(scenario === 'http_retry' ? [2000, 2000] : [500]);
    const diagnostics = retryDiagnostics(result.stderr);
    expect(diagnostics).toHaveLength(scenario === 'http_retry' ? 2 : 1);
    expect(diagnostics[0]).toEqual(scenario === 'http_retry'
      ? { version: 1, attempt: 1, phase: 'classify_response', httpStatus: 429, errorClass: 'http_status', errorCode: null, causeCode: null }
      : { version: 1, attempt: 1, phase: scenario === 'body_retry' ? 'read_body' : 'fetch_headers',
        httpStatus: scenario === 'body_retry' ? 200 : null, errorClass: 'type_error',
        errorCode: scenario === 'body_retry' ? 'ECONNRESET' : null, causeCode: scenario === 'body_retry' ? null : 'UND_ERR_SOCKET' });
    expectSafeOutput(result);
  });

  it.each([
    ['transport_exhausted', 'PUBLIC_GET_TRANSPORT', 3],
    ['unknown_transport', 'PUBLIC_GET_TRANSPORT', 3],
    ['http_exhausted', 'PUBLIC_GET_HTTP', 3],
    ['http_permanent', 'PUBLIC_GET_HTTP', 1],
    ['retry_after_long', 'PUBLIC_GET_RETRY_DELAY_EXCEEDED', 1],
    ['tls', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 1],
    ['invalid_json', 'PUBLIC_GET_JSON_INVALID', 1],
    ['invalid_type', 'PUBLIC_GET_CONTENT_TYPE', 1],
    ['unsafe_image', 'contrato del catálogo o producto inválido', 4],
    ['stock_payload', 'contrato del catálogo o producto inválido', 1],
    ['deadline', 'PUBLIC_GET_DEADLINE', 1],
  ])('limita %s y no registra datos de red, cabeceras ni cuerpos', (scenario, code, expectedRequests) => {
    const result = run(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(code);
    expect(readLine(result.stdout, 'REQUESTS=')).toHaveLength(expectedRequests);
    expect(result.stdout).not.toContain('"allProductDetailsVerified":true');
    expectSafeOutput(result);
    if (expectedRequests === 1) expect(readLine(result.stdout, 'SLEEPS=')).toEqual([]);
  });

  it('no reintenta un payload válido sintácticamente con identidad, stock o precios incompatibles', () => {
    for (const scenario of ['sentinel', 'checkout', 'stock_payload', 'duplicate', 'detail_id', 'detail', 'changed']) {
      const result = run(scenario);
      expect(result.status).not.toBe(0);
      expect(retryDiagnostics(result.stderr)).toEqual([]);
      expect(readLine(result.stdout, 'SLEEPS=')).toEqual([]);
    }
  });
});

function readLine(stdout: string, prefix: string): unknown {
  const line = stdout.split('\n').find(value => value.startsWith(prefix));
  return line === undefined ? null : JSON.parse(line.slice(prefix.length)) as unknown;
}

function retryDiagnostics(stderr: string): unknown[] {
  return stderr.split('\n').filter(line => line.startsWith('dux_public_get_retry '))
    .map((line): unknown => JSON.parse(line.slice('dux_public_get_retry '.length)));
}

function expectSafeOutput(result: ReturnType<typeof run>): void {
  for (const value of ['PRIVATE_PUBLIC_SMOKE', 'private.invalid', 'Authorization: Bearer', 'PRIVATE_TOKEN']) {
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(value);
  }
}
