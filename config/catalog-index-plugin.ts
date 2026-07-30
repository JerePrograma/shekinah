import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

const publicModuleId = 'virtual:shekinah-catalog-index';
const resolvedModuleId = `\0${publicModuleId}`;
const internalIndexPath = path.resolve(
  import.meta.dirname,
  '..',
  'catalog',
  'internal',
  'catalog-index.json',
);

function buildPublicCatalogIndex(): readonly Record<string, unknown>[] {
  const source: unknown = JSON.parse(readFileSync(internalIndexPath, 'utf8'));

  if (!Array.isArray(source)) {
    throw new Error('El índice interno del catálogo debe ser una colección.');
  }

  return source.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('El índice interno contiene un producto inválido.');
    }

    const { capturedAt, ...product } = value as Record<string, unknown>;
    if (capturedAt !== '2026-07-23') {
      throw new Error('La fecha interna de integridad del catálogo no coincide.');
    }

    return product;
  });
}

export function catalogIndexPlugin(): Plugin {
  return {
    name: 'shekinah-public-catalog-index',
    resolveId(id) {
      return id === publicModuleId ? resolvedModuleId : null;
    },
    load(id) {
      if (id !== resolvedModuleId) {
        return null;
      }

      return `export default ${JSON.stringify(buildPublicCatalogIndex())};`;
    },
  };
}
