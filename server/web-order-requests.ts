import { MAX_CART_LINES, MAX_CART_QUANTITY } from '../src/commerce/contracts';
import { fulfillmentCanonicalValue, validateFulfillment } from '../src/commerce/fulfillment';
import type { WebRequestIdentity, WebRequestInput, WebRequestPublic, WebRequestReceipt, WebRequestSnapshot, WebRequestStatus } from '../src/commerce/web-order-contracts';
import { webRequestReference } from '../src/commerce/web-order-contracts';
import { hmacSha256Hex, randomToken, sha256Hex } from './crypto';
import type { DuxCatalogSnapshot } from './dux-catalog';
import { HttpError } from './http';
import type { D1Database } from './platform';
import { assertExactKeys, assertUuid, isRecord, readInteger, readSafeText } from './validation';
import { prepareWebRequestLimit, throwWebRequestStorageError } from './web-request-rate-limit';
import type { WebRequestLimit } from './web-request-rate-limit';

export type WebRequestCatalog = Pick<DuxCatalogSnapshot, 'catalogVersion' | 'items' | 'stockReadAt' | 'syncedAt'>;

type RequestRow = Readonly<{
  intent_kind: string; checkout_idempotency_key: string; web_request_id: string;
  web_request_owner_hash: string; web_request_fingerprint: string; web_request_token_hash: string;
  web_request_status: WebRequestStatus; created_at: string; web_request_updated_at: string;
}>;
const requestColumns = `intent_kind, checkout_idempotency_key, web_request_id, web_request_owner_hash,
  web_request_fingerprint, web_request_token_hash, web_request_status, created_at, web_request_updated_at`;

export function parseWebRequestIdentity(value: Record<string, unknown>): WebRequestIdentity {
  const idempotencyKey = assertUuid(value.idempotencyKey, 'idempotencyKey');
  if (typeof value.ownerSecret !== 'string' || !/^[a-f0-9]{64}$/u.test(value.ownerSecret)) {
    throw new HttpError(400, 'INVALID_REQUEST_OWNER', 'No se pudo verificar la protección de la solicitud.');
  }
  return Object.freeze({ idempotencyKey, ownerSecret: value.ownerSecret });
}

export function parseWebRequestInput(value: unknown): WebRequestInput {
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_WEB_REQUEST', 'La solicitud no es válida.');
  assertExactKeys(value, ['mode', 'idempotencyKey', 'ownerSecret', 'items', 'fulfillment']);
  if (value.mode !== 'create') throw new HttpError(400, 'INVALID_WEB_REQUEST', 'La operación no es válida.');
  const identity = parseWebRequestIdentity(value);
  const fulfillment = validateFulfillment(value.fulfillment);
  if (fulfillment.value === null) throw new HttpError(400, 'INVALID_FULFILLMENT', 'Completá correctamente los datos de entrega.');
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_CART_LINES) {
    throw new HttpError(400, 'INVALID_CART', 'La cantidad de productos no es válida.');
  }
  const seen = new Set<string>();
  const items = value.items.map((item) => {
    if (!isRecord(item)) throw new HttpError(400, 'INVALID_CART_LINE', 'Un producto no es válido.');
    assertExactKeys(item, ['productId', 'quantity', 'catalogVersion']);
    const productId = readSafeText(item.productId, 'productId', 180);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(productId) || seen.has(productId)) {
      throw new HttpError(400, 'INVALID_CART_LINE', 'Un producto está repetido o no es válido.');
    }
    seen.add(productId);
    const quantity = readInteger(item.quantity, 'quantity', 1, MAX_CART_QUANTITY);
    if (typeof item.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(item.catalogVersion)) {
      throw new HttpError(409, 'CATALOG_VERSION_REQUIRED', 'Actualizá el carrito antes de continuar.');
    }
    return Object.freeze({ productId, quantity, catalogVersion: item.catalogVersion });
  }).sort((a, b) => a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0);
  return Object.freeze({ ...identity, items: Object.freeze(items), fulfillment: fulfillment.value });
}

export async function createWebOrderRequest(database: D1Database, input: WebRequestInput, tokenSecret: string,
  loadSnapshot: () => Promise<WebRequestCatalog>, limits: readonly WebRequestLimit[], now = new Date()): Promise<Readonly<{ receipt: WebRequestReceipt; created: boolean }>> {
  const ownerHash = await sha256Hex(input.ownerSecret);
  const fulfillmentValue = fulfillmentCanonicalValue(input.fulfillment);
  const cartValue = JSON.stringify(input.items.map((line) => [line.productId, line.quantity, line.catalogVersion]));
  const fingerprint = await sha256Hex(JSON.stringify([1, 'web_request', cartValue, fulfillmentValue]));
  const replay = async () => {
    const row = await findRequest(database, input.idempotencyKey);
    if (row === null) return null;
    assertOwner(row, ownerHash);
    if (row.web_request_fingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Esta clave ya corresponde a otra solicitud.');
    return { receipt: await receiptFor(row, input, tokenSecret), created: false };
  };
  const existing = await replay();
  if (existing !== null) return existing;
  let snapshot: WebRequestSnapshot;
  try { snapshot = buildWebRequestSnapshot(input, await loadSnapshot()); }
  catch (error: unknown) { const raced = await replay(); if (raced !== null) return raced; throw error; }
  const requestId = `req_${randomToken(18)}`;
  const publicToken = await deriveRequestToken(input, tokenSecret);
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).byteLength > 65_536) throw new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud excede el tamaño permitido.');
  const timestamp = now.toISOString();
  try {
    await database.batch([
      database.prepare(`INSERT INTO checkout_intents (
        checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at, intent_kind,
        web_request_id, web_request_token_hash, web_request_owner_hash, web_request_fingerprint,
        web_request_json, web_request_status, web_request_updated_at
      ) VALUES (?, ?, ?, ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)
      ON CONFLICT(checkout_idempotency_key) DO NOTHING`)
        .bind(input.idempotencyKey, await sha256Hex(fulfillmentValue), await sha256Hex(cartValue), timestamp,
          requestId, await sha256Hex(publicToken), ownerHash, fingerprint, json, timestamp),
      ...limits.map((scope) => prepareWebRequestLimit(database, scope, Math.floor(now.getTime() / 1000), requestId)),
    ]);
  } catch (error: unknown) { throwWebRequestStorageError(error); }
  const row = await findRequest(database, input.idempotencyKey);
  if (row === null) throw new HttpError(503, 'WEB_REQUEST_STORAGE_UNAVAILABLE', 'No se pudo confirmar el registro.');
  assertOwner(row, ownerHash);
  if (row.web_request_fingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Esta clave ya corresponde a otra solicitud.');
  return Object.freeze({ receipt: await receiptFor(row, input, tokenSecret), created: row.web_request_id === requestId });
}

export function buildWebRequestSnapshot(input: WebRequestInput, snapshot: WebRequestCatalog): WebRequestSnapshot {
  const catalog = new Map(snapshot.items.map((item) => [item.slug, item]));
  const lines = input.items.map((line) => {
    if (line.catalogVersion !== snapshot.catalogVersion) throw new HttpError(409, 'CATALOG_VERSION_CONFLICT', 'Actualizá el carrito: el catálogo cambió.');
    const item = catalog.get(line.productId);
    if (item === undefined) throw new HttpError(409, 'PRODUCT_NOT_FOUND', 'Un producto ya no figura en el catálogo Dux.');
    const price = item.priceStatus === 'usable' && item.priceAmount !== null ? Math.round(item.priceAmount * 100) : null;
    if (price !== null && (!Number.isSafeInteger(price) || price <= 0)) throw new HttpError(503, 'CATALOG_PRICE_INVALID', 'El precio observado requiere revisión.');
    return Object.freeze({ productId: line.productId, duxCode: item.code, name: item.name,
      requestedQuantity: line.quantity, observedUnitPriceMinor: price });
  });
  return Object.freeze({ schemaVersion: 1, catalogVersion: snapshot.catalogVersion,
    observedAt: snapshot.stockReadAt ?? snapshot.syncedAt, lines: Object.freeze(lines), fulfillment: input.fulfillment,
    totalMinor: null, shippingMinor: input.fulfillment.method === 'coordinated_pickup' ? 0 : null,
    quantityStatus: 'requires_confirmation' });
}

export async function recoverWebOrderRequest(database: D1Database, identity: WebRequestIdentity, secret: string): Promise<WebRequestReceipt> {
  const row = await findRequest(database, identity.idempotencyKey);
  if (row === null) throw notFound();
  assertOwner(row, await sha256Hex(identity.ownerSecret));
  return receiptFor(row, identity, secret);
}

export async function getWebRequestByToken(database: D1Database, publicToken: string): Promise<WebRequestPublic> {
  if (!/^[a-f0-9]{64}$/u.test(publicToken)) throw notFound();
  let row: RequestRow | null;
  try { row = await database.prepare(`SELECT ${requestColumns} FROM checkout_intents
    WHERE intent_kind = 'web_request' AND web_request_token_hash = ?`).bind(await sha256Hex(publicToken)).first<RequestRow>(); }
  catch (error: unknown) { throwWebRequestStorageError(error); }
  if (row === null) throw notFound();
  return publicStatus(row);
}

export async function listWebOrderRequests(database: D1Database, offset = 0) {
  readInteger(offset, 'offset', 0, 10_000);
  try {
    const result = await database.prepare(`SELECT web_request_id AS id, web_request_status AS status,
      created_at, web_request_updated_at AS updated_at,
      json_extract(web_request_json, '$.fulfillment.fullName') AS full_name
      FROM checkout_intents WHERE intent_kind = 'web_request'
      ORDER BY CASE WHEN web_request_status = 'submitted' THEN 0 ELSE 1 END, created_at DESC, web_request_id
      LIMIT 26 OFFSET ?`).bind(offset).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    return Object.freeze({ rows: rows.slice(0, 25), hasMore: rows.length > 25, offset });
  } catch (error: unknown) { throwWebRequestStorageError(error); }
}

export async function getAdminWebOrderRequest(database: D1Database, id: string) {
  assertRequestId(id);
  try {
    const row = await database.prepare(`SELECT web_request_id AS id, web_request_status AS status,
      web_request_json AS snapshot_json, created_at, web_request_updated_at AS updated_at,
      web_request_resolved_at AS resolved_at, web_request_resolved_by AS resolved_by
      FROM checkout_intents WHERE intent_kind = 'web_request' AND web_request_id = ?`).bind(id).first<Readonly<{
        id: string; status: WebRequestStatus; snapshot_json: string; created_at: string;
        updated_at: string; resolved_at: string | null; resolved_by: string | null;
      }>>();
    if (row === null) throw notFound();
    const { snapshot_json: snapshotJson, ...metadata } = row;
    const snapshot: unknown = JSON.parse(snapshotJson);
    return Object.freeze({ ...metadata, snapshot });
  } catch (error: unknown) { throwWebRequestStorageError(error); }
}

export async function resolveWebOrderRequest(database: D1Database, id: string, status: 'accepted' | 'rejected', actor: string) {
  assertRequestId(id);
  if ((status !== 'accepted' && status !== 'rejected') || actor.trim() === '' || actor.length > 320) {
    throw new HttpError(400, 'INVALID_WEB_REQUEST_RESOLUTION', 'La resolución no es válida.');
  }
  const now = new Date().toISOString();
  try {
    const result = await database.prepare(`UPDATE checkout_intents SET web_request_status = ?,
      web_request_resolved_by = ?, web_request_resolved_at = ?, web_request_updated_at = ?
      WHERE intent_kind = 'web_request' AND web_request_id = ? AND web_request_status = 'submitted'`)
      .bind(status, actor, now, now, id).run();
    const detail = await getAdminWebOrderRequest(database, id);
    if (detail.status !== status) throw new HttpError(409, 'WEB_REQUEST_STATE_CONFLICT', 'La solicitud ya fue resuelta de otra manera.');
    return Object.freeze({ ...detail, changed: result.meta.changes === 1 });
  } catch (error: unknown) { throwWebRequestStorageError(error); }
}

async function findRequest(database: D1Database, key: string): Promise<RequestRow | null> {
  try { return await database.prepare(`SELECT ${requestColumns} FROM checkout_intents WHERE checkout_idempotency_key = ?`).bind(key).first<RequestRow>(); }
  catch (error: unknown) { throwWebRequestStorageError(error); }
}
function assertOwner(row: RequestRow, ownerHash: string): void {
  if (row.intent_kind !== 'web_request') throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otra operación comercial.');
  if (row.web_request_owner_hash !== ownerHash) throw notFound();
}
async function deriveRequestToken(identity: WebRequestIdentity, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `web-request:${identity.idempotencyKey}:${await sha256Hex(identity.ownerSecret)}`);
}
async function receiptFor(row: RequestRow, identity: WebRequestIdentity, secret: string): Promise<WebRequestReceipt> {
  const publicToken = await deriveRequestToken(identity, secret);
  if (await sha256Hex(publicToken) !== row.web_request_token_hash) throw new HttpError(503, 'WEB_REQUEST_TOKEN_UNAVAILABLE', 'No se pudo recuperar la protección de la solicitud.');
  return Object.freeze({ ...publicStatus(row), publicToken });
}
function publicStatus(row: RequestRow): WebRequestPublic {
  return Object.freeze({ reference: webRequestReference(row.web_request_id), status: row.web_request_status,
    createdAt: row.created_at, updatedAt: row.web_request_updated_at,
    paymentStatus: 'not_requested', reservationStatus: 'not_reserved', totalMinor: null });
}
function assertRequestId(id: string): void {
  if (!/^req_[A-Za-z0-9_-]{20,128}$/u.test(id)) throw notFound();
}
function notFound(): HttpError { return new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.'); }
