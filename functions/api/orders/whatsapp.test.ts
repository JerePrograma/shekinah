import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  AdminContextData,
  Env,
  PagesFunctionContext,
} from '../../../server/platform';
import { createTestD1 } from '../../../src/test/d1';
import { onRequest as approveOrder } from '../admin/orders/[id]/approve';
import { onRequest as rejectOrder } from '../admin/orders/[id]/reject';
import { onRequest as whatsappOrder } from './whatsapp';

const migrations = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
  '0012_dux_authoritative_inventory.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'));

const adminData: AdminContextData = {
  adminIdentity: {
    sub: 'admin-sub',
    actor: 'admin@example.test',
    authMethod: 'cloudflare-access',
  },
  requestId: 'whatsapp-order-admin-test',
};

const fulfillment = Object.freeze({
  method: 'coordinated_pickup' as const,
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
});

describe('Functions de pedidos WhatsApp', () => {
  it('falla cerrado sin Dux y exige origen autorizado antes de procesar', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      const body = {
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: 'pedido-function', quantity: 2 }],
        whatsappConsent: true,
      };
      const first = await whatsappOrder(publicContext(testD1.database, body));
      expect(first.status).toBe(503);
      await expect(first.json()).resolves.toMatchObject({
        error: { code: 'DUX_API_DISABLED' },
      });
      expect(testD1.sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get())
        .toEqual({ count: 0 });

      const crossOrigin = await whatsappOrder(publicContext(
        testD1.database,
        { ...body, idempotencyKey: crypto.randomUUID() },
        'https://attacker.test',
      ));
      expect(crossOrigin.status).toBe(403);
      await expect(crossOrigin.json()).resolves.toMatchObject({
        error: { code: 'ORIGIN_REJECTED' },
      });
    } finally {
      testD1.close();
    }
  });

  it('no abre WhatsApp ni usa Mercado Libre sin lifecycle público de Dux', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      const baseContext = publicContext(testD1.database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: 'pedido-validaciones', quantity: 1 }],
        whatsappConsent: true,
      });
      const blocked = await whatsappOrder({
        ...baseContext,
        env: { ...baseContext.env, DUX_API_ENABLED: 'true' },
      });
      expect(blocked.status).toBe(503);
      await expect(blocked.json()).resolves.toMatchObject({
        error: { code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE' },
      });
      expect(testD1.sqlite.prepare('SELECT COUNT(*) AS count FROM orders').get())
        .toEqual({ count: 0 });
    } finally {
      testD1.close();
    }
  });

  it('bloquea la aprobación administrativa mientras Dux no tenga lifecycle público', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      const orderId = 'ord_blocked_dux_1234567890';
      await createBlockedDuxOrder(testD1.database, orderId);
      const approved = await approveOrder(adminContext(testD1.database, orderId, adminData));
      expect(approved.status).toBe(503);
      await expect(approved.json()).resolves.toMatchObject({
        error: { code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE' },
      });
      expect(testD1.sqlite.prepare(
        `SELECT action, outcome_status FROM admin_audit
         WHERE target_id = ? ORDER BY rowid`,
      ).all(orderId)).toEqual([
        { action: 'admin.order.approve', outcome_status: 503 },
      ]);
    } finally {
      testD1.close();
    }
  });

  it('rechaza origen cruzado y no libera una reserva sin lifecycle Dux', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      const orderId = 'ord_reject_blocked_dux_1234567890';
      await createBlockedDuxOrder(testD1.database, orderId);
      const crossOriginContext = adminContext(testD1.database, orderId, adminData);
      const crossOrigin = await rejectOrder({
        ...crossOriginContext,
        request: new Request(crossOriginContext.request.url, {
          method: 'POST',
          headers: { origin: 'https://attacker.test' },
        }),
      });
      expect(crossOrigin.status).toBe(403);
      await expect(crossOrigin.json()).resolves.toMatchObject({
        error: { code: 'ORIGIN_REJECTED' },
      });

      const rejected = await rejectOrder(adminContext(testD1.database, orderId, adminData));
      expect(rejected.status).toBe(503);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE' },
      });
    } finally {
      testD1.close();
    }
  });
});

async function createBlockedDuxOrder(
  database: NonNullable<Env['DB']>,
  orderId: string,
): Promise<void> {
  const now = '2026-08-26T12:00:00.000Z';
  await database.prepare(
    `INSERT INTO orders (
      id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
      status, currency, total_minor, item_count, created_at, updated_at, channel
    ) VALUES (?, ?, ?, ?, 'pending', 'ARS', 1000, 1, ?, ?, 'whatsapp')`,
  ).bind(
    orderId,
    `${orderId}-token`,
    crypto.randomUUID(),
    `${orderId}-fingerprint`,
    now,
    now,
  ).run();
  await database.prepare(
    `INSERT INTO dux_order_links (
      order_id, dux_reference, company_id, branch_id, deposit_id,
      reservation_state, request_fingerprint, created_at, updated_at
    ) VALUES (?, ?, '1', '2', '3', 'blocked', ?, ?, ?)`,
  ).bind(orderId, `shekinah:${orderId}`, `${orderId}-request`, now, now).run();
}

function publicContext(
  database: NonNullable<Env['DB']>,
  body: unknown,
  origin = 'https://example.test',
): PagesFunctionContext {
  return {
    request: new Request('https://example.test/api/orders/whatsapp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      ALLOWED_SITE_ORIGINS: 'https://example.test',
    },
    params: {},
    data: {},
    functionPath: '/api/orders/whatsapp',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

function adminContext(
  database: NonNullable<Env['DB']>,
  id: string,
  data: AdminContextData,
): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(`https://example.test/api/admin/orders/${id}/approve`, {
      method: 'POST',
      headers: { origin: 'https://example.test' },
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      ALLOWED_SITE_ORIGINS: 'https://example.test',
    },
    params: { id },
    data,
    functionPath: `/api/admin/orders/${id}/approve`,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
