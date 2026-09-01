import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = JSON.parse(
  readFileSync(join(projectRoot, 'catalog', 'internal', 'catalog-index.json'), 'utf8'),
);
const generated = JSON.parse(
  readFileSync(join(projectRoot, 'server', 'generated', 'catalog.json'), 'utf8'),
);

if (!Array.isArray(source) || !Array.isArray(generated)) {
  throw new Error('Los catálogos no son arreglos válidos.');
}
if (generated.length !== source.length) {
  throw new Error(`Divergencia de catálogo: fuente=${source.length}, Functions=${generated.length}.`);
}

const sourceById = new Map(source.map((product) => [product.id, product]));
const generatedIds = new Set();
let previousId = '';
for (const product of generated) {
  if (product === null || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('El catálogo de Functions contiene una entrada inválida.');
  }
  const keys = Object.keys(product).sort();
  const allowed = ['available', 'id', 'name', 'presentation', 'sku', 'unitPriceMinor'];
  if (keys.some((key) => !allowed.includes(key))) {
    throw new Error(
      `El catálogo de Functions publica campos no autorizados en ${product.id ?? 'desconocido'}.`,
    );
  }
  if (typeof product.id !== 'string' || generatedIds.has(product.id)) {
    throw new Error(`ID generado inválido o duplicado: ${String(product.id)}.`);
  }
  if (previousId !== '' && previousId.localeCompare(product.id, 'en') >= 0) {
    throw new Error('El catálogo de Functions no está ordenado de forma determinista por ID.');
  }
  previousId = product.id;
  generatedIds.add(product.id);

  const canonical = sourceById.get(product.id);
  if (canonical === undefined) throw new Error(`Producto generado inexistente: ${product.id}.`);
  const effectivePrice = canonical.salePrice ?? canonical.price;
  const expectedMinor = Math.round(effectivePrice.amount * 100);
  if (
    product.name !== canonical.name ||
    product.presentation !== canonical.presentation ||
    product.sku !== canonical.sku ||
    product.unitPriceMinor !== expectedMinor ||
    product.available !== false
  ) {
    throw new Error(`Divergencia en el producto ${product.id}.`);
  }
}

console.log(
  `Catálogo comercial verificado: ${generated.length} productos, precio efectivo y disponibilidad estática bloqueada.`,
);
