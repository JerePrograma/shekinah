import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RecalculatedCart } from '../../../../../server/catalog';
import { createCatalogProduct, getCatalogProductDetail } from '../../../../../server/catalog-store';
import { getOrderById, prepareOrder } from '../../../../../server/orders';
import type {
  AdminContextData,
  Env,
  PagesFunctionContext,
} from '../../../../../server/platform';
import { SqliteD1 } from '../../../../../server/test/sqlite-d1';
import { onRequest } from './reconcile';

const migration = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
  '0012_dux_authoritative_inventory.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');

describe('conciliación administrativa de Mercado Pago', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('consulta por referencia, aplica el pago una vez y audita cada solicitud', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, {
        id: 'producto-reconciliacion',
        slug: 'producto-reconciliacion',
        path: '/producto-reconciliacion/',
        name: 'Producto de reconciliación',
        categorySlugs: ['agroecologicos'],
        categoryNames: ['Agroecologicos'],
        presentation: '50 g',
        price: { amount: 750, currency: 'ARS' },
        availability: 'available',
        stockQuantity: 2,
        images: [],
        variants: [],
      }, 'admin@example.test');
      const prepared = await prepareOrder({
        cart: controlledCart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      globalThis.fetch = vi.fn<typeof fetch>((input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === '/v1/payments/search') {
          expect(url.searchParams.get('external_reference')).toBe(prepared.order.id);
          return Promise.resolve(json({
            paging: { total: 1, limit: 50, offset: 0 },
            results: [{ id: 123456, external_reference: prepared.order.id }],
          }));
        }
        if (url.pathname === '/v1/payments/123456') {
          return Promise.resolve(json({
            id: 123456,
            external_reference: prepared.order.id,
            status: 'approved',
            status_detail: 'accredited',
            transaction_amount: prepared.order.total_minor / 100,
            currency_id: 'ARS',
            live_mode: false,
            collector_id: 998877,
            metadata: { order_id: prepared.order.id },
            date_approved: '2026-08-22T20:00:00.000Z',
            date_last_updated: '2026-08-22T20:00:00.000Z',
          }));
        }
        return Promise.resolve(json({}, 404));
      });

      const first = await onRequest(context(database, prepared.order.id));
      const second = await onRequest(context(database, prepared.order.id));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      await expect(first.json()).resolves.toMatchObject({
        order: { status: 'approved', stock_reservation_state: 'consumed' },
        reconciliation: { checkedPayments: 1 },
      });
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('approved');
      expect(await getCatalogProductDetail(database, 'producto-reconciliacion')).toMatchObject({
        stockQuantity: 1,
        reservedQuantity: 0,
        availableQuantity: 1,
      });
      await expect(database.prepare(
        "SELECT COUNT(*) AS count FROM payments WHERE provider_payment_id = '123456'",
      ).first()).resolves.toEqual({ count: 1 });
      await expect(database.prepare(
        "SELECT COUNT(*) AS count FROM admin_audit WHERE action = 'admin.order.reconcile' AND outcome_status = 200",
      ).first()).resolves.toEqual({ count: 2 });
    } finally {
      database.close();
    }
  });

  it('exige identidad administrativa y origen autorizado antes de consultar al proveedor', async () => {
    const database = new SqliteD1(migration);
    try {
      const orderId = 'ord_reconciliation_security_1234567890';
      const base = context(database, orderId);
      const anonymous = await onRequest({ ...base, data: {} });
      const crossOrigin = await onRequest({
        ...base,
        request: new Request(base.request.url, {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      });

      expect(anonymous.status).toBe(401);
      expect(crossOrigin.status).toBe(403);
      await expect(crossOrigin.json()).resolves.toMatchObject({
        error: { code: 'ORIGIN_REJECTED' },
      });
    } finally {
      database.close();
    }
  });
});

function controlledCart(): RecalculatedCart {
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([Object.freeze({
      product: Object.freeze({
        id: 'producto-reconciliacion',
        name: 'Producto de reconciliación',
        presentation: '50 g',
        available: true,
        stockControlled: true,
        unitPriceMinor: 75_000,
      }),
      quantity: 1,
      subtotalMinor: 75_000,
    })]),
    itemCount: 1,
    productsTotalMinor: 75_000,
    shippingMinor: 0,
    shippingTier: 'coordinated_pickup',
    totalWeightGrams: 50,
    fulfillment: Object.freeze({
      method: 'coordinated_pickup',
      fullName: 'Ana Pérez',
      phone: '5491155554444',
      address: 'Calle 123',
      locality: 'CABA',
      province: 'Buenos Aires',
      postalCode: 'C1234ABC',
    }),
    totalMinor: 75_000,
  });
}

function context(
  database: SqliteD1,
  orderId: string,
): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(
      `https://example.test/api/admin/orders/${encodeURIComponent(orderId)}/reconcile`,
      { method: 'POST', headers: { origin: 'https://example.test' } },
    ),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
      MERCADO_PAGO_ACCESS_TOKEN: 'access-token-for-tests-only',
    },
    params: { id: orderId },
    data: {
      adminIdentity: {
        sub: 'admin-test',
        actor: 'admin@example.test',
        authMethod: 'password',
      },
      requestId: crypto.randomUUID(),
    },
    functionPath: '/api/admin/orders/[id]/reconcile',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
