#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';

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
for (const product of products) {
  if (!product.id || !product.name || !product.slug || !product.path) errors.push(`Producto incompleto: ${JSON.stringify({ id: product.id, name: product.name })}`);
  if (!product.path.startsWith('/') || !product.path.endsWith('/')) errors.push(`Ruta no canónica: ${product.path}`);
  if (!product.provenance || !Array.isArray(product.evidence) || !product.evidence.length) errors.push(`Producto sin procedencia: ${product.id}`);
  for (const categoryId of product.categoryIds ?? []) if (!categoryIds.has(categoryId)) errors.push(`Categoría inexistente ${categoryId} en ${product.id}`);
  if (product.price === 0) errors.push(`Precio ficticio cero en ${product.id}`);
  if (product.price !== null && (!Number.isFinite(product.price) || product.price < 0)) errors.push(`Precio inválido en ${product.id}`);
  if (!product.description) warnings.push(`Producto sin descripción: ${product.id}`);
  if (!product.images?.length) warnings.push(`Producto sin imagen: ${product.id}`);
  if (product.price === null) warnings.push(`Producto sin precio: ${product.id}`);
  const serialized = JSON.stringify(product);
  if (/MISSING DESCRIPTION|precio a consultar|sin stock/iu.test(serialized)) errors.push(`Marcador engañoso en ${product.id}`);
}

if (!/^54\d{10,13}$/u.test(site.whatsappNumber)) errors.push('Número de WhatsApp normalizado inválido.');
if (site.locale !== 'es-AR') errors.push(`Locale inesperado: ${site.locale}`);
if (site.checkoutRecovered !== false) errors.push('El checkout no debe declararse recuperado sin evidencia.');

try {
  await access('dist');
  const outputFiles = ['dist/tienda/index.html', ...products.map((product) => `dist${product.path}index.html`)];
  for (const file of outputFiles) {
    try {
      const html = await readFile(file, 'utf8');
      if (/la tienda original no contenía productos|la tienda original no contenía carrito|no existían precios verificables|catálogo informativo/iu.test(html)) {
        errors.push(`Afirmación obsoleta en salida: ${file}`);
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
  warnings,
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length) process.exitCode = 1;
