#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceDirectory = path.resolve('src/generated');
const outputDirectory = path.resolve('src/generated-public');

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(sourceDirectory, fileName), 'utf8'));
}

async function writeJson(fileName, value) {
  await writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const products = await readJson('products.json');
const categories = await readJson('categories.json');
const editorial = await readJson('wordpress-original-content.json');

const publicProducts = products.map((product) => ({
  id: product.id,
  name: product.name,
  slug: product.slug,
  path: product.path,
  description: product.description ?? null,
  shortDescription: product.shortDescription ?? null,
  price: product.price ?? null,
  currency: product.currency ?? null,
  unit: product.unit ?? null,
  sku: product.sku ?? null,
  categoryIds: Array.isArray(product.categoryIds) ? product.categoryIds : [],
  images: Array.isArray(product.images)
    ? product.images.map((image) => ({ src: image.src, alt: image.alt ?? product.name }))
    : [],
}));

const publicCategories = categories.map((category) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  path: category.path,
}));

const publicEditorial = {
  entries: Array.isArray(editorial.entries) ? editorial.entries : [],
};

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
