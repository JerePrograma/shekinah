import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseCategories, parseProduct, parseProductDetail } from '../src/catalog/model.ts';

const canonicalOrigin = 'https://shekinah.ar';
const priceStates = ['usable', 'placeholder', 'missing_or_zero', 'invalid'];

/** Public GETs only. This check never receives administrative or Dux credentials. */
export async function verifyPublicDuxCatalog({ fetcher = fetch, allDetails = false } = {}) {
  const read = async (path, json = true) => {
    assert(path.startsWith('/') && !path.startsWith('//'), 'ruta pública inválida');
    const response = await fetcher(new URL(path, canonicalOrigin), {
      method: 'GET', redirect: 'error', credentials: 'omit',
      headers: { accept: json ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(30_000),
    });
    assert(response.status === 200, `HTTP ${response.status} en una ruta pública`);
    assert(response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html'),
      'tipo de respuesta pública inesperado');
    return json ? response.json() : response.text();
  };

  const catalog = await read('/api/catalog');
  const initial = validateCatalog(catalog);
  for (const path of ['/', '/catalogo']) {
    assert((await read(path, false)).includes('id="root"'), 'SPA pública no disponible');
  }

  // All product pages are static SPA routes; API detail reads are serial and bounded.
  const selected = allDetails ? catalog.products : representativeProducts(catalog.products);
  for (const product of selected) {
    const detail = await read(`/api/catalog/${encodeURIComponent(product.id)}`);
    assert(detail.schemaVersion === 2, 'versión de ficha pública incorrecta');
    validateProduct(detail.product, initial.catalogVersion);
    parseProductDetail(parseProduct(detail.product), detail.product);
    assert(detail.product.id === product.id, 'identidad de ficha distinta de la solicitada');
    assert(JSON.stringify(commercialFields(detail.product)) === JSON.stringify(commercialFields(product)),
      'ficha y listado discrepan en campos Dux');
    assert((await read(product.path, false)).includes('id="root"'), 'ruta de ficha no disponible');
  }

  const final = validateCatalog(await read('/api/catalog'));
  assert(final.catalogVersion === initial.catalogVersion && final.commercialDigest === initial.commercialDigest,
    'el snapshot cambió durante la comprobación; revisar sin repetir Dux');
  return {
    ...initial, origin: canonicalOrigin, https: 'verified',
    productDetailsVerified: selected.length,
    allProductDetailsVerified: selected.length === catalog.products.length,
    checkedAt: new Date().toISOString(),
  };
}

export function validateCatalog(catalog) {
  assert(catalog?.schemaVersion === 2 && catalog.source === 'dux', 'catálogo público Dux v2 requerido');
  assert(Array.isArray(catalog.products) && catalog.products.length > 0 && catalog.products.length <= 1_000,
    'universo público vacío o fuera del límite de lectura Dux');
  assert(Array.isArray(catalog.categories), 'categorías públicas ausentes');
  parseCategories(catalog.categories);
  const catalogVersion = catalog.products[0]?.commerce?.catalogVersion;
  assert(typeof catalogVersion === 'string' && /^[a-f0-9]{64}$/u.test(catalogVersion), 'versión de snapshot inválida');
  const ids = new Set();
  const codes = new Set();
  const categoryCounts = new Map();
  const prices = Object.fromEntries(priceStates.map((state) => [state, 0]));
  for (const product of catalog.products) {
    validateProduct(product, catalogVersion);
    assert(!ids.has(product.id) && !codes.has(product.sku), 'IDs o códigos Dux duplicados');
    ids.add(product.id);
    codes.add(product.sku);
    prices[product.priceStatus] += 1;
    product.categorySlugs.forEach((slug, index) => {
      const previous = categoryCounts.get(slug);
      assert(previous === undefined || previous.name === product.categoryNames[index], 'nombre de categoría inconsistente');
      categoryCounts.set(slug, { name: product.categoryNames[index], count: (previous?.count ?? 0) + 1 });
    });
  }
  assert(catalog.categories.length === categoryCounts.size, 'universo de categorías inconsistente');
  const categorySlugs = new Set();
  for (const category of catalog.categories) {
    const expected = categoryCounts.get(category.slug);
    assert(!categorySlugs.has(category.slug) && expected !== undefined &&
      expected.name === category.name && expected.count === category.productCount, 'categoría pública incorrecta');
    categorySlugs.add(category.slug);
  }
  const commercialRows = catalog.products.map(commercialFields)
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return {
    schemaVersion: 2, source: 'dux', products: catalog.products.length,
    categories: categoryCounts.size, prices, checkoutEligible: 0, catalogVersion,
    commercialDigest: createHash('sha256').update(JSON.stringify(commercialRows)).digest('hex'),
  };
}

function validateProduct(product, version) {
  assert(product !== null && typeof product === 'object', 'producto ausente');
  assert(typeof product.id === 'string' && /^[a-z0-9][a-z0-9-]{0,179}$/u.test(product.id) &&
    product.slug === product.id && product.path === `/${product.id}/`, 'identidad o ruta de producto inválida');
  assert(typeof product.sku === 'string' && product.sku.trim() !== '' &&
    typeof product.name === 'string' && product.name.trim() !== '', 'código o nombre Dux ausente');
  assert(product.commerce?.source === 'dux' && product.commerce.checkoutEligible === false &&
    product.commerce.catalogVersion === version, 'producto ajeno al snapshot o transaccionable');
  assert(Array.isArray(product.categorySlugs) && Array.isArray(product.categoryNames) &&
    product.categorySlugs.length === product.categoryNames.length &&
    new Set(product.categorySlugs).size === product.categorySlugs.length &&
    product.categorySlugs.every((value) => typeof value === 'string' && value !== '') &&
    product.categoryNames.every((value) => typeof value === 'string' && value !== ''), 'categorías del producto inválidas');
  assert(priceStates.includes(product.priceStatus), 'estado de precio inválido');
  if (product.priceStatus === 'usable') {
    const amount = product.price?.amount;
    assert(product.price?.currency === 'ARS' && Number.isFinite(amount) && amount > 2 &&
      Number.isSafeInteger(Math.round(amount * 100)) && Number(amount.toFixed(2)) === amount,
    'precio usable inválido');
  } else {
    assert(product.price === null, 'precio no usable expuesto como importe');
  }
  assert(product.salePrice === undefined, 'oferta ajena al precio Dux');
  assert(product.presentation === undefined && product.shortDescription === undefined,
    'presentación o descripción corta local en un producto Dux');
  // Exercise the same consumer contract as the SPA, including inventory metadata and images.
  parseProduct(product);
}

function commercialFields(product) {
  return [product.sku, product.name, product.priceStatus, product.price?.amount ?? null,
    product.categorySlugs.map((slug, index) => [slug, product.categoryNames[index]])];
}

function representativeProducts(products) {
  const selected = new Map();
  for (const status of priceStates) {
    const product = products.find((item) => item.priceStatus === status);
    if (product !== undefined) selected.set(product.id, product);
  }
  const enriched = products.find((product) => product.primaryImage !== undefined);
  if (enriched !== undefined) selected.set(enriched.id, enriched);
  return [...selected.values()];
}

function assert(condition, message) {
  if (!condition) throw new Error(`Verificación pública Dux fallida: ${message}.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyPublicDuxCatalog({ allDetails: process.argv.includes('--all-details') });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'La verificación pública Dux falló.');
    process.exitCode = 1;
  }
}
