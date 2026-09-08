import { parseImage, type CatalogProductDetail } from '../src/catalog/model';
import { sha256Hex } from './crypto';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { editorialDuxIdentity } from './mercado-libre-editorial-store';
import { EDITORIAL_SELLER_ID } from './mercado-libre-editorial-policy';
import type { D1Database, Env } from './platform';
import { isRecord } from './validation';

/** A failed editorial job never changes this pointer or the inventory observation date. */
export async function applyMercadoLibreEditorial(database: D1Database, env: Env, products: readonly CatalogProductDetail[]): Promise<readonly CatalogProductDetail[]> {
  if (env.MERCADO_LIBRE_EDITORIAL_ENABLED !== 'true' || products.length === 0) return products;
  try {
    const rows = (await database.prepare(`SELECT publication.key AS code,object.hash,object.payload_json
      FROM ml_editorial_state state JOIN ml_editorial_runs run ON run.id=state.current_run_id,
      json_each(run.state_json,'$.publications') publication
      JOIN ml_editorial_objects object ON object.hash=json_extract(publication.value,'$.hash') AND object.kind='content'
      JOIN ml_editorial_links link ON link.company_id='12862' AND link.cod_item=publication.key
        AND link.status='approved' AND link.revision=json_extract(publication.value,'$.revision')
      WHERE state.id=1 AND run.status='succeeded' AND run.phase='complete'
        AND publication.key IN (SELECT value FROM json_each(?1))`)
      .bind(JSON.stringify(products.map(product => product.sku))).all<{code: string; hash: string; payload_json: string}>()).results ?? [];
    const snapshot = await readDuxCatalogSnapshot(database);
    const items = new Map(snapshot.items.map(item => [item.code, item]));
    const byCode = new Map<string, { images: ReturnType<typeof parseImage>[]; description: string | null }>();
    for (const row of rows) {
      if (await sha256Hex(row.payload_json) !== row.hash) continue;
      const value: unknown = JSON.parse(row.payload_json), item = items.get(row.code);
      if (!isRecord(value) || value.sellerId !== EDITORIAL_SELLER_ID || value.code !== row.code || !Array.isArray(value.images) || item === undefined ||
        JSON.stringify(value.duxIdentity) !== JSON.stringify(editorialDuxIdentity(item))) continue;
      const images = value.images.map((image: unknown) => parseImage(image));
      if (images.some(image => !image.src.startsWith('/api/catalog-images/'))) continue;
      const description = isRecord(value.description) && typeof value.description.text === 'string' && value.description.text.trim() !== '' ? value.description.text : null;
      byCode.set(row.code, { images, description });
    }
    return products.map(product => {
      const editorial = byCode.get(product.sku ?? '');
      if (editorial === undefined) return product;
      return Object.freeze({ ...product,
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
