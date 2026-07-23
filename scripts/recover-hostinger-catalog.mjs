#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storeId = process.env.HOSTINGER_STORE_ID || 'store_01KPB411FQRYAKN8ED2BSRBPZC';
const watermark = process.env.HOSTINGER_CATALOG_WATERMARK || '2026-07-20T14:23:03.148Z';
const capturedAt = process.env.HOSTINGER_CAPTURE_DATE || '2026-07-23';
const expectedProducts = Number(process.env.HOSTINGER_EXPECTED_PRODUCTS || 0);
const api = `https://api-ecommerce.hostinger.com/store/${storeId}`;
const root = process.cwd();
const concurrency = 10;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const json = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;

async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, typeof value === 'string' ? value : json(value));
  await rename(temporary, file);
}

async function request(url, accept = 'application/json,image/*,*/*') {
  let failure;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept, 'user-agent': 'ShekinahCatalogRecovery/1.0 (+https://github.com/JerePrograma/shekinah)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw failure;
}

async function fetchJson(url) {
  const response = await request(url);
  const body = Buffer.from(await response.arrayBuffer());
  return { value: JSON.parse(body.toString('utf8')), sha256: hash(body), url };
}

function entities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return named[key] ?? match;
  });
}

function toText(html) {
  if (!html) return null;
  const source = String(html).trim();
  if (/^MISSING DESCRIPTION$/iu.test(source)) return null;
  return entities(source
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:p|div|h[1-6]|ul|ol)>/giu, '\n\n')
    .replace(/<li[^>]*>/giu, '\n- ')
    .replace(/<\/li>/giu, '')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim() || null;
}

function slug(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'sin-slug';
}

function fraction(product, description) {
  const match = `${description ?? ''}\n${product.title ?? ''}`.match(/(?:fracci[oó]n\s+m[ií]nima\s*:?|\bx\s*)(\d+(?:[.,]\d+)?)\s*(kg|kilos?|gr(?:amos?)?|g|ml|cc|l(?:itros?)?|un(?:idad(?:es)?)?\.?)/iu);
  if (!match) return { minimumFraction: null, minimumFractionUnit: null, unit: null };
  const quantity = Number.parseFloat(match[1].replace(',', '.'));
  const raw = match[2].toLowerCase();
  const unit = /^kg|kilo/u.test(raw) ? 'kg' : /^gr|^g$/u.test(raw) ? 'g' : /^ml|^cc/u.test(raw) ? 'ml' : /^l/u.test(raw) ? 'l' : 'unidad';
  return { minimumFraction: quantity, minimumFractionUnit: unit, unit: `${quantity} ${unit}` };
}

const money = (value) => typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;

function extension(type, url) {
  if (type.includes('jpeg')) return '.jpg';
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('avif')) return '.avif';
  if (type.includes('svg')) return '.svg';
  const ext = path.posix.extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.gif'].includes(ext) ? ext : '.bin';
}

function validImage(ext, body) {
  const hex = body.subarray(0, 16).toString('hex');
  const ascii = body.subarray(0, 16).toString('ascii');
  if (ext === '.jpg' || ext === '.jpeg') return hex.startsWith('ffd8ff');
  if (ext === '.png') return hex.startsWith('89504e470d0a1a0a');
  if (ext === '.webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (ext === '.gif') return ascii.startsWith('GIF8');
  if (ext === '.avif') return ascii.slice(4, 8) === 'ftyp';
  if (ext === '.svg') return /<svg\b/iu.test(body.subarray(0, 2048).toString('utf8'));
  return false;
}

const collectionsResult = await fetchJson(`${api}/collections`);
const collectionsRaw = collectionsResult.value.collections ?? [];
const pages = [];
const rawProducts = [];
let count = null;
for (let offset = 0; count === null || offset < count; offset += 20) {
  const url = `${api}/products?offset=${offset}&limit=20&exclude_types=subscription&to_date=${encodeURIComponent(watermark)}`;
  const result = await fetchJson(url);
  count = Number(result.value.count);
  const items = result.value.products ?? [];
  if (!Number.isInteger(count) || !Array.isArray(items)) throw new Error(`Respuesta inválida en offset ${offset}.`);
  pages.push({ offset, products: items.length, sha256: result.sha256, url });
  rawProducts.push(...items.map((product) => ({ ...product, _evidence: { sha256: result.sha256, url } })));
}
const productsById = new Map(rawProducts.map((product) => [product.id, product]));
if (productsById.size !== count) throw new Error(`Conteo inconsistente: API=${count}; únicos=${productsById.size}.`);
if (expectedProducts && count !== expectedProducts) throw new Error(`Conteo inesperado: esperado=${expectedProducts}; API=${count}.`);
const productsRaw = [...productsById.values()];
const slugs = new Set(productsRaw.map((product) => product.slug));
if (slugs.size !== productsRaw.length) throw new Error(`Slugs duplicados: productos=${productsRaw.length}; slugs=${slugs.size}.`);
for (const control of ['guayaba', 'melena-de-leon-futuro-fungi-50ml']) {
  if (!productsRaw.some((product) => product.slug === control)) throw new Error(`Falta producto de control: ${control}.`);
}

const assetRoot = path.join(root, 'public/images/original/catalog');
await rm(assetRoot, { recursive: true, force: true });
await mkdir(assetRoot, { recursive: true });
const imageUrls = [...new Set(productsRaw.flatMap((product) => (product.images ?? []).map((image) => image.url).filter(Boolean)))].sort();
const assets = [];
const assetByUrl = new Map();
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= imageUrls.length) return;
    const url = imageUrls[index];
    try {
      const response = await request(url);
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!type.startsWith('image/')) throw new Error(`MIME no visual: ${type || 'ausente'}`);
      const body = Buffer.from(await response.arrayBuffer());
      const sha256 = hash(body);
      const ext = extension(type, url);
      if (!body.length || !validImage(ext, body)) throw new Error(`Imagen vacía o firma inválida (${ext}).`);
      const fileName = `${sha256}${ext === '.jpeg' ? '.jpg' : ext}`;
      const file = path.join(assetRoot, fileName);
      try { await stat(file); } catch { await writeFile(file, body); }
      const asset = { localPath: `/images/original/catalog/${fileName}`, mime: type, originalUrl: url, sha256, size: body.length, status: 'downloaded' };
      assets.push(asset);
      assetByUrl.set(url, asset);
    } catch (error) {
      assets.push({ originalUrl: url, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
assets.sort((a, b) => a.originalUrl.localeCompare(b.originalUrl));
const failedAssets = assets.filter((asset) => asset.status === 'failed');
if (failedAssets.length) throw new Error(`Fallaron ${failedAssets.length} imágenes públicas; no se generará un catálogo incompleto.`);

const categories = collectionsRaw.filter((item) => !item.deleted_at).map((item, sourceOrder) => ({
  createdAt: item.created_at ?? null,
  id: item.id,
  image: item.image_url ?? null,
  name: item.title,
  originalId: item.id,
  path: `/tienda/categoria/${slug(item.title)}/`,
  provenance: 'hostinger-original',
  slug: slug(item.title),
  sourceOrder,
  updatedAt: item.updated_at ?? null,
}));
const categoryIds = new Set(categories.map((item) => item.id));
const products = productsRaw.map((product, sourceOrder) => {
  const description = toText(product.description);
  const unit = fraction(product, description);
  const primaryVariant = product.variants?.[0] ?? null;
  const primaryPrice = primaryVariant?.prices?.[0] ?? null;
  const images = (product.images ?? []).map((image) => {
    const asset = assetByUrl.get(image.url);
    return asset ? { alt: product.title, originalUrl: image.url, sha256: asset.sha256, src: asset.localPath } : null;
  }).filter(Boolean);
  const warnings = [];
  if (!description) warnings.push('Descripción original ausente.');
  if (!images.length) warnings.push('Imagen original ausente o no descargada.');
  if (!primaryPrice) warnings.push('Precio público ausente.');
  return {
    availability: product.is_available && primaryVariant?.is_available !== false ? 'available' : 'unavailable',
    capturedAt,
    categoryIds: (product.product_collections ?? []).map((item) => item.collection_id).filter((id) => categoryIds.has(id)),
    currency: primaryPrice?.currency_code?.toUpperCase() ?? null,
    description,
    descriptionHtml: product.description ?? null,
    evidence: [{ capturedAt, note: 'Registro público de Hostinger Ecommerce.', sha256: product._evidence.sha256, source: product._evidence.url, sourceType: 'hostinger-original' }],
    id: product.id,
    images,
    minimumFraction: unit.minimumFraction,
    minimumFractionUnit: unit.minimumFractionUnit,
    name: String(product.title ?? '').trim(),
    originalId: product.id,
    originalPath: `/${product.slug}`,
    path: `/${product.slug}/`,
    price: money(primaryPrice?.amount),
    provenance: 'hostinger-original',
    purchasable: Boolean(product.purchasable),
    ribbonText: product.ribbon_text?.trim() || null,
    salePrice: money(primaryPrice?.sale_amount),
    shortDescription: product.subtitle?.trim() || product.seo_settings?.description?.trim() || (description ? description.slice(0, 240) : null),
    sku: primaryVariant?.sku ?? null,
    slug: product.slug,
    sourceOrder,
    sourceUpdatedAt: product.updated_at ?? null,
    subtitle: product.subtitle?.trim() || null,
    type: product.type?.value ?? null,
    unit: unit.unit,
    variants: (product.variants ?? []).map((variant) => {
      const price = variant.prices?.[0] ?? null;
      return {
        currency: price?.currency_code?.toUpperCase() ?? null,
        id: variant.id,
        isAvailable: Boolean(variant.is_available),
        manageInventory: Boolean(variant.manage_inventory),
        options: variant.options ?? [],
        price: money(price?.amount),
        salePrice: money(price?.sale_amount),
        sku: variant.sku ?? null,
        title: variant.title,
      };
    }),
    warnings,
  };
});

const generatedRoot = path.join(root, 'generated/hostinger-catalog');
await rm(generatedRoot, { recursive: true, force: true });
await atomic(path.join(root, 'src/generated/products.json'), products);
await atomic(path.join(root, 'src/generated/categories.json'), categories);
await atomic(path.join(root, 'src/generated/site.json'), {
  catalogCount: products.length,
  catalogSourceWatermark: watermark,
  checkoutRecovered: false,
  locale: 'es-AR',
  originalDomain: 'https://herbalarioonline.com',
  priceEvidenceDate: capturedAt,
  storeIdMarker: storeId,
  whatsappNumber: '542236216559',
  whatsappVisible: '+54 9 223 621-6559',
});
await atomic(path.join(generatedRoot, 'products.raw.json'), productsRaw.map(({ _evidence, ...product }) => product));
await atomic(path.join(generatedRoot, 'collections.raw.json'), collectionsRaw);
await atomic(path.join(generatedRoot, 'api-pages.json'), pages);
await atomic(path.join(generatedRoot, 'assets.json'), assets);
const manifest = {
  capturedAt,
  categoriesRecovered: categories.length,
  descriptionsRecovered: products.filter((product) => product.description).length,
  imageReferences: imageUrls.length,
  imagesDownloaded: assets.filter((asset) => asset.status === 'downloaded').length,
  imagesFailed: failedAssets.length,
  pricesRecovered: products.filter((product) => product.price !== null).length,
  productsDetected: count,
  productsRecovered: products.length,
  productsWithoutDescriptions: products.filter((product) => !product.description).map((product) => product.id),
  productsWithoutImages: products.filter((product) => !product.images.length).map((product) => product.id),
  productsWithoutPrices: products.filter((product) => product.price === null).map((product) => product.id),
  skusRecovered: products.filter((product) => product.sku).length,
  storeId,
  uniqueProductIds: new Set(products.map((product) => product.id)).size,
  uniqueSlugs: new Set(products.map((product) => product.slug)).size,
  watermark,
};
await atomic(path.join(generatedRoot, 'manifest.json'), manifest);
await atomic(path.join(root, 'docs/fidelity/catalog-manifest.json'), manifest);
process.stdout.write(json({ result: 'success', ...manifest }));
