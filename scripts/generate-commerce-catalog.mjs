import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourcePath = join(projectRoot, 'catalog', 'internal', 'catalog-index.json');
const outputPath = join(projectRoot, 'server', 'generated', 'catalog.json');
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(source) || source.length === 0) {
  throw new Error('El catálogo canónico interno no es un arreglo válido.');
}

const ids = new Set();
const generated = source.map((product, index) => {
  if (product === null || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error(`Producto ${index} inválido en el catálogo canónico.`);
  }
  const {
    id,
    name,
    price,
    salePrice,
    presentation,
    sku,
  } = product;
  if (
    typeof id !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(id) ||
    ids.has(id) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    name.length > 300 ||
    !isArsPrice(price) ||
    (salePrice !== undefined && !isArsPrice(salePrice)) ||
    (presentation !== undefined &&
      (typeof presentation !== 'string' || presentation.length > 160)) ||
    (sku !== undefined && (typeof sku !== 'string' || sku.length > 160))
  ) {
    throw new Error(`Producto ${index} inválido para comercio.`);
  }

  ids.add(id);
  const effectivePrice = salePrice ?? price;
  const unitPriceMinor = Math.round(effectivePrice.amount * 100);
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0) {
    throw new Error(`Precio fuera de rango para ${id}.`);
  }

  return {
    id,
    name,
    ...(presentation === undefined ? {} : { presentation }),
    ...(sku === undefined ? {} : { sku }),
    unitPriceMinor,
    // Este artefacto conserva únicamente precio e identidad para compatibilidad
    // interna. Nunca puede habilitar ventas: la disponibilidad sólo nace del
    // snapshot Dux servido en runtime.
    available: false,
  };
});

generated.sort((left, right) => left.id.localeCompare(right.id, 'en'));
mkdirSync(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, outputPath);
console.log(`Catálogo de Functions generado: ${generated.length} productos.`);

function isArsPrice(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.currency !== 'ARS' || typeof value.amount !== 'number') return false;
  const scaled = value.amount * 100;
  return (
    Number.isFinite(value.amount) &&
    value.amount > 0 &&
    Number.isSafeInteger(Math.round(scaled)) &&
    Math.abs(scaled - Math.round(scaled)) <= 0.000001
  );
}
