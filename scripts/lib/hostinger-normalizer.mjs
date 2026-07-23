import path from 'node:path';
import { decodeEntities, sha256, stableValue } from './hostinger-parser.mjs';

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function walk(value, visitor, trail = [], seen = new WeakSet()) {
  visitor(value, trail);
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, item] of value) walk(item, visitor, [...trail, String(key)], seen);
  } else if (value instanceof Set) {
    [...value].forEach((item, index) => walk(item, visitor, [...trail, String(index)], seen));
  } else if (!ArrayBuffer.isView(value) && !(value instanceof Date) && !(value instanceof URL) && !(value instanceof RegExp)) {
    for (const [key, item] of Object.entries(value)) walk(item, visitor, [...trail, key], seen);
  }
}

function getField(object, names) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  const actual = new Map(Object.keys(object).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = actual.get(name.toLowerCase());
    if (key && object[key] !== null && object[key] !== undefined && object[key] !== '') return object[key];
  }
  return null;
}

function normalizeUrl(value, base = 'https://herbalarioonline.com/') {
  if (typeof value !== 'string' || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/iu.test(value)) return null;
  try {
    const url = new URL(decodeEntities(value), base);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function normalizeSlug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || 'sin-slug';
}

function normalizeImage(value, context) {
  if (typeof value === 'string') {
    const url = normalizeUrl(value);
    if (!url) return null;
    const extension = path.posix.extname(new URL(url).pathname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) && !/(image|asset|cdn|zyrosite)/iu.test(url)) return null;
    return { originalUrl: url, alt: context ?? null };
  }
  if (!value || typeof value !== 'object') return null;
  const source = getField(value, ['url', 'src', 'originalUrl', 'imageUrl', 'fullUrl']);
  return source ? normalizeImage(source, getField(value, ['alt', 'altText', 'title']) ?? context) : null;
}

function looksLikeProduct(object, trail) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const id = getField(object, ['id', '_id', 'productId', 'product_id']);
  const name = getField(object, ['name', 'title', 'productName']);
  const productMarker = typeof id === 'string' && id.startsWith('prod_');
  const keys = Object.keys(object);
  const commerceFields = keys.some((key) => /(price|currency|variant|stock|sku|fraction|unit|category|product)/iu.test(key));
  const identityFields = keys.some((key) => /^(?:id|_id|productId|product_id|slug|description|image|images|gallery|media|thumbnail)$/iu.test(key));
  const collectionItem = /^\d+$/u.test(trail.at(-1) ?? '') && trail.some((part) => /(products|catalog|storeItems)/iu.test(part));
  return Boolean(productMarker || (name && commerceFields) || (name && identityFields && collectionItem));
}

function numericPrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^0-9,.-]/gu, '').replace(/\.(?=\d{3}(?:\D|$))/gu, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProduct(object, trail, evidence) {
  const sourceId = getField(object, ['id', '_id', 'productId', 'product_id', 'uuid']);
  const nameValue = getField(object, ['name', 'title', 'productName']);
  if (!sourceId && !nameValue) return null;
  const name = String(nameValue ?? sourceId);
  const routeValue = getField(object, ['slug', 'path', 'url', 'handle']);
  const slug = normalizeSlug(typeof routeValue === 'string' ? routeValue.split('/').filter(Boolean).at(-1) : routeValue ?? name);
  const id = String(sourceId ?? `derived-${sha256(`${evidence.sha256}:${trail.join('.')}:${name}`).slice(0, 20)}`);
  const rawPrice = getField(object, ['price', 'amount', 'salePrice', 'regularPrice', 'basePrice']);
  const priceObject = rawPrice && typeof rawPrice === 'object' ? rawPrice : object;
  const amount = rawPrice && typeof rawPrice === 'object' ? getField(rawPrice, ['amount', 'value', 'price']) : rawPrice;
  const images = [];
  for (const key of ['image', 'images', 'gallery', 'media', 'thumbnail']) {
    const candidate = getField(object, [key]);
    for (const item of Array.isArray(candidate) ? candidate : [candidate]) {
      const image = normalizeImage(item, name);
      if (image && !images.some((current) => current.originalUrl === image.originalUrl)) images.push(image);
    }
  }
  const rawCategories = getField(object, ['categories', 'category', 'collections', 'tags']);
  const categoryNames = (Array.isArray(rawCategories) ? rawCategories : rawCategories ? [rawCategories] : [])
    .map((item) => (item && typeof item === 'object' ? getField(item, ['name', 'title', 'slug']) : item))
    .filter(Boolean)
    .map(String);
  const originalUrl = typeof routeValue === 'string' ? normalizeUrl(routeValue) : null;
  return {
    id,
    originalId: sourceId ? String(sourceId) : null,
    name,
    slug,
    originalUrl,
    description: String(getField(object, ['description', 'body', 'content', 'summary']) ?? '').trim() || null,
    price: numericPrice(amount),
    salePrice: numericPrice(getField(object, ['salePrice', 'discountPrice'])),
    currency: String(getField(priceObject, ['currency', 'currencyCode']) ?? '').trim() || null,
    unit: getField(object, ['unit', 'unitName', 'measureUnit']),
    minimumFraction: getField(object, ['minimumFraction', 'minFraction', 'fraction', 'fractionSize']),
    sku: getField(object, ['sku', 'productSku']),
    availability: getField(object, ['availability', 'stockStatus', 'status']),
    categories: categoryNames,
    images,
    sourceTrail: trail.join('.'),
    evidence: [evidence],
    raw: stableValue(object),
  };
}

function mergeProduct(previous, next) {
  if (!previous) return next;
  const choose = (left, right) => (right !== null && right !== undefined && right !== '' ? right : left);
  return {
    ...previous,
    ...next,
    description: choose(previous.description, next.description),
    price: choose(previous.price, next.price),
    salePrice: choose(previous.salePrice, next.salePrice),
    currency: choose(previous.currency, next.currency),
    unit: choose(previous.unit, next.unit),
    minimumFraction: choose(previous.minimumFraction, next.minimumFraction),
    sku: choose(previous.sku, next.sku),
    availability: choose(previous.availability, next.availability),
    categories: [...new Set([...previous.categories, ...next.categories])].sort((left, right) => left.localeCompare(right, 'es')),
    images: [...new Map([...previous.images, ...next.images].map((item) => [item.originalUrl, item])).values()].sort((left, right) => left.originalUrl.localeCompare(right.originalUrl)),
    evidence: [...previous.evidence, ...next.evidence].sort((left, right) => `${left.sourceFile}:${left.islandIndex}`.localeCompare(`${right.sourceFile}:${right.islandIndex}`)),
    raw: JSON.stringify(next.raw).length >= JSON.stringify(previous.raw).length ? next.raw : previous.raw,
  };
}

export function normalizeDecodedSources(decodedSources) {
  const products = new Map();
  const pages = new Map();
  const assets = new Map();
  const storeIds = new Set();
  const phones = new Set();
  for (const source of decodedSources) {
    for (const island of source.islands) {
      const evidence = { sourceFile: source.sourceFile, sha256: source.sha256, islandIndex: island.index, provenance: 'hostinger-original' };
      walk(island.value, (item, trail) => {
        if (looksLikeProduct(item, trail)) {
          const product = normalizeProduct(item, trail, evidence);
          if (product) products.set(product.id, mergeProduct(products.get(product.id), product));
        }
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const route = getField(item, ['path', 'route', 'url', 'slug']);
          const title = getField(item, ['title', 'name', 'pageTitle']);
          const blocks = getField(item, ['blocks', 'sections', 'content']);
          const absolute = normalizeUrl(route);
          if (absolute && title && blocks) {
            const pathname = new URL(absolute).pathname.replace(/\/?$/u, '/');
            pages.set(pathname, {
              id: String(getField(item, ['id', '_id', 'pageId']) ?? `derived-${sha256(pathname).slice(0, 20)}`),
              route: pathname,
              title: String(title),
              evidence: [evidence],
            });
          }
        }
        if (typeof item === 'string') {
          for (const match of item.matchAll(/\bstore_[A-Za-z0-9_]+\b/gu)) storeIds.add(match[0]);
          for (const match of item.matchAll(/\b(?:54)?(?:9)?223\d{7}\b/gu)) phones.add(match[0]);
          const image = normalizeImage(item, trail.at(-1));
          if (image) {
            const current = assets.get(image.originalUrl) ?? { originalUrl: image.originalUrl, usedBy: [] };
            current.usedBy.push(`data:${source.sourceFile}:${trail.join('.')}`);
            current.usedBy = [...new Set(current.usedBy)].sort();
            assets.set(image.originalUrl, current);
          }
        }
      });
    }
  }
  const productList = [...products.values()].sort((left, right) => left.id.localeCompare(right.id));
  for (const product of productList) {
    for (const image of product.images) {
      const current = assets.get(image.originalUrl) ?? { originalUrl: image.originalUrl, usedBy: [] };
      current.usedBy.push(`product:${product.id}`);
      current.usedBy = [...new Set(current.usedBy)].sort();
      assets.set(image.originalUrl, current);
    }
  }
  const categoryNames = [...new Set(productList.flatMap((product) => product.categories))].sort((left, right) => left.localeCompare(right, 'es'));
  return {
    pages: [...pages.values()].sort((left, right) => left.route.localeCompare(right.route)),
    products: productList,
    categories: categoryNames.map((name) => ({ id: `category-${normalizeSlug(name)}`, name, slug: normalizeSlug(name) })),
    assets: [...assets.values()].sort((left, right) => left.originalUrl.localeCompare(right.originalUrl)),
    storeIds: [...storeIds].sort(),
    phones: [...phones].sort(),
  };
}

