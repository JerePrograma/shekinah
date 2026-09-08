import { sha256Hex } from './crypto';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { requireVerifiedDuxCatalogTenant } from './dux-catalog-control';
import { HttpError } from './http';
import type { EditorialUnit } from './mercado-libre-editorial-policy';
import type { D1Database } from './platform';
import { assertExactKeys, isRecord } from './validation';

export const ML_EDITORIAL_MAX_ITEMS = 2000;
export const ML_EDITORIAL_MAX_UNITS = 3000;
export const ML_EDITORIAL_MAX_STATE_BYTES = 1_000_000;
export function readEditorialRunId(value: unknown): string | null {
  if (!isRecord(value)) throw editorialError('ML_EDITORIAL_RUN_INVALID', 400);
  assertExactKeys(value, ['runId']);
  if (value.runId === undefined || value.runId === null) return null;
  if (typeof value.runId !== 'string' || !/^ml_editorial_[a-f0-9-]{36}$/u.test(value.runId)) throw editorialError('ML_EDITORIAL_RUN_INVALID', 400);
  return value.runId;
}
export type EditorialLink = Readonly<{
  cod_item: string; item_id: string; variation_id: string; status: string; revision: number;
  dux_identity_json: string; source_identity_json: string; evidence_hash: string;
  images_approved: number; description_approved: number; method: string; reason: string;
  decided_by: string; decided_at: string;
}>;
export type EditorialItemObject = Readonly<{ itemId: string; sellerId: string; status: string; units: readonly EditorialUnit[] }>;
export type EditorialRunState = {
  schemaVersion: 1; searchStatus: number; scroll: string | null; total: number | null; seen: number;
  ids: string[]; metadataQueue: string[]; metadataOffset: number; itemHashes: Record<string, string>; unitCount: number;
  links: { code: string; revision: number }[]; contentOffset: number;
  work: null | { code: string; revision: number; pictureOffset: number; images: ImportedEditorialImage[];
    description: null | { original: string; text: string | null; transform: string; removedLines: readonly number[]; reviewLines: readonly number[] } };
  publications: Record<string, { hash: string; revision: number }>;
  issues: { code: string; reason: string }[];
};
export type ImportedEditorialImage = Readonly<{
  src: string; alt: string; providerPictureId: string; providerUrl: string; sha256: string; bytes: number; contentType: string;
}>;
export type EditorialRunRow = Readonly<{
  id: string; actor: string; status: 'running' | 'succeeded' | 'failed';
  phase: 'search' | 'metadata' | 'content' | 'publish' | 'complete'; state_json: string; revision: number;
  lease_owner: string | null; lease_until: string | null; started_at: string; updated_at: string;
  completed_at: string | null; error_code: string | null;
}>;

export function initialEditorialState(links: readonly EditorialLink[]): EditorialRunState {
  return { schemaVersion: 1, searchStatus: 0, scroll: null, total: null, seen: 0, ids: [],
    metadataQueue: [], metadataOffset: 0, itemHashes: {}, unitCount: 0,
    links: links.map(link => ({ code: link.cod_item, revision: link.revision })), contentOffset: 0,
    work: null, publications: {}, issues: [] };
}

export function parseEditorialState(text: string): EditorialRunState {
  if (new TextEncoder().encode(text).byteLength > ML_EDITORIAL_MAX_STATE_BYTES) throw editorialError('ML_EDITORIAL_STATE_LIMIT');
  const state = JSON.parse(text) as EditorialRunState;
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.ids) || state.ids.length > ML_EDITORIAL_MAX_ITEMS ||
    !Array.isArray(state.metadataQueue) || state.metadataQueue.length > ML_EDITORIAL_MAX_ITEMS * 2 ||
    !Array.isArray(state.links) || !Array.isArray(state.issues) || typeof state.itemHashes !== 'object' || state.itemHashes === null ||
    typeof state.publications !== 'object' || state.publications === null ||
    !Number.isSafeInteger(state.metadataOffset) || !Number.isSafeInteger(state.contentOffset) ||
    !Number.isSafeInteger(state.searchStatus) || state.searchStatus < 0 || state.searchStatus > 2 ||
    state.ids.some(id => !/^MLA\d{5,25}$/u.test(id)) || new Set(state.ids).size !== state.ids.length ||
    state.metadataOffset < 0 || state.metadataOffset > state.metadataQueue.length || state.contentOffset < 0 || state.contentOffset > state.links.length ||
    !Number.isSafeInteger(state.seen) || state.seen < 0 || !Number.isSafeInteger(state.unitCount) || state.unitCount < 0 || state.unitCount > ML_EDITORIAL_MAX_UNITS ||
    (state.total !== null && (!Number.isSafeInteger(state.total) || state.total < state.seen || state.total > ML_EDITORIAL_MAX_ITEMS)) ||
    (state.scroll !== null && (typeof state.scroll !== 'string' || state.scroll.length > 4096)) ||
    state.metadataQueue.some(id => typeof id !== 'string' || !/^MLA\d{5,25}$/u.test(id)) || new Set(state.metadataQueue).size !== state.metadataQueue.length ||
    state.links.length > ML_EDITORIAL_MAX_ITEMS || state.links.some(link => !link || typeof link.code !== 'string' || !link.code || !Number.isSafeInteger(link.revision) || link.revision < 1) ||
    new Set(state.links.map(link => link.code)).size !== state.links.length || state.issues.length > 130_000 ||
    Array.isArray(state.itemHashes) || Array.isArray(state.publications) ||
    Object.entries(state.itemHashes).some(([id,hash]) => !/^MLA\d{5,25}$/u.test(id) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) ||
    Object.values(state.publications).some(value => !value || typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(value.hash) || !Number.isSafeInteger(value.revision) || value.revision < 1) ||
    (state.work !== null && (!state.work || typeof state.work.code !== 'string' || !Number.isSafeInteger(state.work.pictureOffset) || state.work.pictureOffset < 0 || state.work.pictureOffset > 64 || !Array.isArray(state.work.images) || state.work.images.length > 64))) throw editorialError('ML_EDITORIAL_STATE_INVALID');
  return state;
}

export function serializeEditorialState(state: EditorialRunState): string {
  const text = JSON.stringify(state); parseEditorialState(text); return text;
}

export async function storeEditorialObject(database: D1Database, kind: 'item' | 'content', value: unknown, now: string): Promise<string> {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > 250_000) throw editorialError('ML_EDITORIAL_OBJECT_LIMIT');
  const hash = await sha256Hex(text);
  await database.prepare('INSERT OR IGNORE INTO ml_editorial_objects (hash,kind,payload_json,created_at) VALUES (?1,?2,?3,?4)')
    .bind(hash, kind, text, now).run();
  return hash;
}

export async function readEditorialObject<T>(database: D1Database, hash: string, kind: 'item' | 'content'): Promise<T> {
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw editorialError('ML_EDITORIAL_OBJECT_INVALID');
  const row = await database.prepare('SELECT payload_json FROM ml_editorial_objects WHERE hash=?1 AND kind=?2')
    .bind(hash, kind).first<{ payload_json: string }>();
  if (row === null || await sha256Hex(row.payload_json) !== hash) throw editorialError('ML_EDITORIAL_OBJECT_INVALID');
  return JSON.parse(row.payload_json) as T;
}

export async function listEditorialLinks(database: D1Database): Promise<readonly EditorialLink[]> {
  return (await database.prepare("SELECT * FROM ml_editorial_links WHERE company_id='12862' AND status='approved' ORDER BY cod_item")
    .all<EditorialLink>()).results ?? [];
}

export async function currentEditorialRun(database: D1Database): Promise<EditorialRunRow | null> {
  return database.prepare('SELECT run.* FROM ml_editorial_state state JOIN ml_editorial_runs run ON run.id=state.current_run_id WHERE state.id=1 AND run.status=\'succeeded\' AND run.phase=\'complete\'').first<EditorialRunRow>();
}

export async function requireEditorialDuxIdentity(database: D1Database, code: string): Promise<ReturnType<typeof editorialDuxIdentity>> {
  await requireVerifiedDuxCatalogTenant(database);
  const snapshot = await readDuxCatalogSnapshot(database);
  const item = snapshot.items.find(item => item.code === code);
  if (item === undefined) throw new HttpError(409, 'ML_EDITORIAL_DUX_PRODUCT_MISSING', 'El producto no existe en el catálogo Dux vigente.');
  return editorialDuxIdentity(item);
}

export function editorialDuxIdentity(item: Awaited<ReturnType<typeof readDuxCatalogSnapshot>>['items'][number]) {
  const entries = (item.warehouseStocks ?? []).map(row => ({
    variantId: row.variantId, barcode: row.barcode, size: row.size, color: row.color,
  }));
  const byId = new Map(entries.map(row => [row.variantId, row]));
  if (entries.some(row => JSON.stringify(row) !== JSON.stringify(byId.get(row.variantId)))) throw editorialError('ML_EDITORIAL_DUX_VARIANT_AMBIGUOUS', 409);
  const variants = [...byId.values()].sort((a,b) => (a.variantId ?? -1) - (b.variantId ?? -1));
  return { code: item.code, name: item.name, unitsPerPackage: item.unitsPerPackage, variants };
}

export function editorialSourceIdentity(unit: EditorialUnit): string {
  return JSON.stringify({ itemId: unit.itemId, variationId: unit.variationId, title: unit.title,
    sku: unit.sku, barcodes: unit.barcodes, attributes: unit.attributes });
}

export function editorialError(code: string, status = 502): HttpError {
  return new HttpError(status, code, 'No se pudo completar la actualización editorial. Se conserva la última publicación válida.');
}
