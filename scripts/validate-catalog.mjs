#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const products = JSON.parse(await readFile('src/generated/products.json', 'utf8'));
const categories = JSON.parse(await readFile('src/generated/categories.json', 'utf8'));
const site = JSON.parse(await readFile('src/generated/site.json', 'utf8'));
const errors = [];
const warnings = [];

function duplicates(items, field) {
  const counts = new Map();
  for (const item of items) {
    const value = String(item[field] ?? '');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].filter(([value, count]) => value && count > 1).map(([value]) => value);
}

for (const field of ['id', 'slug', 'path']) {
  const values = duplicates(products, field);
  if (values.length) errors.push(`Productos con ${field} duplicado: ${values.join(', ')}`);
}
for (const field of ['id', 'slug', 'path']) {
  const values = duplicates(categories, field);
  if (values.length) errors.push(`Categorías con ${field} duplicado: ${values.join(', ')}`);
}

const categoryIds = new Set(categories.map((category) => category.id));
const fullCatalog = Number(site.catalogCount ?? 0) >= 510;
for (const product of products) {
  if (!product.id || !product.name || !product.slug || !product.path) errors.push(`Producto incompleto: ${JSON.stringify({ id: product.id, name: product.name })}`);
  if (fullCatalog && (!String(product.id).startsWith('prod_') || product.originalId !== product.id)) errors.push(`ID de catálogo inválido en ${product.id}`);
  if (!product.path.startsWith('/') || !product.path.endsWith('/')) errors.push(`Ruta no canónica: ${product.path}`);
  if (!product.provenance || !Array.isArray(product.evidence) || !product.evidence.length) errors.push(`Producto sin metadatos requeridos: ${product.id}`);
  for (const categoryId of product.categoryIds ?? []) if (!categoryIds.has(categoryId)) errors.push(`Categoría inexistente ${categoryId} en ${product.id}`);
  if (product.price === 0) errors.push(`Precio ficticio cero en ${product.id}`);
  if (product.price !== null && (!Number.isFinite(product.price) || product.price < 0)) errors.push(`Precio inválido en ${product.id}`);
  if (product.currency !== 'ARS') errors.push(`Moneda inesperada en ${product.id}: ${product.currency}`);
  if (!product.description) warnings.push(`Producto sin descripción: ${product.id}`);
  if (!product.images?.length) warnings.push(`Producto sin imagen: ${product.id}`);
  if (product.price === null) errors.push(`Producto sin precio: ${product.id}`);
  for (const image of product.images ?? []) {
    if (!image.src?.startsWith('/images/original/catalog/')) errors.push(`Imagen no local en ${product.id}: ${image.src}`);
    try {
      await access(path.join('public', image.src.replace(/^\//u, '')));
    } catch {
      errors.push(`Imagen inexistente en ${product.id}: ${image.src}`);
    }
  }
  const serialized = JSON.stringify(product);
  if (/MISSING DESCRIPTION|precio a consultar|sin stock/iu.test(serialized)) errors.push(`Marcador engañoso en ${product.id}`);
}

for (const slug of ['guayaba', 'melena-de-leon-futuro-fungi-50ml']) {
  if (!products.some((product) => product.slug === slug)) errors.push(`Falta producto de control: ${slug}`);
}
if (site.catalogCount !== undefined && site.catalogCount !== products.length) errors.push(`Conteo de sitio inconsistente: site=${site.catalogCount}; productos=${products.length}`);
if (fullCatalog && products.length !== 510) errors.push(`Catálogo incompleto: se esperaban 510 productos y hay ${products.length}.`);
if (fullCatalog && categories.length !== 16) errors.push(`Categorías incompletas: se esperaban 16 y hay ${categories.length}.`);
if (!/^54\d{10,13}$/u.test(site.whatsappNumber)) errors.push('Número de WhatsApp normalizado inválido.');
if (site.locale !== 'es-AR') errors.push(`Locale inesperado: ${site.locale}`);
if (site.checkoutEnabled !== false) errors.push('La configuración de checkout debe permanecer deshabilitada.');

try {
  await access('dist');
  const outputFiles = [
    'dist/tienda/index.html',
    ...categories.map((category) => `dist${category.path}index.html`),
    ...products.map((product) => `dist${product.path}index.html`),
  ];
  for (const file of outputFiles) {
    try {
      const html = await readFile(file, 'utf8');
      if (/productos recuperados|catálogo original recuperado|fuente recuperada|evidencia histórica|contenido versionado|migraci[oó]n|Hostinger/iu.test(html)) {
        errors.push(`Texto técnico expuesto en salida: ${file}`);
      }
      if (/Hello world!|trans-[a-z_-]+|wp-admin|wp-login/iu.test(html)) errors.push(`Marcador residual en salida: ${file}`);
    } catch {
      errors.push(`Falta ruta prerenderizada: ${file}`);
    }
  }
} catch {
  warnings.push('dist no existe; se omitió la validación de salida prerenderizada.');
}

const report = {
  products: products.length,
  categories: categories.length,
  productsWithoutDescription: products.filter((product) => !product.description).length,
  productsWithoutImage: products.filter((product) => !product.images?.length).length,
  productsWithoutPrice: products.filter((product) => product.price === null).length,
  localImages: new Set(products.flatMap((product) => product.images?.map((image) => image.src) ?? [])).size,
  warnings,
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
