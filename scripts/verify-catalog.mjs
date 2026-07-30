#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const internalIndexPath = path.join(
  projectRoot,
  'catalog',
  'internal',
  'catalog-index.json',
);
const temporaryIndexPath = path.join(
  projectRoot,
  'src',
  'catalog-data',
  'catalog-index.json',
);
const manifestPath = path.join(projectRoot, 'catalog', 'catalog-manifest.json');

if (!existsSync(internalIndexPath) || existsSync(temporaryIndexPath)) {
  throw new Error('La separación entre índice interno y datos públicos no es válida.');
}

const indexText = readFileSync(internalIndexPath, 'utf8');
const manifestText = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.outputs?.index?.path !== 'catalog/internal/catalog-index.json') {
  throw new Error('El manifiesto no declara el índice interno esperado.');
}

const temporaryManifest = structuredClone(manifest);
temporaryManifest.outputs.index.path = 'src/catalog-data/catalog-index.json';

try {
  writeFileSync(temporaryIndexPath, indexText, 'utf8');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(temporaryManifest, null, 2)}\n`,
    'utf8',
  );
  await import('./verify-catalog-core.mjs');
} finally {
  rmSync(temporaryIndexPath, { force: true });
  writeFileSync(manifestPath, manifestText, 'utf8');
}

const internalProducts = JSON.parse(indexText);
if (!Array.isArray(internalProducts) || internalProducts.length !== 510) {
  throw new Error('El índice interno no contiene los 510 productos.');
}
const publicProducts = internalProducts.map((value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('El índice interno contiene un producto inválido.');
  }
  const { capturedAt, ...product } = value;
  if (capturedAt !== '2026-07-23') {
    throw new Error('La marca interna de integridad no coincide.');
  }
  return product;
});
if (publicProducts.some((product) => Object.hasOwn(product, 'capturedAt'))) {
  throw new Error('El modelo comercial público conserva metadatos internos.');
}
if (existsSync(temporaryIndexPath)) {
  throw new Error('El índice interno quedó expuesto bajo src.');
}

console.log(
  'Separación de catálogo verificada: 510 productos públicos sin metadatos internos.',
);
