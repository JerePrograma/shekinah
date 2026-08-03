import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const products = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '..', 'catalog', 'internal', 'catalog-index.json'),
  'utf8',
));
if (!Array.isArray(products) || products.length !== 510) {
  throw new Error(`Se esperaban 510 productos y se obtuvieron ${Array.isArray(products) ? products.length : 'datos inválidos'}.`);
}

const units = '(?:kg|kgs?|kilogramos?|kilos?|g|gr|grs|gramos?)';
const coverage = { presentation: 0, name: 0, unknown: 0, conflicts: 0 };
for (const product of products) {
  if (product === null || typeof product !== 'object' || Array.isArray(product) || typeof product.name !== 'string') {
    throw new Error('El catálogo contiene un producto inválido para auditar pesos.');
  }
  const presentationWeight = typeof product.presentation === 'string'
    ? parseExactWeight(product.presentation)
    : null;
  const nameWeight = parseWeightFromName(product.name);
  if (typeof product.presentation === 'string') {
    if (presentationWeight === null) coverage.unknown += 1;
    else coverage.presentation += 1;
    if (presentationWeight !== null && nameWeight !== null && presentationWeight !== nameWeight) {
      coverage.conflicts += 1;
    }
  } else if (nameWeight !== null) coverage.name += 1;
  else coverage.unknown += 1;
}

if (coverage.presentation + coverage.name + coverage.unknown !== products.length) {
  throw new Error('La cobertura de pesos no coincide con el catálogo.');
}
console.log(JSON.stringify({ products: products.length, ...coverage }));

function parseExactWeight(value) {
  const match = new RegExp(`^(?:x\\s*)?(\\d+(?:[.,]\\d{1,3})?)\\s*(${units})\\.?$`, 'iu')
    .exec(value.normalize('NFKC').trim());
  return match === null ? null : toGrams(match[1], match[2]);
}
function parseWeightFromName(value) {
  const normalized = value.normalize('NFKC').trim();
  if (new RegExp(`\\b\\d+\\s*[x×]\\s*\\d+(?:[.,]\\d{1,3})?\\s*${units}\\b`, 'iu').test(normalized)) return null;
  const matches = [...normalized.matchAll(new RegExp(`(?:^|[\\s(,;/-])(?:x\\s*)?(\\d+(?:[.,]\\d{1,3})?)\\s*(${units})\\.?(?=$|[\\s),;/-])`, 'giu'))];
  return matches.length === 1 ? toGrams(matches[0]?.[1], matches[0]?.[2]) : null;
}
function toGrams(rawAmount, rawUnit) {
  if (rawAmount === undefined || rawUnit === undefined) return null;
  const amount = Number(rawAmount.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const grams = rawUnit.toLocaleLowerCase('es-AR').startsWith('k') ? amount * 1_000 : amount;
  const rounded = Math.round(grams);
  return Number.isSafeInteger(rounded) && rounded > 0 && Math.abs(grams - rounded) < 0.000001 ? rounded : null;
}
