import { HttpError } from './http';

export const EDITORIAL_SELLER_ID = '445638367';
export const EDITORIAL_DESCRIPTION_TRANSFORM = 'ml-commerce-lines-v1';
export type EditorialPicture = Readonly<{ id: string; url: string }>;
export type EditorialUnit = Readonly<{
  itemId: string; variationId: string | null; title: string; status: string;
  sku: string | null; barcodes: readonly string[]; attributes: readonly Readonly<{ id: string; value: string }>[];
  pictures: readonly EditorialPicture[];
}>;
export type EditorialDescription = Readonly<{
  original: string; text: string | null; transform: typeof EDITORIAL_DESCRIPTION_TRANSFORM;
  removedLines: readonly number[]; reviewLines: readonly number[];
}>;

export function admittedEditorialStatus(status: string): boolean {
  return status === 'active' || status === 'paused';
}

/** Metadata never imports prices, inventory, seller contact or payment fields. */
export function parseEditorialItem(value: unknown): readonly EditorialUnit[] {
  if (!record(value) || identifier(value.seller_id) !== EDITORIAL_SELLER_ID || value.site_id !== 'MLA') {
    throw new HttpError(502, 'ML_EDITORIAL_SELLER_MISMATCH', 'La publicación no pertenece al vendedor autorizado.');
  }
  const itemId = text(value.id, 30);
  if (!/^MLA\d{5,25}$/u.test(itemId)) throw invalid();
  const title = text(value.title, 500);
  const status = text(value.status, 40);
  if (!/^[a-z_]+$/u.test(status)) throw invalid();
  const attributes = parseAttributes(value.attributes);
  const pictures = parsePictures(value.pictures);
  if (!Array.isArray(value.variations) || value.variations.length > 1000) throw invalid();
  const base = { itemId, title, status };
  if (value.variations.length === 0) return Object.freeze([Object.freeze({ ...base,
    variationId: null, attributes, sku: sku(attributes, value.seller_custom_field),
    barcodes: barcodes(attributes), pictures: uniquePictures(pictures),
  })]);
  const seen = new Set<string>();
  return Object.freeze(value.variations.map((variation: unknown) => {
    if (!record(variation)) throw invalid();
    const variationId = identifier(variation.id);
    if (variationId === null || seen.has(variationId)) throw invalid();
    seen.add(variationId);
    const ownAttributes = parseAttributes(variation.attributes);
    const combinations = parseAttributes(variation.attribute_combinations);
    const merged = Object.freeze([...attributes.filter(a => !ownAttributes.some(v => v.id === a.id)), ...ownAttributes, ...combinations]);
    if (!Array.isArray(variation.picture_ids) || variation.picture_ids.length > 64) throw invalid();
    const pictureIds = variation.picture_ids.map((id: unknown) => text(id, 120));
    const applicable = pictureIds.map(id => {
      const picture = pictures.find(p => p.id === id);
      if (picture === undefined) throw invalid();
      return picture;
    });
    // A parent's SKU/GTIN does not identify a particular variation.
    return Object.freeze({ ...base, variationId, attributes: merged,
      sku: sku(ownAttributes, variation.seller_custom_field), barcodes: barcodes(ownAttributes),
      pictures: uniquePictures(applicable),
    });
  }));
}

export function validateEditorialImageUrl(value: unknown): string {
  const raw = text(value, 2048);
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' ||
    url.search !== '' || url.hash !== '' ||
    !(url.hostname === 'http2.mlstatic.com' || /^mla-s[12]-p\.mlstatic\.com$/u.test(url.hostname)) ||
    !/^\/[A-Za-z0-9_-]{5,200}\.(?:jpg|jpeg|png|webp)$/u.test(url.pathname)) throw invalid();
  return raw;
}

export function transformEditorialDescription(original: string): EditorialDescription {
  if (original.length > 100_000 || original.includes(String.fromCharCode(0))) throw invalid();
  const lines = original.replace(/\r\n?/gu, '\n').split('\n');
  const removedLines: number[] = [], reviewLines: number[] = [];
  const commercialOnly = [
    /^(?:aceptamos|pod[eé]s pagar (?:con|por)|pag[aá] (?:con|por)|medios de pago:?|pagos (?:con|por):?)\s+mercado\s*pago[.!]?$/iu,
    /^(?:hacemos |realizamos )?env[ií]os (?:a todo el pa[ií]s )?(?:por|con|a trav[eé]s de) mercado\s*env[ií]os[.!]?$/iu,
    /^compr[aá] (?:por|a trav[eé]s de) mercado\s*libre[.!]?$/iu,
  ];
  const kept = lines.filter((line, index) => {
    const normalized = line.trim();
    if (commercialOnly.some(pattern => pattern.test(normalized))) { removedLines.push(index + 1); return false; }
    if (/mercado\s*(?:libre|pago|env[ií]os)|mercadolibre\.|mercadopago\.|\bwhatsapp\b/iu.test(normalized)) reviewLines.push(index + 1);
    return true;
  });
  const text = kept.join('\n').trim();
  return Object.freeze({ original, text: reviewLines.length === 0 && text !== '' ? text : null,
    transform: EDITORIAL_DESCRIPTION_TRANSFORM, removedLines: Object.freeze(removedLines), reviewLines: Object.freeze(reviewLines) });
}

export type EditorialDuxIdentity = Readonly<{ code: string; barcodes: readonly string[] }>;
export type EditorialCandidate = Readonly<{ code: string; itemId: string; variationId: string | null;
  method: 'exact_sku' | 'exact_barcode'; unique: boolean; state: 'pending_review'; }>;

/** Exact identifiers suggest candidates. Human review must establish pack/presentation/variant. */
export function editorialCandidates(dux: readonly EditorialDuxIdentity[], units: readonly EditorialUnit[]): readonly EditorialCandidate[] {
  const candidates: EditorialCandidate[] = [];
  const admitted = units.filter(unit => admittedEditorialStatus(unit.status));
  const duxCodes = indexValues(dux, item => [item.code]), duxBarcodes = indexValues(dux, item => item.barcodes);
  const unitSkus = indexValues(admitted, unit => unit.sku === null ? [] : [unit.sku]);
  const unitBarcodes = indexValues(admitted, unit => unit.barcodes);
  for (const unit of admitted) {
    const skuMatches = unit.sku === null ? [] : duxCodes.get(unit.sku) ?? [];
    const matched = new Set([...skuMatches, ...unit.barcodes.flatMap(code => duxBarcodes.get(code) ?? [])]);
    for (const item of matched) {
      const exactSku = skuMatches.includes(item);
      const unique = matched.size === 1 && (exactSku
        ? skuMatches.length === 1 && unitSkus.get(unit.sku ?? '')?.length === 1
        : unit.barcodes.some(code => item.barcodes.includes(code) && duxBarcodes.get(code)?.length === 1 && unitBarcodes.get(code)?.length === 1));
      candidates.push(Object.freeze({ code: item.code, itemId: unit.itemId, variationId: unit.variationId,
        method: exactSku ? 'exact_sku' : 'exact_barcode', unique, state: 'pending_review' }));
    }
  }
  return Object.freeze(candidates);
}

function indexValues<T>(values: readonly T[], keys: (value: T) => readonly string[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const value of values) for (const key of new Set(keys(value))) {
    const entries = index.get(key) ?? []; entries.push(value); index.set(key, entries);
  }
  return index;
}

function parseAttributes(value: unknown): readonly Readonly<{ id: string; value: string }>[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 300) throw invalid();
  const attributes: { id: string; value: string }[] = [];
  for (const entry of value as unknown[]) {
    if (!record(entry)) throw invalid();
    const id = text(entry.id, 100);
    if (entry.value_name === null || entry.value_name === undefined || entry.value_name === '') continue;
    attributes.push(Object.freeze({ id, value: text(entry.value_name, 2000) }));
  }
  return Object.freeze(attributes);
}
function sku(attributes: readonly Readonly<{ id: string; value: string }>[], fallback: unknown): string | null {
  const candidates = [...new Set(attributes.filter(a => a.id === 'SELLER_SKU').map(a => a.value))];
  const custom = fallback === undefined || fallback === null || fallback === '' ? null : text(fallback, 300);
  if (candidates.length > 1 || (custom !== null && candidates.length === 1 && candidates[0] !== custom)) return null;
  return candidates[0] ?? custom;
}
function barcodes(attributes: readonly Readonly<{ id: string; value: string }>[]): readonly string[] {
  return Object.freeze([...new Set(attributes.filter(a => ['GTIN', 'EAN', 'UPC'].includes(a.id) && /^\d{8,14}$/u.test(a.value)).map(a => a.value))]);
}
function parsePictures(value: unknown): readonly EditorialPicture[] {
  if (!Array.isArray(value) || value.length > 64) throw invalid();
  const pictures = value.map((entry: unknown) => {
    if (!record(entry)) throw invalid();
    return Object.freeze({ id: text(entry.id, 120), url: validateEditorialImageUrl(entry.secure_url) });
  });
  uniquePictures(pictures); // Validate conflicting IDs before resolving variation aliases.
  return Object.freeze(pictures);
}
function uniquePictures(pictures: readonly EditorialPicture[]): readonly EditorialPicture[] {
  const byId = new Map<string, string>(), urls = new Set<string>();
  const result: EditorialPicture[] = [];
  for (const picture of pictures) {
    if (byId.has(picture.id) && byId.get(picture.id) !== picture.url) throw invalid();
    byId.set(picture.id, picture.url);
    if (urls.has(picture.url)) continue;
    urls.add(picture.url); result.push(picture);
  }
  return Object.freeze(result);
}
function identifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^[1-9]\d{0,29}$/u.test(value) ? value : null;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum || [...value].some(character => character.charCodeAt(0)<32)) throw invalid();
  return value.trim();
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function invalid(): HttpError { return new HttpError(502, 'ML_EDITORIAL_DATA_INVALID', 'Mercado Libre devolvió contenido editorial no válido.'); }
