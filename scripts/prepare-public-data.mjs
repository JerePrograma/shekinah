#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceDirectory = path.resolve('src/generated');
const outputDirectory = path.resolve('src/generated-public');
const removedEditorialPaths = new Set([
  '/recetas/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
]);

const editorialOverrides = new Map([
  [
    '/tienda/',
    {
      description: 'Explorá nuestros productos, categorías y presentaciones disponibles.',
      eyebrow: 'Catálogo',
    },
  ],
  [
    '/blog/',
    {
      description: 'Información sobre hierbas, especias y sus usos culinarios.',
      eyebrow: 'Guías y consejos',
    },
  ],
  [
    '/terms-and-conditions/',
    {
      description: 'Términos y condiciones de venta online, cambios, devoluciones y reembolsos.',
    },
  ],
]);

const publicTextReplacements = [
  ['https://herbalarioonline.com', 'sitio oficial de Shekinah'],
  ['Herbalario Online', 'Shekinah'],
];

const prohibitedEditorialPatterns = [
  /\bHostinger\b/iu,
  /\bWordPress\b/iu,
  /herbalarioonline\.com/iu,
  /\bHerbalario Online\b/iu,
  /\bmigraci[oó]n(?:es)?\b/iu,
  /\brecuperad[oa]s?\b/iu,
  /\bevidencia(?:s)?\b/iu,
  /\bversionad[oa]s?\b/iu,
  /\bfuente original\b/iu,
  /\bcat[aá]logo original\b/iu,
  /\bprecio hist[oó]rico\b/iu,
];

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(sourceDirectory, fileName), 'utf8'));
}

async function writeJson(fileName, value) {
  await writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sanitizePublicValue(value) {
  if (typeof value === 'string') {
    return publicTextReplacements.reduce(
      (current, [source, replacement]) => current.replaceAll(source, replacement),
      value,
    );
  }
  if (Array.isArray(value)) return value.map(sanitizePublicValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizePublicValue(item)]));
  }
  return value;
}

function toPublicEditorialEntry(entry) {
  return {
    ...sanitizePublicValue(entry),
    ...(editorialOverrides.get(entry.path) ?? {}),
  };
}

function assertPublicEditorial(entries) {
  for (const entry of entries) {
    if (removedEditorialPaths.has(entry.path)) {
      throw new Error(`La entrada eliminada ${entry.path} no puede publicarse.`);
    }
    for (const pattern of prohibitedEditorialPatterns) {
      if (pattern.test(JSON.stringify(entry))) {
        throw new Error(`La entrada pública ${entry.path ?? 'sin ruta'} conserva texto técnico no publicable.`);
      }
      pattern.lastIndex = 0;
    }
  }
}

const products = await readJson('products.json');
const categories = await readJson('categories.json');
const editorial = await readJson('wordpress-original-content.json');
const categoryIds = new Map(categories.map((category) => [category.id, category.slug]));

const publicProducts = products.map((product) => ({
  id: product.slug,
  name: product.name,
  slug: product.slug,
  path: product.path,
  description: product.description ?? null,
  shortDescription: product.shortDescription ?? null,
  price: product.price ?? null,
  currency: product.currency ?? null,
  unit: product.unit ?? null,
  sku: product.sku ?? null,
  categoryIds: Array.isArray(product.categoryIds)
    ? product.categoryIds.map((categoryId) => categoryIds.get(categoryId)).filter(Boolean)
    : [],
  images: Array.isArray(product.images)
    ? product.images.map((image) => ({ src: image.src, alt: image.alt ?? product.name }))
    : [],
}));

const publicCategories = categories.map((category) => ({
  id: category.slug,
  name: category.name,
  slug: category.slug,
  path: category.path,
}));

const publicEntries = Array.isArray(editorial.entries)
  ? editorial.entries
      .filter((entry) => !removedEditorialPaths.has(entry.path) && entry.kind !== 'recipe')
      .map(toPublicEditorialEntry)
  : [];
assertPublicEditorial(publicEntries);
const publicEditorial = { entries: publicEntries };

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeJson('products.json', publicProducts),
  writeJson('categories.json', publicCategories),
  writeJson('editorial.json', publicEditorial),
]);

process.stdout.write(
  `Datos públicos preparados: ${publicProducts.length} productos, ${publicCategories.length} categorías y ${publicEditorial.entries.length} contenidos.\n`,
);
