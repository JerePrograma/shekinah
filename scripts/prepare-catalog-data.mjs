#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const SOURCE = Object.freeze({
  commit: '7e39c5535800fdda31a48846f977fe5c1c05eb3f',
  productsBlob: 'e224b0ff241547a038f53c84bb006ef7cf3e56bb',
  categoriesBlob: '1649e6c27d92d1e26a45408c54bb8f499a023d64',
  imageTree: '9015d8a4ca17410c423ec50633d031f61695b385',
  productsSha256: '5b26bf5a44822646693fa3aaaf9530799da60115a7e3bcfb4bf8d09a1d9d137e',
  categoriesSha256: '4a2922171eee12d91f5b803469b8351a896b9b20423af034d8f3948ac7f1c25b',
  capturedAt: '2026-07-23',
});

const EXPECTED = Object.freeze({
  products: 510,
  categories: 16,
  prices: 510,
  descriptions: 495,
  skus: 432,
  imageReferences: 509,
  images: 484,
  productsWithoutImage: 1,
  productsWithoutDescription: 15,
});

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.resolve(process.argv[2] ?? '');
const sourceProductsPath = path.join(sourceRoot, 'src', 'generated', 'products.json');
const sourceCategoriesPath = path.join(sourceRoot, 'src', 'generated', 'categories.json');
const sourceImagesRoot = path.join(sourceRoot, 'public', 'images', 'original', 'catalog');
const dataRoot = path.join(projectRoot, 'src', 'catalog-data');
const manifestRoot = path.join(projectRoot, 'catalog');
const targetImagesRoot = path.join(projectRoot, 'public', 'images', 'original', 'catalog');

if (process.argv[2] === undefined) {
  throw new Error('Uso: node scripts/prepare-catalog-data.mjs <directorio-histórico-extraído>');
}

const entities = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['nbsp', ' '],
  ['quot', '"'],
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitBlobId(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function decodeEntities(value) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (match, decimal, hexadecimal, named) => {
    if (decimal !== undefined || hexadecimal !== undefined) {
      const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : ' ';
    }

    return entities.get(String(named).toLocaleLowerCase('en')) ?? match;
  });
}

function sanitizeText(value, multiline = false) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const decoded = decodeEntities(value)
    .normalize('NFC')
    .replace(/https?:\/\/[^\s<>"']+/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\r\n?/gu, '\n');
  const normalized = [...decoded]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return character === '\n' || character === '\t' || (codePoint >= 32 && codePoint !== 127);
    })
    .join('')
    .replace(/[ \t]+/gu, ' ');
  const result = multiline
    ? normalized
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{3,}/gu, '\n\n')
        .trim()
    : normalized.replace(/\s+/gu, ' ').trim();

  return result === '' ? undefined : result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSafeSlug(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function optionalProperty(name, value) {
  return value === undefined ? {} : { [name]: value };
}

function signatureMatches(bytes, extension) {
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === '.jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8;
  }
  if (extension === '.webp') {
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function toPrice(amount, currency, label) {
  assert(Number.isFinite(amount) && amount > 0, `${label}: importe inválido.`);
  assert(currency === 'ARS', `${label}: moneda inválida.`);
  return { amount, currency: 'ARS' };
}

function isSignificantVariant(product, variant) {
  const title = sanitizeText(variant.title);
  return (
    (Array.isArray(variant.options) && variant.options.length > 0) ||
    (title !== undefined && title !== sanitizeText(product.name)) ||
    variant.price !== product.price ||
    (variant.salePrice ?? null) !== (product.salePrice ?? null) ||
    (sanitizeText(variant.sku) ?? null) !== (sanitizeText(product.sku) ?? null) ||
    Boolean(variant.isAvailable) !== (product.availability === 'available')
  );
}

function toVariant(product, variant) {
  const title = sanitizeText(variant.title);
  const sku = sanitizeText(variant.sku);
  const options = Array.isArray(variant.options)
    ? variant.options.map((option) => {
        const name = sanitizeText(option.name ?? option.optionName);
        const value = sanitizeText(option.value ?? option.optionValue);
        assert(name !== undefined && value !== undefined, `Variante inválida en ${product.slug}.`);
        return { name, value };
      })
    : [];

  return {
    ...optionalProperty('title', title === sanitizeText(product.name) ? undefined : title),
    price: toPrice(variant.price, variant.currency, `Variante de ${product.slug}`),
    ...optionalProperty(
      'salePrice',
      variant.salePrice === null || variant.salePrice === undefined
        ? undefined
        : toPrice(variant.salePrice, variant.currency, `Oferta de ${product.slug}`),
    ),
    ...optionalProperty('sku', sku),
    available: Boolean(variant.isAvailable),
    options,
  };
}

const [productsBytes, categoriesBytes] = await Promise.all([
  readFile(sourceProductsPath),
  readFile(sourceCategoriesPath),
]);

assert(gitBlobId(productsBytes) === SOURCE.productsBlob, 'El blob histórico de productos no coincide.');
assert(gitBlobId(categoriesBytes) === SOURCE.categoriesBlob, 'El blob histórico de categorías no coincide.');
assert(sha256(productsBytes) === SOURCE.productsSha256, 'El SHA-256 histórico de productos no coincide.');
assert(sha256(categoriesBytes) === SOURCE.categoriesSha256, 'El SHA-256 histórico de categorías no coincide.');

const sourceProducts = JSON.parse(productsBytes.toString('utf8'));
const sourceCategories = JSON.parse(categoriesBytes.toString('utf8'));
assert(Array.isArray(sourceProducts), 'La fuente de productos no es una colección.');
assert(Array.isArray(sourceCategories), 'La fuente de categorías no es una colección.');

const categoryByInternalId = new Map();
const categories = sourceCategories
  .map((category) => {
    const slug = sanitizeText(category.slug);
    const name = sanitizeText(category.name);
    assert(isSafeSlug(slug), `Slug de categoría inválido: ${String(slug)}.`);
    assert(name !== undefined, `Categoría sin nombre: ${slug}.`);
    const expectedPath = `/tienda/categoria/${slug}/`;
    assert(category.path === expectedPath, `Ruta de categoría inválida: ${category.path}.`);
    assert(!categoryByInternalId.has(category.id), `ID de categoría duplicado: ${category.id}.`);
    categoryByInternalId.set(category.id, slug);
    return { slug, path: expectedPath, name, productCount: 0 };
  })
  .sort((left, right) => left.slug.localeCompare(right.slug, 'es-AR'));

assert(new Set(categories.map(({ slug }) => slug)).size === categories.length, 'Hay slugs de categoría duplicados.');
assert(new Set(categories.map(({ path: categoryPath }) => categoryPath)).size === categories.length, 'Hay rutas de categoría duplicadas.');

const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
const sourceImageNames = new Set(await readdir(sourceImagesRoot));
const referencedImageNames = new Set();
const assetByPath = new Map();
const details = {};

const products = sourceProducts
  .map((product) => {
    const slug = sanitizeText(product.slug);
    const name = sanitizeText(product.name);
    assert(isSafeSlug(slug), `Slug de producto inválido: ${String(slug)}.`);
    assert(name !== undefined, `Producto sin nombre: ${slug}.`);
    const expectedPath = `/${slug}/`;
    assert(product.path === expectedPath, `Ruta de producto inválida: ${product.path}.`);
    assert(product.capturedAt === SOURCE.capturedAt, `Fecha de captura inesperada en ${slug}.`);

    const categorySlugs = (Array.isArray(product.categoryIds) ? product.categoryIds : []).map((categoryId) => {
      const categorySlug = categoryByInternalId.get(categoryId);
      assert(categorySlug !== undefined, `Categoría inexistente en ${slug}.`);
      return categorySlug;
    });
    assert(new Set(categorySlugs).size === categorySlugs.length, `Categorías duplicadas en ${slug}.`);
    const categoryNames = categorySlugs.map((categorySlug) => {
      const category = categoryBySlug.get(categorySlug);
      assert(category !== undefined, `Categoría pública inexistente en ${slug}.`);
      category.productCount += 1;
      return category.name;
    });

    const images = (Array.isArray(product.images) ? product.images : []).map((image) => {
      assert(typeof image.src === 'string' && image.src.startsWith('/images/original/catalog/'), `Imagen no local en ${slug}.`);
      const imageName = path.posix.basename(image.src);
      const extension = path.posix.extname(imageName).toLowerCase();
      assert(sourceImageNames.has(imageName), `Imagen inexistente en ${slug}: ${imageName}.`);
      assert(/^[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(imageName), `Nombre de imagen inválido: ${imageName}.`);
      assert(image.sha256 === imageName.slice(0, -extension.length), `Hash declarado inválido: ${imageName}.`);
      referencedImageNames.add(imageName);
      const publicPath = `/images/original/catalog/${imageName}`;
      const alt = sanitizeText(image.alt) ?? name;
      const asset = assetByPath.get(publicPath) ?? {
        path: publicPath,
        sha256: image.sha256,
        extension: extension.slice(1),
        productSlugs: [],
        references: 0,
      };
      asset.productSlugs.push(slug);
      asset.references += 1;
      assetByPath.set(publicPath, asset);
      return { src: publicPath, alt };
    });

    const description = sanitizeText(product.description, true);
    const shortDescription = sanitizeText(product.shortDescription);
    const presentation = sanitizeText(product.unit);
    const sku = sanitizeText(product.sku);
    const availability = sanitizeText(product.availability);
    const variants = (Array.isArray(product.variants) ? product.variants : [])
      .filter((variant) => isSignificantVariant(product, variant))
      .map((variant) => toVariant(product, variant));
    const price = toPrice(product.price, product.currency, slug);
    const salePrice =
      product.salePrice === null || product.salePrice === undefined
        ? undefined
        : toPrice(product.salePrice, product.currency, `Oferta de ${slug}`);

    details[slug] = {
      ...optionalProperty('description', description),
      images,
      variants,
    };

    return {
      id: slug,
      slug,
      path: expectedPath,
      name,
      categorySlugs,
      categoryNames,
      ...optionalProperty('presentation', presentation),
      price,
      ...optionalProperty('salePrice', salePrice),
      ...optionalProperty('sku', sku),
      ...optionalProperty('availability', availability),
      ...optionalProperty('shortDescription', shortDescription),
      ...optionalProperty('primaryImage', images[0]),
      capturedAt: SOURCE.capturedAt,
      sourceOrder: product.sourceOrder,
    };
  })
  .sort((left, right) => left.sourceOrder - right.sourceOrder || left.slug.localeCompare(right.slug, 'es-AR'))
  .map(({ sourceOrder, ...product }) => {
    void sourceOrder;
    return product;
  });

assert(new Set(products.map(({ id }) => id)).size === products.length, 'Hay IDs públicos duplicados.');
assert(new Set(products.map(({ slug }) => slug)).size === products.length, 'Hay slugs públicos duplicados.');
assert(new Set(products.map(({ path: productPath }) => productPath)).size === products.length, 'Hay rutas públicas duplicadas.');
assert([...sourceImageNames].every((name) => referencedImageNames.has(name)), 'La fuente contiene imágenes huérfanas.');

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
assert(staticRouteCollisions.length === 0, 'Hay rutas comerciales que colisionan con rutas estáticas.');
assert(productAndCategoryRouteCollisions.length === 0, 'Hay rutas de productos y categorías que colisionan.');

const assets = [];
for (const asset of [...assetByPath.values()].sort((left, right) => left.path.localeCompare(right.path, 'en'))) {
  const imageName = path.posix.basename(asset.path);
  const bytes = await readFile(path.join(sourceImagesRoot, imageName));
  const extension = path.extname(imageName).toLowerCase();
  assert(signatureMatches(bytes, extension), `Firma de imagen inválida: ${imageName}.`);
  assert(sha256(bytes) === asset.sha256, `SHA-256 de imagen inválido: ${imageName}.`);
  asset.productSlugs.sort((left, right) => left.localeCompare(right, 'es-AR'));
  assets.push({ ...asset, bytes: bytes.length });
}

const missingDescriptions = products
  .filter(({ slug }) => details[slug].description === undefined)
  .map(({ slug, name }) => ({ slug, name }));
const missingImages = products
  .filter(({ slug }) => details[slug].images.length === 0)
  .map(({ slug, name }) => ({ slug, name }));
const metrics = {
  products: products.length,
  uniqueIds: new Set(products.map(({ id }) => id)).size,
  uniqueSlugs: new Set(products.map(({ slug }) => slug)).size,
  uniquePaths: new Set(products.map(({ path: productPath }) => productPath)).size,
  categories: categories.length,
  prices: products.filter(({ price }) => price.currency === 'ARS' && Number.isFinite(price.amount) && price.amount > 0).length,
  descriptions: products.length - missingDescriptions.length,
  skus: products.filter(({ sku }) => sku !== undefined).length,
  imageReferences: assets.reduce((total, asset) => total + asset.references, 0),
  images: assets.length,
  productsWithoutImage: missingImages.length,
  productsWithoutDescription: missingDescriptions.length,
  productsWithSignificantVariants: Object.values(details).filter(({ variants }) => variants.length > 0).length,
};

for (const [name, expected] of Object.entries(EXPECTED)) {
  assert(metrics[name] === expected, `Métrica ${name}: esperado=${expected}; actual=${metrics[name]}.`);
}
assert(missingImages[0]?.name === 'Caldo sin sal en polvo', 'El producto sin imagen no coincide.');

const categoriesText = `${JSON.stringify(categories, null, 2)}\n`;
const productsText = `${JSON.stringify(products, null, 2)}\n`;
const detailsText = `${JSON.stringify(details, null, 2)}\n`;
const assetsText = `${JSON.stringify({ schemaVersion: 1, images: assets }, null, 2)}\n`;
const catalogManifest = {
  schemaVersion: 1,
  capturedAt: SOURCE.capturedAt,
  source: {
    commit: SOURCE.commit,
    productsBlob: SOURCE.productsBlob,
    categoriesBlob: SOURCE.categoriesBlob,
    imageTree: SOURCE.imageTree,
    productsSha256: SOURCE.productsSha256,
    categoriesSha256: SOURCE.categoriesSha256,
  },
  sanitizer: 'scripts/prepare-catalog-data.mjs',
  metrics,
  missingImages,
  missingDescriptions,
  collisions: {
    staticRoutes: staticRouteCollisions,
    productAndCategoryRoutes: productAndCategoryRouteCollisions,
  },
  outputs: {
    categories: { path: 'src/catalog-data/categories.json', sha256: sha256(categoriesText) },
    index: { path: 'src/catalog-data/catalog-index.json', sha256: sha256(productsText) },
    details: { path: 'src/catalog-data/catalog-details.json', sha256: sha256(detailsText) },
    assets: { path: 'catalog/catalog-assets.json', sha256: sha256(assetsText) },
  },
};

await Promise.all([
  rm(dataRoot, { recursive: true, force: true }),
  rm(manifestRoot, { recursive: true, force: true }),
  rm(targetImagesRoot, { recursive: true, force: true }),
]);
await Promise.all([
  mkdir(dataRoot, { recursive: true }),
  mkdir(manifestRoot, { recursive: true }),
  mkdir(targetImagesRoot, { recursive: true }),
]);
await Promise.all([
  writeFile(path.join(dataRoot, 'categories.json'), categoriesText, 'utf8'),
  writeFile(path.join(dataRoot, 'catalog-index.json'), productsText, 'utf8'),
  writeFile(path.join(dataRoot, 'catalog-details.json'), detailsText, 'utf8'),
  writeFile(path.join(manifestRoot, 'catalog-assets.json'), assetsText, 'utf8'),
  writeFile(
    path.join(manifestRoot, 'catalog-manifest.json'),
    `${JSON.stringify(catalogManifest, null, 2)}\n`,
    'utf8',
  ),
  ...assets.map((asset) => {
    const imageName = path.posix.basename(asset.path);
    return copyFile(path.join(sourceImagesRoot, imageName), path.join(targetImagesRoot, imageName));
  }),
]);

process.stdout.write(
  `Catálogo público preparado: ${metrics.products} productos, ${metrics.categories} categorías, ${metrics.imageReferences} referencias y ${metrics.images} imágenes.\n`,
);
