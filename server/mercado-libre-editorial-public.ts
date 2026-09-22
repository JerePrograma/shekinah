import { parseImage, type CatalogProductDetail } from '../src/catalog/model';
import { sha256Hex } from './crypto';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { editorialDuxIdentity, editorialSourceIdentity, type EditorialItemObject, type EditorialLink } from './mercado-libre-editorial-store';
import { admittedEditorialStatus, EDITORIAL_SELLER_ID, parseEditorialTitle } from './mercado-libre-editorial-policy';
import type { D1Database, Env } from './platform';
import { isRecord } from './validation';

/** A failed editorial job never changes this pointer or the inventory observation date. */
export async function applyMercadoLibreEditorial(database: D1Database, env: Env, products: readonly CatalogProductDetail[]): Promise<readonly CatalogProductDetail[]> {
  if (env.MERCADO_LIBRE_EDITORIAL_ENABLED !== 'true' || products.length === 0) return products;
  try {
    const rows = (await database.prepare(`SELECT publication.key AS code,object.hash,object.payload_json,
      link.*,source.hash AS source_hash,source.payload_json AS source_payload_json
      FROM ml_editorial_state state JOIN ml_editorial_runs run ON run.id=state.current_run_id,
      json_each(run.state_json,'$.publications') publication
      JOIN ml_editorial_objects object ON object.hash=json_extract(publication.value,'$.hash') AND object.kind='content'
      JOIN ml_editorial_links link ON link.company_id='12862' AND link.cod_item=publication.key
        AND link.status='approved' AND link.revision=json_extract(publication.value,'$.revision')
      JOIN ml_editorial_objects source ON source.kind='item'
        AND source.hash=json_extract(run.state_json,'$.itemHashes.' || link.item_id)
      WHERE state.id=1 AND run.status='succeeded' AND run.phase='complete'
        AND publication.key IN (SELECT value FROM json_each(?1))`)
      .bind(JSON.stringify(products.map(product => product.sku))).all<EditorialLink & {
        code: string; hash: string; payload_json: string; source_hash: string; source_payload_json: string;
      }>()).results ?? [];
    const snapshot = await readDuxCatalogSnapshot(database);
    const items = new Map(snapshot.items.map(item => [item.code, item]));
    const byCode = new Map<string, { title: string | null; images: ReturnType<typeof parseImage>[]; description: string | null }>();
    for (const row of rows) {
      if (await sha256Hex(row.payload_json) !== row.hash || await sha256Hex(row.source_payload_json) !== row.source_hash) continue;
      const value: unknown = JSON.parse(row.payload_json), item = items.get(row.code);
      if (!isRecord(value) || value.sellerId !== EDITORIAL_SELLER_ID || value.code !== row.code || !Array.isArray(value.images) || item === undefined ||
        JSON.stringify(value.duxIdentity) !== JSON.stringify(editorialDuxIdentity(item)) ||
        JSON.stringify(value.duxIdentity) !== row.dux_identity_json || value.revision !== row.revision ||
        value.itemId !== row.item_id || (value.variationId ?? '') !== row.variation_id || value.sourceIdentity !== row.source_identity_json) continue;
      // Read the verified metadata of this complete run, including historical content without a title.
      const source = JSON.parse(row.source_payload_json) as EditorialItemObject;
      if (source.sellerId !== EDITORIAL_SELLER_ID || source.itemId !== row.item_id || !admittedEditorialStatus(source.status)) continue;
      const unit = source.units.find(unit => unit.itemId === row.item_id && (unit.variationId ?? '') === row.variation_id);
      if (unit === undefined || !admittedEditorialStatus(unit.status) || editorialSourceIdentity(unit) !== row.source_identity_json) continue;
      const title = value.title === undefined ? null : parseEditorialTitle(value.title);
      if (title !== null && title !== unit.title) continue;
      const images = row.images_approved === 1 ? value.images.map((image: unknown) => parseImage(image)) : [];
      if (images.some(image => !image.src.startsWith('/api/catalog-images/'))) continue;
      const description = row.description_approved === 1 && isRecord(value.description) && typeof value.description.text === 'string' && value.description.text.trim() !== '' ? value.description.text : null;
      byCode.set(row.code, { title, images, description });
    }
    return products.map(product => {
      const editorial = byCode.get(product.sku ?? '');
      if (editorial === undefined || product.commerce?.source !== 'dux' || product.id !== items.get(product.sku ?? '')?.slug) return product;
      return Object.freeze({ ...product,
        ...(editorial.title === null ? {} : { name: editorial.title }),
        ...(editorial.images.length === 0 ? {} : { images: Object.freeze(editorial.images), primaryImage: editorial.images[0]! }),
        ...(editorial.description === null ? {} : { description: editorial.description }) });
    });
  } catch {
    console.warn('ml_editorial_publication_unavailable', { preservedLocalContent: true });
    return products;
  }
}

export async function isMercadoLibreEditorialImageReferenced(database: D1Database, source: string): Promise<boolean> {
  try { return await database.prepare(`SELECT 1 FROM ml_editorial_objects object,json_each(object.payload_json,'$.images') image
    WHERE object.kind='content' AND json_extract(image.value,'$.src')=?1 LIMIT 1`).bind(source).first() !== null; }
  catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table: ml_editorial_objects')) return false;
    throw error;
  }
}
