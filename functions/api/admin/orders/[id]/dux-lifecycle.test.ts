import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AdminContextData, Env, PagesFunctionContext } from '../../../../../server/platform';
import { SqliteD1 } from '../../../../../server/test/sqlite-d1';
import { onRequest } from './dux-lifecycle';

const doubles = vi.hoisted(() => ({ inspect: vi.fn(), confirm: vi.fn(), reconcile: vi.fn() }));
vi.mock('../../../../../server/assisted-dux-lifecycle', () => ({
  inspectAssistedDuxLifecycle: doubles.inspect,
  confirmAssistedDuxLifecycle: doubles.confirm,
}));
vi.mock('../../../../../server/payment-reconciliation', () => ({ reconcileMercadoPagoOrder: doubles.reconcile }));

const migration = readFileSync(resolve(process.cwd(), 'migrations', '0001_commerce.sql'), 'utf8');
const orderId = `ord_${'a'.repeat(24)}`;

function context(database: SqliteD1, body: unknown, authenticated = true, origin = 'https://example.test'): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(`https://example.test/api/admin/orders/${orderId}/dux-lifecycle`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
      MERCADO_PAGO_ACCESS_TOKEN: 'access-token-for-tests-only',
    },
    params: { id: orderId },
    data: authenticated ? {
      adminIdentity: { sub: 'admin-subject', actor: 'admin@example.test', authMethod: 'password' },
    } : {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

beforeEach(() => {
  doubles.inspect.mockReset().mockResolvedValue({
    orderId, action: 'release', duxOrderNumber: 'PED-1', completed: false, requiresPaymentReconciliation: false,
  });
  doubles.confirm.mockReset().mockResolvedValue({
    orderId, action: 'release', duxOrderNumber: 'PED-1', completed: true,
    requiresPaymentReconciliation: false, changed: true, reservationStatus: 'released', paymentStatus: 'none',
  });
  doubles.reconcile.mockReset().mockResolvedValue({});
});

describe('handler de lifecycle Dux asistido', () => {
  it('exige admin, origen y confirmación explícita', async () => {
    const database = new SqliteD1(migration);
    try {
      expect((await onRequest(context(database, { action: 'release', confirmedInDux: true }, false))).status).toBe(401);
      expect((await onRequest(context(database, { action: 'release', confirmedInDux: true }, true, 'https://foreign.test'))).status).toBe(403);
      expect((await onRequest(context(database, { action: 'release', confirmedInDux: false }))).status).toBe(400);
      expect((await onRequest(context(database, { action: 'release', confirmedInDux: true, force: true }))).status).toBe(400);
      expect(doubles.inspect).not.toHaveBeenCalled();
      expect(doubles.confirm).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('libera sin exigir Mercado Pago cuando nunca hubo intento financiero', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(database, { action: 'release', confirmedInDux: true }));
      expect(response.status).toBe(200);
      expect(doubles.reconcile).not.toHaveBeenCalled();
      expect(doubles.confirm).toHaveBeenCalledWith(database, orderId, 'release', 'admin@example.test', null);
      await expect(database.prepare(`SELECT action, target_id, outcome_status FROM admin_audit
        ORDER BY created_at DESC LIMIT 1`).first()).resolves.toEqual({
        action: 'admin.order.assisted_dux_lifecycle', target_id: orderId, outcome_status: 200,
      });
    } finally { database.close(); }
  });

  it('concilia Mercado Pago inmediatamente antes de confirmar si hubo un intento', async () => {
    const database = new SqliteD1(migration);
    try {
      doubles.inspect.mockResolvedValueOnce({
        orderId, action: 'finalize', duxOrderNumber: 'PED-1', completed: false, requiresPaymentReconciliation: true,
      });
      doubles.confirm.mockResolvedValueOnce({
        orderId, action: 'finalize', duxOrderNumber: 'PED-1', completed: true,
        requiresPaymentReconciliation: false, changed: true, reservationStatus: 'finalized', paymentStatus: 'approved',
      });
      const response = await onRequest(context(database, { action: 'finalize', confirmedInDux: true }));
      expect(response.status).toBe(200);
      expect(doubles.reconcile).toHaveBeenCalledWith(database, orderId, 'access-token-for-tests-only', 'sandbox');
      expect(doubles.confirm).toHaveBeenCalledTimes(1);
      const reconciliationArgument = doubles.confirm.mock.calls[0]?.[4];
      expect(reconciliationArgument).toBeInstanceOf(Date);
      expect(doubles.confirm.mock.calls[0]?.[3]).toBe('admin@example.test');
    } finally { database.close(); }
  });

  it('un replay terminal no vuelve a consultar al proveedor', async () => {
    const database = new SqliteD1(migration);
    try {
      doubles.inspect.mockResolvedValueOnce({
        orderId, action: 'release', duxOrderNumber: 'PED-1', completed: true, requiresPaymentReconciliation: false,
      });
      doubles.confirm.mockResolvedValueOnce({
        orderId, action: 'release', duxOrderNumber: 'PED-1', completed: true,
        requiresPaymentReconciliation: false, changed: false, reservationStatus: 'released', paymentStatus: 'none',
      });
      const response = await onRequest(context(database, { action: 'release', confirmedInDux: true }));
      expect(response.status).toBe(200);
      expect(doubles.reconcile).not.toHaveBeenCalled();
      expect(doubles.confirm).toHaveBeenCalledWith(database, orderId, 'release', 'admin@example.test', null);
    } finally { database.close(); }
  });
});
