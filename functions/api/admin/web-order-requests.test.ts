import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest as list } from './web-order-requests';
import { onRequest as detail } from './web-order-requests/[id]';
import { onRequest as resolveRequest } from './web-order-requests/[id]/resolve';
import { createWebOrderRequest, parseWebRequestInput } from '../../../server/web-order-requests';
import type { AdminContextData, Env, PagesFunctionContext } from '../../../server/platform';
import { SqliteD1 } from '../../../server/test/sqlite-d1';

const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql', '0003_checkout_intent_cart_fingerprint.sql',
  '0012_dux_authoritative_inventory.sql', '0020_web_order_requests.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
function context(db: SqliteD1, id = '', authenticated = true, method = 'GET', body?: unknown, origin = 'https://example.test'): PagesFunctionContext<Env, string, AdminContextData> {
  return { request: new Request(`https://example.test/api/admin/web-order-requests/${id}`, { method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env: { DB: db, PUBLIC_SITE_URL: 'https://example.test' }, params: { id },
    data: authenticated ? { adminIdentity: { sub: 'test-admin', actor: 'test-admin', authMethod: 'password' } } : {},
    next: () => Promise.resolve(new Response(null, { status: 404 })), waitUntil: () => undefined };
}
async function seed(db: SqliteD1): Promise<string> {
  const version = 'a'.repeat(64);
  const input = parseWebRequestInput({ mode: 'create', idempotencyKey: crypto.randomUUID(), ownerSecret: 'b'.repeat(64),
    items: [{ productId: 'dux-test', quantity: 1, catalogVersion: version }],
    fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente sintético', phone: '1234567890' } });
  await createWebOrderRequest(db, input, 's'.repeat(40), () => Promise.resolve({ catalogVersion: version, syncedAt: '2026-09-08T12:00:00.000Z',
    items: [{ slug: 'dux-test', code: 'TEST', name: 'Prueba', priceStatus: 'usable', priceAmount: 1,
      categories: [], unitsPerPackage: null, imageUrl: null, description: null }] }), []);
  return String(db.database.prepare('SELECT web_request_id FROM checkout_intents').get()?.web_request_id);
}

it('no devuelve datos ni resuelve solicitudes sin identidad administrativa', async () => {
  const db = new SqliteD1(migration);
  try {
    const id = await seed(db);
    expect((await list(context(db, '', false))).status).toBe(401);
    expect((await detail(context(db, id, false))).status).toBe(401);
    expect((await resolveRequest(context(db, id, false, 'POST', { status: 'accepted' }))).status).toBe(401);
    expect(db.database.prepare('SELECT web_request_status FROM checkout_intents').get()?.web_request_status).toBe('submitted');
  } finally { db.close(); }
});

it('rechaza origen ajeno y campos extra antes de resolver', async () => {
  const db = new SqliteD1(migration);
  try {
    const id = await seed(db);
    expect((await resolveRequest(context(db, id, true, 'POST', { status: 'accepted' }, 'https://foreign.test'))).status).toBe(403);
    expect((await resolveRequest(context(db, id, true, 'POST', { status: 'accepted', paymentStatus: 'approved' }))).status).toBe(400);
    expect(db.database.prepare('SELECT web_request_status FROM checkout_intents').get()?.web_request_status).toBe('submitted');
  } finally { db.close(); }
});

it('audita la resolución, repite el mismo resultado y rechaza la acción incompatible', async () => {
  const db = new SqliteD1(migration);
  try {
    const id = await seed(db);
    const first = await resolveRequest(context(db, id, true, 'POST', { status: 'accepted' }));
    expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ id, status: 'accepted', changed: true });
    const repeated = await resolveRequest(context(db, id, true, 'POST', { status: 'accepted' }));
    expect(repeated.status).toBe(200); expect(await repeated.json()).toMatchObject({ changed: false });
    expect((await resolveRequest(context(db, id, true, 'POST', { status: 'rejected' }))).status).toBe(409);
    expect(db.database.prepare('SELECT web_request_resolved_by FROM checkout_intents').get()?.web_request_resolved_by).toBe('test-admin');
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM admin_audit WHERE action = 'admin.web_requests.resolve'").get()?.count).toBe(3);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM payments').get()?.count).toBe(0);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_order_operations').get()?.count).toBe(0);
    const response = await detail(context(db, id)); expect(response.status).toBe(200);
    const value: unknown = await response.json(); expect(value).not.toHaveProperty('web_request_owner_hash');
  } finally { db.close(); }
});
