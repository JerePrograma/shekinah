import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCatalogProduct } from '../../../server/catalog-store';
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
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'));

const adminData: AdminContextData = {
  adminIdentity: {
    sub: 'admin-sub',
    actor: 'admin@example.test',
    authMethod: 'cloudflare-access',
  },
  requestId: 'whatsapp-order-admin-test',
};

describe('Functions de pedidos WhatsApp', () => {
  it('crea antes de responder, reusa la clave y exige origen autorizado', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createProduct(testD1.database, 'pedido-function');
      const body = {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'pedido-function', quantity: 2 }],
      };
      const first = await whatsappOrder(publicContext(testD1.database, body));
      expect(first.status).toBe(201);
      const payload = await first.json() as Readonly<{ orderId: string }>;
      expect(payload.orderId).toMatch(/^ord_[A-Za-z0-9_-]{20,128}$/u);
      expect(payload).toMatchObject({
        status: 'pending',
        itemCount: 2,
        totalMinor: 200_000,
      });
      expect(testD1.sqlite.prepare(
        `SELECT orders.status, orders.channel, order_items.quantity
         FROM orders JOIN order_items ON order_items.order_id = orders.id
         WHERE orders.id = ?`,
      ).get(payload.orderId)).toEqual({ status: 'pending', channel: 'whatsapp', quantity: 2 });

      const replay = await whatsappOrder(publicContext(testD1.database, body));
      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({ orderId: payload.orderId });

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

  it('rechaza precio del navegador, stock insuficiente y falla cerrado sin D1 o sin 0007', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createProduct(testD1.database, 'pedido-validaciones');
      const manipulated = await whatsappOrder(publicContext(testD1.database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'pedido-validaciones', quantity: 1, price: 1 }],
      }));
      expect(manipulated.status).toBe(400);
      await expect(manipulated.json()).resolves.toMatchObject({
        error: { code: 'INVALID_CART_LINE' },
      });

      const insufficient = await whatsappOrder(publicContext(testD1.database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'pedido-validaciones', quantity: 6 }],
      }));
      expect(insufficient.status).toBe(409);
      await expect(insufficient.json()).resolves.toMatchObject({
        error: { code: 'INSUFFICIENT_STOCK' },
      });

      const withoutDatabase = await whatsappOrder({
        ...publicContext(testD1.database, {}),
        env: { PUBLIC_SITE_URL: 'https://example.test' },
      });
      expect(withoutDatabase.status).toBe(503);
      await expect(withoutDatabase.json()).resolves.toMatchObject({
        error: { code: 'DATABASE_UNAVAILABLE' },
      });

      const beforeWhatsappMigration = createTestD1(...migrations.slice(0, -1));
      try {
        await createProduct(beforeWhatsappMigration.database, 'pedido-sin-migracion');
        const migrationRequired = await whatsappOrder(publicContext(
          beforeWhatsappMigration.database,
          {
            idempotencyKey: crypto.randomUUID(),
            fulfillment: null,
            items: [{ productId: 'pedido-sin-migracion', quantity: 1 }],
          },
        ));
        expect(migrationRequired.status).toBe(503);
        await expect(migrationRequired.json()).resolves.toMatchObject({
          error: { code: 'WHATSAPP_MIGRATION_REQUIRED' },
        });
      } finally {
        beforeWhatsappMigration.close();
      }
    } finally {
      testD1.close();
    }
  });

  it('protege y audita aprobación/rechazo, retorna detalle e idempotencia de la misma acción', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createProduct(testD1.database, 'pedido-admin-function');
      const created = await whatsappOrder(publicContext(testD1.database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'pedido-admin-function', quantity: 2 }],
      }));
      const { orderId } = await created.json() as Readonly<{ orderId: string }>;

      const approved = await approveOrder(adminContext(testD1.database, orderId, adminData));
      expect(approved.status).toBe(200);
      await expect(approved.json()).resolves.toMatchObject({
        changed: true,
        order: {
          id: orderId,
          channel: 'whatsapp',
          status: 'approved',
          resolved_by: 'admin@example.test',
        },
        items: [{ product_id: 'pedido-admin-function', quantity: 2 }],
        payments: [],
      });

      const replay = await approveOrder(adminContext(testD1.database, orderId, adminData));
      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({ changed: false });

      const rejected = await rejectOrder(adminContext(testD1.database, orderId, adminData));
      expect(rejected.status).toBe(409);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'ORDER_STATE_CONFLICT' },
      });
      expect(testD1.sqlite.prepare(
        `SELECT action, outcome_status FROM admin_audit
         WHERE target_id = ? ORDER BY rowid`,
      ).all(orderId)).toEqual([
        { action: 'admin.order.approve', outcome_status: 200 },
        { action: 'admin.order.approve', outcome_status: 200 },
        { action: 'admin.order.reject', outcome_status: 409 },
      ]);
    } finally {
      testD1.close();
    }
  });

  it('rechaza origen cruzado en administración y permite rechazo idempotente', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createProduct(testD1.database, 'pedido-rechazo-function');
      const created = await whatsappOrder(publicContext(testD1.database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'pedido-rechazo-function', quantity: 1 }],
      }));
      const { orderId } = await created.json() as Readonly<{ orderId: string }>;
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
      expect(rejected.status).toBe(200);
      await expect(rejected.json()).resolves.toMatchObject({
        changed: true,
        order: { status: 'rejected' },
      });
      const replay = await rejectOrder(adminContext(testD1.database, orderId, adminData));
      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({ changed: false });
    } finally {
      testD1.close();
    }
  });
});

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

async function createProduct(database: NonNullable<Env['DB']>, id: string): Promise<void> {
  await createCatalogProduct(database, {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: ['agroecologicos'],
    categoryNames: ['Agroecologicos'],
    presentation: '100 g',
    price: { amount: 1_000, currency: 'ARS' },
    availability: 'available',
    stockQuantity: 5,
    images: [],
    variants: [],
  }, 'admin@example.test');
}
