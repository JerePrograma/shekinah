import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AdminContextData, Env, PagesFunctionContext } from '../../../../../server/platform';
import { SqliteD1 } from '../../../../../server/test/sqlite-d1';
import { onRequest } from './prepare';

const doubles = vi.hoisted(() => ({
  parse: vi.fn(),
  prepare: vi.fn(),
  state: vi.fn(),
}));

vi.mock('../../../../../server/assisted-checkout-admin-state', () => ({
  readAssistedCheckoutAdminState: doubles.state,
}));
vi.mock('../../../../../server/assisted-checkout', () => ({
  parseAssistedCheckoutInput: doubles.parse,
  prepareAssistedCheckout: doubles.prepare,
}));

const migration = readFileSync(resolve(process.cwd(), 'migrations', '0001_commerce.sql'), 'utf8');
const requestId = `req_${'a'.repeat(24)}`;

function context(
  database: SqliteD1,
  method: 'GET' | 'POST',
  authenticated = true,
  body?: unknown,
  enabled = true,
  origin = 'https://example.test',
): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(`https://example.test/api/admin/web-order-requests/${requestId}/prepare`, {
      method,
      headers: { origin, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      ...(enabled ? { ASSISTED_CHECKOUT_ENABLED: 'true' } : {}),
    },
    params: { id: requestId },
    data: authenticated
      ? { adminIdentity: { sub: 'admin-test', actor: 'admin-test', authMethod: 'password' } }
      : {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

beforeEach(() => {
  doubles.parse.mockReset().mockReturnValue({
    duxOrderNumber: 'PED-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true,
  });
  doubles.state.mockReset().mockResolvedValue({
    state: 'preview',
    preview: {
      requestId, catalogVersion: 'a'.repeat(64), catalogObservedAt: '2026-09-10T14:00:00.000Z',
      lines: [], itemCount: 1, productsTotalMinor: 1000,
      deliveryMethod: 'coordinated_pickup', shippingMinor: 0, totalMinor: 1000,
    },
  });
  doubles.prepare.mockReset().mockResolvedValue({
    orderId: `ord_${'b'.repeat(24)}`, requestId, duxOrderNumber: 'PED-1', duxOrderId: null,
    catalogVersion: 'a'.repeat(64), itemCount: 1, productsTotalMinor: 1000,
    shippingMinor: 0, totalMinor: 1000, reservationState: 'confirmed',
    paymentStatus: 'not_requested', created: true,
  });
});

describe('handler admin de preparación asistida', () => {
  it('protege y audita la lectura recuperable de la preparación', async () => {
    const database = new SqliteD1(migration);
    try {
      const unauthorized = await onRequest(context(database, 'GET', false));
      expect(unauthorized.status).toBe(401);
      expect(doubles.state).not.toHaveBeenCalled();

      const response = await onRequest(context(database, 'GET'));
      expect(response.status).toBe(200);
      expect(doubles.state).toHaveBeenCalledWith(database, expect.any(Object), requestId);
      await expect(response.json()).resolves.toMatchObject({ state: 'preview' });
      await expect(database.prepare(`SELECT action, target_type, target_id, outcome_status
        FROM admin_audit ORDER BY created_at DESC LIMIT 1`).first()).resolves.toEqual({
        action: 'admin.web_requests.assisted_checkout_state',
        target_type: 'web_request',
        target_id: requestId,
        outcome_status: 200,
      });
    } finally { database.close(); }
  });

  it('devuelve el estado preparado persistido después de una recarga', async () => {
    const database = new SqliteD1(migration);
    try {
      doubles.state.mockResolvedValueOnce({
        state: 'prepared',
        prepared: {
          orderId: `ord_${'b'.repeat(24)}`,
          requestId,
          duxOrderNumber: 'PED-1',
          duxOrderId: null,
          catalogVersion: 'a'.repeat(64),
          itemCount: 2,
          productsTotalMinor: 2000,
          shippingMinor: 0,
          totalMinor: 2000,
          reservationStatus: 'confirmed',
          paymentStatus: 'none',
          paymentRequiresReview: false,
        },
      });
      const response = await onRequest(context(database, 'GET'));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        state: 'prepared',
        prepared: { duxOrderNumber: 'PED-1', reservationStatus: 'confirmed' },
      });
      expect(doubles.prepare).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('mantiene el POST cerrado sin flag y no interpreta el cuerpo', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(database, 'POST', true, {
        duxOrderNumber: 'PED-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true,
      }, false));
      expect(response.status).toBe(503);
      expect(doubles.parse).not.toHaveBeenCalled();
      expect(doubles.prepare).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('rechaza origen ajeno y campos extra antes de materializar', async () => {
    const database = new SqliteD1(migration);
    try {
      const valid = { duxOrderNumber: 'PED-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true };
      expect((await onRequest(context(database, 'POST', true, valid, true, 'https://foreign.test'))).status).toBe(403);
      expect((await onRequest(context(database, 'POST', true, { ...valid, price: 1 }))).status).toBe(400);
      expect(doubles.prepare).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('materializa una sola operación validada y la audita', async () => {
    const database = new SqliteD1(migration);
    try {
      const body = { duxOrderNumber: 'PED-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true };
      const response = await onRequest(context(database, 'POST', true, body));
      expect(response.status).toBe(201);
      expect(doubles.parse).toHaveBeenCalledWith(body);
      expect(doubles.prepare).toHaveBeenCalledWith(
        database, expect.any(Object), requestId, expect.objectContaining({ duxOrderNumber: 'PED-1' }), 'admin-test',
      );
      await expect(database.prepare(`SELECT action, target_type, target_id, outcome_status
        FROM admin_audit ORDER BY created_at DESC LIMIT 1`).first()).resolves.toEqual({
        action: 'admin.web_requests.assisted_checkout_prepare',
        target_type: 'web_request',
        target_id: requestId,
        outcome_status: 201,
      });
    } finally { database.close(); }
  });
});
