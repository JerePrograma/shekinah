import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AdminContextData, Env, PagesFunctionContext } from '../../../../../server/platform';
import { SqliteD1 } from '../../../../../server/test/sqlite-d1';
import { onRequest } from './resume';

const doubles = vi.hoisted(() => ({ resume: vi.fn(), state: vi.fn() }));
vi.mock('../../../../../server/direct-checkout', () => ({ resumeDirectCheckout: doubles.resume }));
vi.mock('../../../../../server/assisted-checkout-admin-state', () => ({ readAssistedCheckoutAdminState: doubles.state }));
const requestId = `req_${'a'.repeat(24)}`;
const schema = readFileSync(resolve('migrations/0001_commerce.sql'), 'utf8');

function context(db: SqliteD1, authenticated = true, method = 'POST', origin = 'https://example.test', body?: string): PagesFunctionContext<Env, 'id', AdminContextData> {
  return { request: new Request(`https://example.test/api/admin/web-order-requests/${requestId}/resume`, {
    method, headers: { origin }, ...(body === undefined ? {} : { body }),
  }), env: { DB: db, PUBLIC_SITE_URL: 'https://example.test' }, params: { id: requestId },
  data: authenticated ? { adminIdentity: { sub: 'admin-test', actor: 'admin-test', authMethod: 'password' } } : {},
  next: () => Promise.resolve(new Response(null, { status: 404 })), waitUntil: () => undefined };
}

beforeEach(() => { doubles.resume.mockReset().mockResolvedValue(undefined); doubles.state.mockReset().mockResolvedValue({ state: 'direct_preparing' }); });

it('exige autenticación, POST, origen propio y ausencia de body antes de llamar a Dux', async () => {
  const db = new SqliteD1(schema);
  try {
    expect((await onRequest(context(db, false))).status).toBe(401);
    expect((await onRequest(context(db, true, 'GET'))).status).toBe(405);
    expect((await onRequest(context(db, true, 'POST', 'https://foreign.test'))).status).toBe(403);
    expect((await onRequest(context(db, true, 'POST', 'https://example.test', '{}'))).status).toBe(400);
    expect(doubles.resume).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('recupera la misma identidad y deja auditoría administrativa', async () => {
  const db = new SqliteD1(schema);
  try {
    expect((await onRequest(context(db))).status).toBe(200);
    expect(doubles.resume).toHaveBeenCalledExactlyOnceWith(db, expect.any(Object), requestId);
    expect(await db.prepare('SELECT action, target_type, target_id, outcome_status FROM admin_audit').first()).toEqual({
      action: 'admin.web_requests.direct_checkout_resume', target_type: 'web_request', target_id: requestId, outcome_status: 200,
    });
  } finally { db.close(); }
});
