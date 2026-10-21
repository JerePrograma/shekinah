import { parseImage, type CatalogProductDetail, type ProductImage } from '../src/catalog/model';
import { HttpError } from './http';
import type { D1Database } from './platform';
import { isRecord } from './validation';

export type PublicationStatus = 'published' | 'unpublished';
type Settings = Readonly<{ cod_item: string; publication_status: PublicationStatus; description: string | null; images_json: string | null; name_override?: string | null }>;
export type DuxProductWebPatch = Readonly<{ name?: string | null; description?: string; publicationStatus?: PublicationStatus }>;

export function parseDuxProductWebPatch(value: unknown): DuxProductWebPatch {
  if (!isRecord(value) || Object.keys(value).length === 0 || Object.keys(value).some(key => !['name', 'description', 'publicationStatus'].includes(key)) ||
    (Object.hasOwn(value, 'name') && value.name !== null && !validManualName(value.name)) ||
    (Object.hasOwn(value, 'description') && (typeof value.description !== 'string' || value.description.length > 12000)) ||
    (Object.hasOwn(value, 'publicationStatus') && value.publicationStatus !== 'published' && value.publicationStatus !== 'unpublished')) {
    throw new HttpError(400, 'INVALID_PRODUCT_WEB_SETTINGS', 'Podés cambiar el nombre web (hasta 500 caracteres), la descripción y la publicación del producto. El stock se administra en Dux.');
  }
  return Object.freeze({ ...(typeof value.name === 'string' ? { name: value.name.trim() } : value.name === null ? { name: null } : {}),
    ...(typeof value.description === 'string' ? { description: value.description.trim() } : {}),
    ...(value.publicationStatus === 'published' || value.publicationStatus === 'unpublished' ? { publicationStatus: value.publicationStatus } : {}) });
}

export async function applyDuxProductWebSettings(database: D1Database, products: readonly CatalogProductDetail[]): Promise<readonly CatalogProductDetail[]> {
  const settings = new Map((await readSettings(database, products.flatMap(product => product.sku === undefined ? [] : [product.sku]))).map(row => [row.cod_item, row]));
  return Object.freeze(products.map(product => {
    const row = settings.get(product.sku ?? '');
    const { nameOverride: _previousOverride, ...identity } = product; void _previousOverride;
    const duxName = product.duxName ?? product.name;
    if (row?.name_override !== null && row?.name_override !== undefined && !validManualName(row.name_override)) {
      throw new HttpError(503, 'PRODUCT_WEB_SETTINGS_INVALID', 'El nombre web guardado no es válido.');
    }
    let result: CatalogProductDetail = { ...identity, duxName, name: row?.name_override ?? duxName,
      ...(row?.name_override == null ? {} : { nameOverride: row.name_override }),
      publicationStatus: row?.publication_status ?? 'published' };
    if (row?.description !== null && row?.description !== undefined) {
      const { description: _description, shortDescription: _shortDescription, ...remaining } = result;
      void _description; void _shortDescription;
      result = { ...remaining, ...(row.description === '' ? {} : { description: row.description }) };
    }
    if (row?.images_json !== null && row?.images_json !== undefined) {
      const value: unknown = JSON.parse(row.images_json);
      if (!Array.isArray(value)) throw new Error('Imágenes web no válidas.');
      const images = Object.freeze(value.map((image: unknown) => parseImage(image)));
      const { primaryImage: _image, ...remaining } = result; void _image;
      result = { ...remaining, images, ...(images[0] === undefined ? {} : { primaryImage: images[0] }) };
    }
    return Object.freeze(result);
  }));
}

export async function writeDuxProductWebSettings(database: D1Database, code: string, actor: string,
  patch: DuxProductWebPatch & Readonly<{ images?: readonly ProductImage[] }>): Promise<void> {
  const now = new Date().toISOString();
  const writesName = patch.name !== undefined;
  if (writesName && patch.name !== null && !validManualName(patch.name)) {
    throw new HttpError(400, 'INVALID_PRODUCT_WEB_SETTINGS', 'El nombre web debe tener entre 1 y 500 caracteres, sin caracteres de control.');
  }
  const values = [code, patch.publicationStatus ?? 'published', patch.description ?? null,
    patch.images === undefined ? null : JSON.stringify(patch.images), actor, now,
    patch.publicationStatus === undefined ? 0 : 1, patch.description === undefined ? 0 : 1, patch.images === undefined ? 0 : 1];
  if (writesName) values.push(patch.name?.trim() ?? null);
  try {
    await database.prepare(`INSERT INTO dux_product_web_settings
      (company_id,cod_item,publication_status,description,images_json,updated_by,created_at,updated_at${writesName ? ',name_override' : ''})
      VALUES ('12862',?1,?2,?3,?4,?5,?6,?6${writesName ? ',?10' : ''})
      ON CONFLICT(company_id,cod_item) DO UPDATE SET
        publication_status = CASE WHEN ?7 = 1 THEN excluded.publication_status ELSE dux_product_web_settings.publication_status END,
        description = CASE WHEN ?8 = 1 THEN excluded.description ELSE dux_product_web_settings.description END,
        images_json = CASE WHEN ?9 = 1 THEN excluded.images_json ELSE dux_product_web_settings.images_json END,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at${writesName ? ',name_override = excluded.name_override' : ''}`)
      .bind(...values).run();
  } catch (error: unknown) {
    if (writesName && missingNameColumn(error)) throw new HttpError(503, 'PRODUCT_WEB_NAME_MIGRATION_REQUIRED', 'El nombre web requiere aplicar la actualización 0027_dux_product_manual_name.sql.');
    if (missingSettingsTable(error)) throw new HttpError(503, 'PRODUCT_WEB_SETTINGS_MIGRATION_REQUIRED', 'La gestión web de productos requiere completar su actualización.');
    throw error;
  }
}

export async function assertDuxProductsPublished(database: D1Database, codes: readonly string[]): Promise<void> {
  if ((await readSettings(database, codes)).some(row => row.publication_status === 'unpublished')) throw unpublishedProduct();
}

export function unpublishedProduct(): HttpError {
  return new HttpError(409, 'PRODUCT_UNPUBLISHED', 'Un producto fue dado de baja de la web. Actualizá el carrito antes de continuar.');
}

export function isUnpublishedProductError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('DUX_PRODUCT_UNPUBLISHED');
}

export async function isDuxWebImageReferenced(database: D1Database, source: string): Promise<boolean> {
  try { return await database.prepare(`SELECT 1 FROM dux_product_web_settings settings,json_each(settings.images_json) image
    WHERE json_extract(image.value,'$.src') = ?1 LIMIT 1`).bind(source).first() !== null; }
  catch (error: unknown) { if (missingSettingsTable(error)) return false; throw error; }
}

async function readSettings(database: D1Database, codes: readonly string[]): Promise<readonly Settings[]> {
  if (codes.length === 0) return [];
  const read = async (withName: boolean) => (await database.prepare(`SELECT cod_item,publication_status,description,images_json${withName ? ',name_override' : ''} FROM dux_product_web_settings
    WHERE company_id = '12862' AND cod_item IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(codes)).all<Settings>()).results ?? [];
  try {
    try { return await read(true); }
    catch (error: unknown) { if (missingNameColumn(error)) return await read(false); throw error; }
  }
  catch (error: unknown) { if (missingSettingsTable(error)) return []; throw error; }
}
function missingSettingsTable(error: unknown): boolean { return error instanceof Error && error.message.includes('no such table: dux_product_web_settings'); }
function missingNameColumn(error: unknown): boolean { return error instanceof Error && /(?:no such column:|has no column named) name_override/u.test(error.message); }
function validManualName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500 && !/\p{Cc}/u.test(value);
}
