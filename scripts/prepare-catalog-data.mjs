#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const generatedIndexPath = path.join(
  projectRoot,
  'src',
  'catalog-data',
  'catalog-index.json',
);
const internalRoot = path.join(projectRoot, 'catalog', 'internal');
const internalIndexPath = path.join(internalRoot, 'catalog-index.json');
const manifestPath = path.join(projectRoot, 'catalog', 'catalog-manifest.json');

await import('./prepare-catalog-data-core.mjs');

const [indexText, manifestText] = await Promise.all([
  readFile(generatedIndexPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
]);
const products = JSON.parse(indexText);
if (
  !Array.isArray(products) ||
  products.length !== 510 ||
  products.some((product) => product?.capturedAt !== '2026-07-23')
) {
  throw new Error('El índice interno generado no cumple el contrato de integridad.');
}

const manifest = JSON.parse(manifestText);
if (manifest.outputs?.index?.path !== 'src/catalog-data/catalog-index.json') {
  throw new Error('La salida temporal del índice no coincide con el generador base.');
}
manifest.outputs.index.path = 'catalog/internal/catalog-index.json';

await mkdir(internalRoot, { recursive: true });
await Promise.all([
  writeFile(internalIndexPath, indexText, 'utf8'),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
]);
await rm(generatedIndexPath, { force: true });

process.stdout.write(
  'Índice comercial separado: metadatos internos fuera de src y de dist.\n',
);
