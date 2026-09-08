import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildWebRequestSnapshot, createWebOrderRequest, getAdminWebOrderRequest,
  getWebRequestByToken, listWebOrderRequests, parseWebRequestInput,
  recoverWebOrderRequest, resolveWebOrderRequest,
} from './web-order-requests';
import type { WebRequestCatalog } from './web-order-requests';
import { consumeWebRequestAccess, webRequestLimits } from './web-request-rate-limit';
import { SqliteD1 } from './test/sqlite-d1';

const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql', '0012_dux_authoritative_inventory.sql', '0020_web_order_requests.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const version = 'a'.repeat(64);
const secret = 'web-request-test-secret-'.repeat(2);
const now = new Date('2026-09-08T12:00:00.000Z');
const fulfillment = { method: 'coordinated_pickup', fullName: 'Cliente de prueba', phone: '1234567890',
  address: '', locality: '', province: '', postalCode: '' };
const catalog: WebRequestCatalog = { catalogVersion: version, syncedAt: now.toISOString(), items: [
  { slug: 'dux-test-a', code: 'TEST-A', name: 'Producto de prueba A 50GR', priceAmount: 150, priceStatus: 'usable',
    categories: [], unitsPerPackage: null, imageUrl: null, description: null },
  { slug: 'dux-test-b', code: 'TEST-B', name: 'Producto de prueba B', priceAmount: null, priceStatus: 'missing_or_zero',
    categories: [], unitsPerPackage: null, imageUrl: null, description: null },
] };
const limits = [{ key: 'synthetic:global', limit: 20 }];
function input(key = crypto.randomUUID(), ownerSecret = 'b'.repeat(64)) {
  return parseWebRequestInput({ mode: 'create', idempotencyKey: key, ownerSecret, fulfillment,
    items: [{ productId: 'dux-test-a', quantity: 2, catalogVersion: version }] });
}
async function create(db: SqliteD1, value = input()) {
  return createWebOrderRequest(db, value, secret, () => Promise.resolve(catalog), limits, now);
}
async function idFor(db: SqliteD1, key: string) {
  const row = await db.prepare('SELECT web_request_id AS id FROM checkout_intents WHERE checkout_idempotency_key = ?').bind(key).first<{ id: string }>();
  if (row === null) throw new Error('No se creó la solicitud de prueba.');
  return row.id;
}

it('registra una solicitud sin WhatsApp, sin crear orden, pago ni reserva ficticios', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); const first = await create(db, value);
    expect(first.created).toBe(true);
    expect(first.receipt.status).toBe('submitted');
    expect(first.receipt.totalMinor).toBeNull();
    expect(first.receipt.paymentStatus).toBe('not_requested');
    expect(first.receipt.reservationStatus).toBe('not_reserved');
    expect(JSON.stringify(first.receipt)).not.toContain(fulfillment.phone);
    expect(JSON.stringify(first.receipt)).not.toContain(value.ownerSecret);
    for (const table of ['orders', 'payments', 'dux_order_links', 'dux_order_operations']) {
      expect(db.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count).toBe(0);
    }
    expect((await getWebRequestByToken(db, first.receipt.publicToken)).reference).toBe(first.receipt.reference);
  } finally { db.close(); }
});

it('reintentos concurrentes crean una sola intención y consumen una sola cuota de creación', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input();
    const results = await Promise.all(Array.from({ length: 12 }, () => create(db, value)));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.receipt.publicToken)).size).toBe(1);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()?.count).toBe(1);
    expect(db.database.prepare('SELECT request_count FROM commerce_request_rate_limits').get()?.request_count).toBe(1);
  } finally { db.close(); }
});

it('conserva la identidad después de una respuesta perdida, sin volver a leer catálogo ni expirar la clave', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); const first = await create(db, value);
    const replay = await createWebOrderRequest(db, value, secret,
      () => { throw new Error('No debe consultar el catálogo durante un replay.'); }, limits, new Date('2027-01-01T00:00:00.000Z'));
    expect(replay.created).toBe(false); expect(replay.receipt).toEqual(first.receipt);
    expect(await recoverWebOrderRequest(db, value, secret)).toEqual(first.receipt);
  } finally { db.close(); }
});

it('rechaza el mismo UUID con distinto contenido y exige además la capacidad del propietario', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); await create(db, value);
    await expect(create(db, { ...value, items: [{ ...value.items[0]!, quantity: 3 }] })).rejects.toMatchObject({ status: 409 });
    await expect(create(db, { ...value, fulfillment: { ...value.fulfillment, phone: '9999999999' } })).rejects.toMatchObject({ status: 409 });
    await expect(recoverWebOrderRequest(db, { ...value, ownerSecret: 'c'.repeat(64) }, secret)).rejects.toMatchObject({ status: 404 });
    await expect(getWebRequestByToken(db, 'd'.repeat(64))).rejects.toMatchObject({ status: 404 });
    expect(db.database.prepare('SELECT request_count FROM commerce_request_rate_limits').get()?.request_count).toBe(1);
  } finally { db.close(); }
});

it('normaliza el orden de líneas y no fusiona compradores con carritos iguales', async () => {
  const db = new SqliteD1(migration);
  try {
    const base = input();
    const lines = [...base.items, { productId: 'dux-test-b', quantity: 1, catalogVersion: version }];
    const a = parseWebRequestInput({ ...base, mode: 'create', items: lines });
    const b = parseWebRequestInput({ ...base, mode: 'create', items: [...lines].reverse() });
    const first = await create(db, a); const repeat = await create(db, b);
    expect(first.receipt.publicToken).toBe(repeat.receipt.publicToken);
    const other = await create(db, { ...a, idempotencyKey: crypto.randomUUID(), ownerSecret: 'f'.repeat(64) });
    expect(other.receipt.publicToken).not.toBe(first.receipt.publicToken);
  } finally { db.close(); }
});

it('no infiere unidad o peso desde el nombre y no convierte una cotización desconocida en envío gratis', () => {
  const value = input();
  const snapshot = buildWebRequestSnapshot({ ...value, fulfillment: { ...value.fulfillment,
    method: 'correo_argentino', address: 'Calle prueba 100', locality: 'Ciudad', province: 'Provincia', postalCode: '1234' } }, catalog);
  expect(snapshot.quantityStatus).toBe('requires_confirmation');
  expect(snapshot.totalMinor).toBeNull(); expect(snapshot.shippingMinor).toBeNull();
  expect(snapshot.lines[0]?.observedUnitPriceMinor).toBe(15000);
  expect(snapshot).not.toHaveProperty('totalWeightGrams');
});

it('no permite precios del navegador ni productos ausentes y preserva precios desconocidos como null', () => {
  const value = input();
  expect(() => parseWebRequestInput({ ...value, mode: 'create', totalMinor: 1 })).toThrow();
  expect(() => parseWebRequestInput({ ...value, mode: 'create', items: [{ ...value.items[0], price: 1 }] })).toThrow();
  expect(() => buildWebRequestSnapshot({ ...value, items: [{ ...value.items[0]!, productId: 'missing' }] }, catalog)).toThrow();
  expect(() => buildWebRequestSnapshot(value, { ...catalog, catalogVersion: 'f'.repeat(64) })).toThrow();
  const snapshot = buildWebRequestSnapshot({ ...value, items: [{ ...value.items[0]!, productId: 'dux-test-b' }] }, catalog);
  expect(snapshot.lines[0]?.observedUnitPriceMinor).toBeNull();
});

it.each(['accepted', 'rejected'] as const)('resuelve %s una sola vez sin simular un cobro o cambio de stock', async (status) => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); await create(db, value); const id = await idFor(db, value.idempotencyKey);
    const results = await Promise.all(Array.from({ length: 8 }, () => resolveWebOrderRequest(db, id, status, 'test:admin')));
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect((await recoverWebOrderRequest(db, value, secret)).status).toBe(status);
    expect((await recoverWebOrderRequest(db, value, secret)).paymentStatus).toBe('not_requested');
    await expect(resolveWebOrderRequest(db, id, status === 'accepted' ? 'rejected' : 'accepted', 'test:admin'))
      .rejects.toMatchObject({ status: 409 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM payments').get()?.count).toBe(0);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_order_links').get()?.count).toBe(0);
  } finally { db.close(); }
});

it('una cuota agotada revierte íntegramente la creación y no bloquea el replay existente', async () => {
  const db = new SqliteD1(migration);
  try {
    const scope = [{ key: 'limited', limit: 1 }]; const firstInput = input();
    const first = await createWebOrderRequest(db, firstInput, secret, () => Promise.resolve(catalog), scope, now);
    await expect(createWebOrderRequest(db, input(), secret, () => Promise.resolve(catalog), scope, now))
      .rejects.toMatchObject({ status: 429 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()?.count).toBe(1);
    expect((await createWebOrderRequest(db, firstInput, secret, () => Promise.resolve(catalog), scope, now)).receipt).toEqual(first.receipt);
  } finally { db.close(); }
});

it('protege la resolución, la historia y la conversión a orden mediante constraints SQL', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); await create(db, value);
    expect(() => db.database.prepare("UPDATE checkout_intents SET web_request_status = 'accepted'").run()).toThrow();
    expect(() => db.database.prepare("UPDATE checkout_intents SET web_request_json = '{}'").run()).toThrow();
    expect(() => db.database.prepare('DELETE FROM checkout_intents').run()).toThrow();
    expect(() => db.database.prepare(`INSERT INTO orders (id, public_token_hash, checkout_idempotency_key,
      cart_fingerprint, status, currency, total_minor, item_count, created_at, updated_at)
      VALUES ('test-order', 'token', ?, 'fingerprint', 'pending', 'ARS', 100, 1, 'now', 'now')`).run(value.idempotencyKey)).toThrow();
    expect(db.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally { db.close(); }
});

it('no expone capacidades privadas en listados administrativos y mantiene el detalle protegido por ID validado', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = input(); const receipt = await create(db, value);
    const listed = await listWebOrderRequests(db);
    expect(listed.rows).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(value.ownerSecret);
    expect(JSON.stringify(listed)).not.toContain(receipt.receipt.publicToken);
    const detail = await getAdminWebOrderRequest(db, await idFor(db, value.idempotencyKey));
    expect(detail.snapshot).toHaveProperty('quantityStatus', 'requires_confirmation');
    expect(JSON.stringify(detail)).not.toContain(value.ownerSecret);
    await expect(getAdminWebOrderRequest(db, 'invalid')).rejects.toMatchObject({ status: 404 });
  } finally { db.close(); }
});

it('limita accesos sin guardar la IP en claro y falla cerrado al superar el límite', async () => {
  const db = new SqliteD1(migration);
  try {
    const scopes = await webRequestLimits(new Request('https://example.test', { headers: { 'cf-connecting-ip': '192.0.2.1' } }), secret, 1000, false);
    expect(JSON.stringify(scopes)).not.toContain('192.0.2.1');
    await consumeWebRequestAccess(db, [{ key: 'access-test', limit: 1 }], 1000);
    await expect(consumeWebRequestAccess(db, [{ key: 'access-test', limit: 1 }], 1000)).rejects.toMatchObject({ status: 429 });
  } finally { db.close(); }
});
