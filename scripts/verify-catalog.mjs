#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const imageRoot = path.join(projectRoot, 'public', 'images', 'original', 'catalog');
const expectedMetrics = Object.freeze({
  products: 510,
  uniqueIds: 510,
  uniqueSlugs: 510,
  uniquePaths: 510,
  categories: 16,
  prices: 510,
  descriptions: 495,
  skus: 432,
  imageReferences: 509,
  images: 484,
  productsWithoutImage: 1,
  productsWithoutDescription: 15,
  productsWithSignificantVariants: 0,
});

function fail(message) {
  throw new Error(message);
}

function readBytes(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(`No existe ${relativePath}.`);
  }
  return readFileSync(filePath);
}

function readJson(relativePath) {
  return JSON.parse(readBytes(relativePath).toString('utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isNonemptyText(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    fail(`Hay ${label} duplicados.`);
  }
}

const categories = readJson('src/catalog-data/categories.json');
const products = readJson('src/catalog-data/catalog-index.json');
const details = readJson('src/catalog-data/catalog-details.json');
const assetManifest = readJson('catalog/catalog-assets.json');
const catalogManifest = readJson('catalog/catalog-manifest.json');

if (!Array.isArray(categories) || !Array.isArray(products) || !Array.isArray(assetManifest.images)) {
  fail('Las colecciones generadas no tienen el formato esperado.');
}
if (typeof details !== 'object' || details === null || Array.isArray(details)) {
  fail('El detalle generado no tiene el formato esperado.');
}

for (const [name, expected] of Object.entries(expectedMetrics)) {
  if (catalogManifest.metrics?.[name] !== expected) {
    fail(`Métrica ${name}: esperado=${expected}; actual=${String(catalogManifest.metrics?.[name])}.`);
  }
}

for (const output of Object.values(catalogManifest.outputs ?? {})) {
  if (!isNonemptyText(output?.path) || !/^[a-f0-9]{64}$/u.test(output?.sha256 ?? '')) {
    fail('El manifiesto contiene una salida inválida.');
  }
  if (sha256(readBytes(output.path)) !== output.sha256) {
    fail(`El hash generado no coincide: ${output.path}.`);
  }
}

if (catalogManifest.source?.productsBlob !== 'e224b0ff241547a038f53c84bb006ef7cf3e56bb') {
  fail('El blob de productos no coincide con la fuente elegida.');
}
if (catalogManifest.source?.categoriesBlob !== '1649e6c27d92d1e26a45408c54bb8f499a023d64') {
  fail('El blob de categorías no coincide con la fuente elegida.');
}
if (catalogManifest.capturedAt !== '2026-07-23') {
  fail('La fecha de captura no coincide.');
}

assertUnique(categories.map(({ slug }) => slug), 'slugs de categoría');
assertUnique(categories.map(({ path: categoryPath }) => categoryPath), 'paths de categoría');
const categoryBySlug = new Map();
for (const category of categories) {
  if (
    !/^[a-z0-9][a-z0-9-]*$/u.test(category.slug) ||
    category.path !== `/tienda/categoria/${category.slug}/` ||
    !isNonemptyText(category.name) ||
    !Number.isInteger(category.productCount) ||
    category.productCount < 0
  ) {
    fail(`Categoría inválida: ${String(category.slug)}.`);
  }
  categoryBySlug.set(category.slug, category);
}

assertUnique(products.map(({ id }) => id), 'IDs de producto');
assertUnique(products.map(({ slug }) => slug), 'slugs de producto');
assertUnique(products.map(({ path: productPath }) => productPath), 'paths de producto');
const productBySlug = new Map();
const categoryCounts = new Map(categories.map(({ slug }) => [slug, 0]));
let descriptions = 0;
let skus = 0;
let imageReferences = 0;
let productsWithoutImage = 0;

for (const product of products) {
  if (
    product.id !== product.slug ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(product.slug) ||
    product.path !== `/${product.slug}/` ||
    !isNonemptyText(product.name) ||
    product.capturedAt !== '2026-07-23' ||
    !Number.isFinite(product.price?.amount) ||
    product.price.amount <= 0 ||
    product.price.currency !== 'ARS' ||
    !Array.isArray(product.categorySlugs) ||
    !Array.isArray(product.categoryNames) ||
    product.categorySlugs.length !== product.categoryNames.length
  ) {
    fail(`Producto inválido: ${String(product.slug)}.`);
  }
  if (Object.hasOwn(product, 'description')) {
    fail(`La descripción completa no puede estar en el índice: ${product.slug}.`);
  }
  assertUnique(product.categorySlugs, `categorías de ${product.slug}`);
  product.categorySlugs.forEach((categorySlug, index) => {
    const category = categoryBySlug.get(categorySlug);
    if (category === undefined || category.name !== product.categoryNames[index]) {
      fail(`Categoría inexistente en ${product.slug}: ${String(categorySlug)}.`);
    }
    categoryCounts.set(categorySlug, (categoryCounts.get(categorySlug) ?? 0) + 1);
  });
  if (product.salePrice !== undefined) {
    if (
      !Number.isFinite(product.salePrice.amount) ||
      product.salePrice.amount <= 0 ||
      product.salePrice.currency !== 'ARS'
    ) {
      fail(`Precio promocional inválido: ${product.slug}.`);
    }
  }
  if (product.sku !== undefined) {
    if (!isNonemptyText(product.sku)) fail(`SKU inválido: ${product.slug}.`);
    skus += 1;
  }
  if (product.primaryImage !== undefined && !/^\/images\/original\/catalog\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(product.primaryImage.src)) {
    fail(`Imagen principal inválida: ${product.slug}.`);
  }
  productBySlug.set(product.slug, product);
}

for (const category of categories) {
  if (category.productCount !== categoryCounts.get(category.slug)) {
    fail(`Conteo inválido para la categoría ${category.slug}.`);
  }
}

const detailSlugs = Object.keys(details);
assertUnique(detailSlugs, 'claves de detalle');
if (detailSlugs.length !== products.length || detailSlugs.some((slug) => !productBySlug.has(slug))) {
  fail('El detalle no cubre exactamente los productos del índice.');
}

const referencedProductsByImage = new Map();
for (const [slug, detail] of Object.entries(details)) {
  const product = productBySlug.get(slug);
  if (!Array.isArray(detail.images) || !Array.isArray(detail.variants)) {
    fail(`Detalle inválido: ${slug}.`);
  }
  if (detail.description !== undefined) {
    if (!isNonemptyText(detail.description)) fail(`Descripción inválida: ${slug}.`);
    descriptions += 1;
  }
  if ((product.primaryImage?.src ?? null) !== (detail.images[0]?.src ?? null)) {
    fail(`La imagen principal no coincide con el detalle: ${slug}.`);
  }
  if (detail.images.length === 0) productsWithoutImage += 1;
  for (const image of detail.images) {
    if (
      !/^\/images\/original\/catalog\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(image.src) ||
      !isNonemptyText(image.alt)
    ) {
      fail(`Imagen inválida en ${slug}.`);
    }
    const productSlugs = referencedProductsByImage.get(image.src) ?? [];
    productSlugs.push(slug);
    referencedProductsByImage.set(image.src, productSlugs);
    imageReferences += 1;
  }
  for (const variant of detail.variants) {
    if (!Number.isFinite(variant.price?.amount) || variant.price.amount <= 0 || variant.price.currency !== 'ARS') {
      fail(`Variante inválida en ${slug}.`);
    }
  }
}

const actualMetrics = {
  products: products.length,
  uniqueIds: new Set(products.map(({ id }) => id)).size,
  uniqueSlugs: new Set(products.map(({ slug }) => slug)).size,
  uniquePaths: new Set(products.map(({ path: productPath }) => productPath)).size,
  categories: categories.length,
  prices: products.filter(({ price }) => price.currency === 'ARS' && price.amount > 0).length,
  descriptions,
  skus,
  imageReferences,
  images: referencedProductsByImage.size,
  productsWithoutImage,
  productsWithoutDescription: products.length - descriptions,
  productsWithSignificantVariants: Object.values(details).filter(({ variants }) => variants.length > 0).length,
};

for (const [name, expected] of Object.entries(expectedMetrics)) {
  if (actualMetrics[name] !== expected) {
    fail(`Conteo ${name}: esperado=${expected}; actual=${actualMetrics[name]}.`);
  }
}

const normalizeRoute = (value) => (value === '/' ? value : value.replace(/\/+$/u, ''));
const staticRoutes = new Set(['/', '/enfoque', '/catalogo', '/privacidad']);
const productRoutes = new Set(products.map(({ path: productPath }) => normalizeRoute(productPath)));
const categoryRoutes = new Set(categories.map(({ path: categoryPath }) => normalizeRoute(categoryPath)));
const staticRouteCollisions = [...new Set([...productRoutes, ...categoryRoutes])]
  .filter((route) => staticRoutes.has(route))
  .sort();
const productAndCategoryRouteCollisions = [...productRoutes]
  .filter((route) => categoryRoutes.has(route))
  .sort();
if (
  staticRouteCollisions.length > 0 ||
  productAndCategoryRouteCollisions.length > 0 ||
  JSON.stringify(catalogManifest.collisions) !==
    JSON.stringify({
      staticRoutes: staticRouteCollisions,
      productAndCategoryRoutes: productAndCategoryRouteCollisions,
    })
) {
  fail('Las colisiones de rutas no coinciden con el manifiesto.');
}

const manifestImagePaths = assetManifest.images.map(({ path: imagePath }) => imagePath);
assertUnique(manifestImagePaths, 'paths de activos');
if (manifestImagePaths.length !== expectedMetrics.images) {
  fail('El manifiesto de activos no contiene 484 imágenes.');
}

for (const asset of assetManifest.images) {
  const expectedProducts = [...(referencedProductsByImage.get(asset.path) ?? [])].sort((left, right) =>
    left.localeCompare(right, 'es-AR'),
  );
  if (
    !/^[a-f0-9]{64}$/u.test(asset.sha256) ||
    !['jpg', 'png', 'webp'].includes(asset.extension) ||
    asset.references !== expectedProducts.length ||
    JSON.stringify(asset.productSlugs) !== JSON.stringify(expectedProducts)
  ) {
    fail(`Activo inválido: ${String(asset.path)}.`);
  }
}

const diskImages = readdirSync(imageRoot).sort();
const expectedImageNames = manifestImagePaths.map((imagePath) => path.posix.basename(imagePath)).sort();
if (JSON.stringify(diskImages) !== JSON.stringify(expectedImageNames)) {
  fail('Los archivos de imagen no coinciden exactamente con el manifiesto.');
}

const publicData = JSON.stringify({ categories, products, details });
const forbiddenPatterns = [
  /https?:\/\//iu,
  /\b(?:prod|variant|pcol)_[a-z0-9]+\b/iu,
  /\bstore_[a-z0-9]+\b/iu,
  /api-ecommerce\.hostinger\.com|cdn\.zyrosite\.com/iu,
  /"(?:originalUrl|descriptionHtml|evidence|warnings|provenance)"\s*:/iu,
  /<\/?[a-z][^>]*>/iu,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(publicData)) {
    fail(`Los datos públicos contienen el patrón prohibido ${pattern}.`);
  }
}

if (catalogManifest.missingImages?.[0]?.name !== 'Caldo sin sal en polvo') {
  fail('El producto sin imagen no coincide con la fuente.');
}
if (catalogManifest.missingDescriptions?.length !== 15) {
  fail('La lista de productos sin descripción no coincide con la fuente.');
}

console.log(
  `Catálogo verificado: ${products.length} productos, ${categories.length} categorías, ${descriptions} descripciones, ${skus} SKU, ${imageReferences} referencias y ${manifestImagePaths.length} imágenes.`,
);
