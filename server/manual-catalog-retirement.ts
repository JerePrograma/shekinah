import { parseImage, type CatalogProductDetail } from '../src/catalog/model';
import { HttpError } from './http';
import type { D1Database } from './platform';

export async function isManualCatalogRetired(database: D1Database): Promise<boolean> {
  try {
    return await database.prepare('SELECT id FROM manual_catalog_retirement WHERE id = 1').first() !== null;
  } catch (error: unknown) {
    // Compatibility during deployment before the additive migration is applied.
    if (error instanceof Error && error.message.includes('no such table: manual_catalog_retirement')) return false;
    throw error;
  }
}

export async function assertManualCatalogWritable(database: D1Database): Promise<void> {
  if (await isManualCatalogRetired(database)) {
    throw new HttpError(409, 'MANUAL_CATALOG_RETIRED', 'Los productos manuales fueron eliminados. Administrá los productos y las existencias en Dux.');
  }
}

export async function applyPreservedDuxEditorial(
  database: D1Database,
  products: readonly CatalogProductDetail[],
): Promise<readonly CatalogProductDetail[]> {
  if (products.length === 0) return products;
  const rows = await database.prepare(
    `SELECT c.cod_item, c.images_json, c.description FROM dux_editorial_content c
     JOIN dux_editorial_links l ON l.id = c.source_link_id AND l.company_id = c.company_id AND l.cod_item = c.cod_item
     WHERE c.company_id = '12862' AND l.active = 1
       AND c.cod_item IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(products.map((product) => product.sku))).all<{
    cod_item: string; images_json: string; description: string | null;
  }>();
  const byCode = new Map((rows.results ?? []).map((row) => [row.cod_item, row]));
  return Object.freeze(products.map((product) => {
    const row = product.sku === undefined ? undefined : byCode.get(product.sku);
    if (row === undefined) return product;
    const rawImages: unknown = JSON.parse(row.images_json);
    if (!Array.isArray(rawImages)) throw new Error('Contenido editorial Dux inválido.');
    const images = Object.freeze(rawImages.map((image: unknown) => parseImage(image)));
    return Object.freeze({ ...product, images,
      ...(images[0] === undefined ? {} : { primaryImage: images[0] }),
      ...(row.description === null ? {} : { description: row.description }),
    });
  }));
}

export async function isPreservedDuxImageReferenced(database: D1Database, source: string): Promise<boolean> {
  return await database.prepare(
    `SELECT 1 FROM dux_editorial_content c, json_each(c.images_json) image
     WHERE json_extract(image.value, '$.src') = ?1 LIMIT 1`,
  ).bind(source).first() !== null;
}
