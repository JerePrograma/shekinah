import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseCategories, parseProduct, parseProductDetail } from '../src/catalog/model.ts';

const canonicalOrigin = 'https://shekinah.ar';
const priceStates = ['usable', 'placeholder', 'missing_or_zero', 'invalid'];
const verificationDeadlineMs = 12 * 60_000;
const maximumReadAttempts = 3;
const maximumRetryDelayMs = 30_000;
const tlsCodes = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const transportCodes = new Set([...tlsCodes, 'ABORT_ERR', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET',
  'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

class PublicValidationError extends Error {}
class PublicReadError extends Error {
  constructor(code, diagnostic) {
    super(`Verificación pública Dux fallida (${code}; fase=${diagnostic.phase}; ` +
      `HTTP=${diagnostic.httpStatus ?? 'none'}; clase=${diagnostic.errorClass}; ` +
      `código=${diagnostic.errorCode ?? 'none'}; causa=${diagnostic.causeCode ?? 'none'}).`);
  }
}

/** Public GETs only. This check never receives administrative or Dux credentials. */
export async function verifyPublicDuxCatalog({ fetcher = fetch, allDetails = false,
  clock = () => performance.now(), sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  const startedAt = clock();
  let lastNow = startedAt;
  const remaining = () => {
    const now = clock();
    assert(Number.isFinite(now) && now >= lastNow, 'reloj de verificación inválido');
    lastNow = now;
    const milliseconds = verificationDeadlineMs - (now - startedAt);
    if (milliseconds <= 0) throw new PublicReadError('PUBLIC_GET_DEADLINE', { phase: 'budget', errorClass: 'deadline' });
    return milliseconds;
  };
  const wait = async delay => {
    if (delay >= remaining()) throw new PublicReadError('PUBLIC_GET_DEADLINE', { phase: 'budget', errorClass: 'deadline' });
    await sleep(delay);
    remaining();
  };
  const read = async (path, json = true) => {
    assert(path.startsWith('/') && !path.startsWith('//'), 'ruta pública inválida');
    for (let attempt = 1; attempt <= maximumReadAttempts; attempt += 1) {
      let phase = 'fetch_headers';
      let httpStatus = null;
      try {
        const response = await fetcher(new URL(path, canonicalOrigin), {
          method: 'GET', redirect: 'error', credentials: 'omit',
          headers: { accept: json ? 'application/json' : 'text/html' },
          signal: AbortSignal.timeout(Math.min(30_000, Math.ceil(remaining()))),
        });
        httpStatus = response.status;
        phase = 'classify_response';
        const diagnostic = { version: 1, attempt, phase, httpStatus, errorClass: 'http_status', errorCode: null, causeCode: null };
        if (httpStatus !== 200) {
          try { await response.body?.cancel(); } catch { /* Do not inspect an error body. */ }
          if ((httpStatus === 429 || httpStatus >= 500) && attempt < maximumReadAttempts) {
            const delay = retryDelay(response, attempt);
            if (delay > maximumRetryDelayMs) throw new PublicReadError('PUBLIC_GET_RETRY_DELAY_EXCEEDED', diagnostic);
            console.warn('dux_public_get_retry', JSON.stringify(diagnostic));
            await wait(delay);
            continue;
          }
          throw new PublicReadError('PUBLIC_GET_HTTP', diagnostic);
        }
        if (!response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html')) {
          throw new PublicReadError('PUBLIC_GET_CONTENT_TYPE', { ...diagnostic, errorClass: 'invalid_content_type' });
        }
        phase = 'read_body';
        const content = json ? await response.json() : await response.text();
        remaining();
        return content;
      } catch (error) {
        if (error instanceof PublicReadError || error instanceof PublicValidationError) throw error;
        const diagnostic = { version: 1, attempt, phase, httpStatus,
          errorClass: safeErrorClass(error), errorCode: safeTransportCode(error),
          causeCode: record(error) ? safeTransportCode(error.cause) : null };
        if (error instanceof SyntaxError && phase === 'read_body') {
          throw new PublicReadError('PUBLIC_GET_JSON_INVALID', { ...diagnostic, errorClass: 'invalid_json' });
        }
        if (attempt === maximumReadAttempts || tlsCodes.has(diagnostic.errorCode) || tlsCodes.has(diagnostic.causeCode)) {
          throw new PublicReadError('PUBLIC_GET_TRANSPORT', diagnostic);
        }
        console.warn('dux_public_get_retry', JSON.stringify(diagnostic));
        await wait(500 * attempt);
      }
    }
    throw new PublicReadError('PUBLIC_GET_ATTEMPTS_EXHAUSTED', { phase: 'budget', errorClass: 'attempts' });
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
    validateConsumer(() => parseProductDetail(parseProduct(detail.product), detail.product));
    assert(detail.product.id === product.id, 'identidad de ficha distinta de la solicitada');
    assert(JSON.stringify(commercialFields(detail.product)) === JSON.stringify(commercialFields(product)),
      'ficha y listado discrepan en campos Dux');
    assert((await read(product.path, false)).includes('id="root"'), 'ruta de ficha no disponible');
  }

  const final = validateCatalog(await read('/api/catalog'));
  assert(final.catalogVersion === initial.catalogVersion && final.commercialDigest === initial.commercialDigest,
    'el snapshot cambió durante la comprobación; revisar sin repetir Dux');
  remaining();
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
  validateConsumer(() => parseCategories(catalog.categories));
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
  validateConsumer(() => parseProduct(product));
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
  if (!condition) throw new PublicValidationError(`Verificación pública Dux fallida: ${message}.`);
}

function validateConsumer(operation) {
  try { return operation(); }
  catch { throw new PublicValidationError('Verificación pública Dux fallida: contrato del catálogo o producto inválido.'); }
}

function retryDelay(response, attempt) {
  const value = response.headers.get('retry-after');
  if (value !== null) {
    if (/^\d+$/u.test(value)) return Number(value) * 1000;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  }
  return 500 * attempt;
}

function safeErrorClass(error) {
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof AggregateError) return 'aggregate_error';
  if (error instanceof DOMException) {
    if (error.name === 'TimeoutError') return 'timeout_error';
    if (error.name === 'AbortError') return 'abort_error';
    return 'dom_exception';
  }
  return error instanceof Error ? 'error' : 'unknown';
}

function safeTransportCode(error) {
  return record(error) && typeof error.code === 'string' && transportCodes.has(error.code) ? error.code : null;
}

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
