import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest } from './request';
import { onRequest as readStatus } from './[publicToken]/request-status';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { SqliteD1 } from '../../../server/test/sqlite-d1';

const doubles = vi.hoisted(() => ({ snapshot: vi.fn(), capability: vi.fn() }));
vi.mock('../../../server/dux-catalog', () => ({ readDuxCatalogSnapshot: doubles.snapshot }));
vi.mock('../../../server/web-order-capability', () => ({ webOrderRegistrationEnabled: doubles.capability }));
const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql', '0003_checkout_intent_cart_fingerprint.sql',
  '0012_dux_authoritative_inventory.sql', '0020_web_order_requests.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const version = 'a'.repeat(64);
const now = '2026-09-08T12:00:00.000Z';
function body() { return { mode: 'create', idempotencyKey: crypto.randomUUID(), ownerSecret: 'c'.repeat(64),
  items: [{ productId: 'dux-test-a', quantity: 1, catalogVersion: version }],
  fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente de prueba', phone: '1234567890' } }; }
function context(db: SqliteD1, value: unknown, changes: Partial<Env> = {}, origin = 'https://example.test'): PagesFunctionContext {
  return { request: new Request('https://example.test/api/orders/request', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) }),
    env: { DB: db, PUBLIC_SITE_URL: 'https://example.test', WEB_ORDERS_ENABLED: 'true', ORDER_TOKEN_SECRET: 's'.repeat(40), ...changes },
    params: {}, data: {}, waitUntil: () => undefined, next: () => Promise.resolve(new Response(null, { status: 404 })) };
}
beforeEach(() => {
  doubles.capability.mockReset().mockResolvedValue(true);
  doubles.snapshot.mockReset().mockResolvedValue({ catalogVersion: version, syncedAt: now, items: [
    { slug: 'dux-test-a', code: 'TEST-A', name: 'Prueba', priceAmount: 10, priceStatus: 'usable' },
  ] });
});

it('registra una solicitud con respuesta 201 y recupera una única referencia sin WhatsApp', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = body(); const first = await onRequest(context(db, value));
    expect(first.status).toBe(201);
    const receipt = await first.json() as Record<string, unknown>;
    const second = await onRequest(context(db, value));
    expect(second.status).toBe(200); expect(await second.json()).toEqual(receipt);
    expect(receipt).toMatchObject({ status: 'submitted', paymentStatus: 'not_requested', reservationStatus: 'not_reserved', totalMinor: null });
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(doubles.capability).toHaveBeenCalledTimes(2);
    expect(doubles.snapshot).toHaveBeenCalledTimes(1);
  } finally { db.close(); }
});

it('cerrar altas no rompe la recuperación ni la consulta de una solicitud existente', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = body(); const first = await onRequest(context(db, value));
    const receipt = await first.json() as Record<string, unknown>;
    doubles.capability.mockResolvedValue(false);
    const recovered = await onRequest(context(db, { mode: 'recover', idempotencyKey: value.idempotencyKey, ownerSecret: value.ownerSecret }, { WEB_ORDERS_ENABLED: 'false' }));
    expect(recovered.status).toBe(200); expect(await recovered.json()).toEqual(receipt);
    const query = context(db, {}, { WEB_ORDERS_ENABLED: 'false' });
    const result = await readStatus({ ...query, request: new Request('https://example.test/api/orders/token/request-status'), params: { publicToken: String(receipt.publicToken) } });
    expect(result.status).toBe(200);
    expect(await result.json()).not.toHaveProperty('publicToken');
    expect(doubles.capability).toHaveBeenCalledTimes(1);
    expect(doubles.snapshot).toHaveBeenCalledTimes(1);
  } finally { db.close(); }
});

it('no escribe ni lee el snapshot si la capacidad runtime está cerrada', async () => {
  const db = new SqliteD1(migration);
  try {
    doubles.capability.mockResolvedValue(false);
    const response = await onRequest(context(db, body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'WEB_ORDERS_UNAVAILABLE', message: 'El registro de solicitudes no está disponible temporalmente.' },
    });
    expect(doubles.snapshot).not.toHaveBeenCalled();
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()?.count).toBe(0);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM commerce_request_rate_limits').get()?.count).toBe(0);
  } finally { db.close(); }
});

it('conserva origen, límites de cuerpo y contrato estricto antes de consultar capacidad', async () => {
  const db = new SqliteD1(migration);
  try {
    expect((await onRequest(context(db, body(), {}, 'https://foreign.test'))).status).toBe(403);
    expect((await onRequest(context(db, { ...body(), totalMinor: 1 }))).status).toBe(400);
    expect((await onRequest(context(db, { ...body(), padding: 'x'.repeat(33000) }))).status).toBe(413);
    const base = context(db, body());
    expect((await onRequest({ ...base, request: new Request(base.request.url) })).status).toBe(405);
    expect(doubles.capability).not.toHaveBeenCalled();
    expect(doubles.snapshot).not.toHaveBeenCalled();
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM checkout_intents').get()?.count).toBe(0);
  } finally { db.close(); }
});

it('un UUID conocido sin la capacidad del dueño no recupera datos y otro payload devuelve 409', async () => {
  const db = new SqliteD1(migration);
  try {
    const value = body(); await onRequest(context(db, value));
    const wrong = await onRequest(context(db, { mode: 'recover', idempotencyKey: value.idempotencyKey, ownerSecret: 'd'.repeat(64) }));
    expect(wrong.status).toBe(404);
    const changed = await onRequest(context(db, { ...value, items: [{ ...value.items[0], quantity: 2 }] }));
    expect(changed.status).toBe(409);
    expect(doubles.capability).toHaveBeenCalledTimes(2);
    expect(doubles.snapshot).toHaveBeenCalledTimes(1);
  } finally { db.close(); }
});
