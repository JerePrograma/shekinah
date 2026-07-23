#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceDirectory = path.resolve('src/generated');
const outputDirectory = path.resolve('src/generated-public');

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
      description: 'Historias, cultura gastronómica y usos tradicionales de hierbas y especias.',
      eyebrow: 'Publicaciones',
    },
  ],
  [
    '/recetas/',
    {
      description: 'Ideas, recetas y preparaciones artesanales para disfrutar en casa.',
      eyebrow: 'Recetario',
    },
  ],
]);

const prohibitedEditorialPatterns = [
  /\bHostinger\b/iu,
  /\bWordPress\b/iu,
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

function toPublicEditorialEntry(entry) {
  return {
    ...entry,
    ...(editorialOverrides.get(entry.path) ?? {}),
  };
}

function assertPublicEditorial(entries) {
  for (const entry of entries) {
    const serialized = JSON.stringify(entry);
    for (const pattern of prohibitedEditorialPatterns) {
      if (pattern.test(serialized)) {
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

const publicEntries = Array.isArray(editorial.entries) ? editorial.entries.map(toPublicEditorialEntry) : [];
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
