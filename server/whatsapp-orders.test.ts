import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createCatalogProduct,
  getCatalogProductDetail,
  listCatalogProducts,
  patchCatalogProductInventory,
} from './catalog-store';
import { listAdminOrdersWithFulfillment } from './admin-fulfillment';
import { recalculateDynamicCart } from './dynamic-cart';
import { SqliteD1 } from './test/sqlite-d1';
import {
  createWhatsappOrder,
  resolveWhatsappOrder,
} from './whatsapp-orders';

const migration = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');

describe('pedidos WhatsApp y reservas de stock', () => {
  it('crea un snapshot pendiente con precio canónico y proyecta la reserva sin tocar stock físico', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('reserva-creacion', 1_234.56, 10), 'admin@test');
      const request = orderRequest('reserva-creacion', 3);
      const created = await createWhatsappOrder(database, request);

      expect(created.created).toBe(true);
      expect(created.response).toMatchObject({
        status: 'pending',
        currency: 'ARS',
        totalMinor: 370_368,
        itemCount: 3,
        items: [{
          productId: 'reserva-creacion',
          quantity: 3,
          unitPriceMinor: 123_456,
          subtotalMinor: 370_368,
        }],
      });
      const product = await getCatalogProductDetail(database, 'reserva-creacion');
      expect(product).toMatchObject({
        stockQuantity: 10,
        reservedQuantity: 3,
        availableQuantity: 7,
      });

      const repeated = await createWhatsappOrder(database, request);
      expect(repeated.created).toBe(false);
      expect(repeated.response).toEqual(created.response);
      expect(await count(database, 'orders')).toBe(1);
      expect(await count(database, 'order_items')).toBe(1);
    } finally {
      database.close();
    }
  });

  it('rechaza stock insuficiente y un pedido multi-item completo sin persistencia parcial', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('multi-suficiente', 100, 5), 'admin@test');
      await createCatalogProduct(database, productInput('multi-insuficiente', 200, 1), 'admin@test');
      const request = {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [
          { productId: 'multi-suficiente', quantity: 2 },
          { productId: 'multi-insuficiente', quantity: 2 },
        ],
      };
      await expect(createWhatsappOrder(database, request)).rejects.toMatchObject({
        status: 409,
        code: 'INSUFFICIENT_STOCK',
      });
      expect(await count(database, 'orders')).toBe(0);
      expect(await count(database, 'order_items')).toBe(0);
      expect(await getCatalogProductDetail(database, 'multi-suficiente')).toMatchObject({
        reservedQuantity: 0,
        availableQuantity: 5,
      });
    } finally {
      database.close();
    }
  });

  it('serializa dos reservas por la última unidad y sólo una resulta creada', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('ultima-unidad', 500, 1), 'admin@test');
      const results = await Promise.allSettled([
        createWhatsappOrder(database, orderRequest('ultima-unidad', 1)),
        createWhatsappOrder(database, orderRequest('ultima-unidad', 1)),
      ]);
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected?.status).toBe('rejected');
      if (rejected?.status !== 'rejected') throw new Error('Faltó el rechazo concurrente.');
      expect(rejected.reason).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
      expect(await count(database, 'orders')).toBe(1);
      expect(await getCatalogProductDetail(database, 'ultima-unidad')).toMatchObject({
        stockQuantity: 1,
        reservedQuantity: 1,
        availableQuantity: 0,
      });
    } finally {
      database.close();
    }
  });

  it('reproduce idempotentemente un pedido que ya reservó la última unidad', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('replay-ultima-unidad', 500, 1), 'admin@test');
      const request = orderRequest('replay-ultima-unidad', 1);
      const first = await createWhatsappOrder(database, request);
      const replay = await createWhatsappOrder(database, request);
      expect(replay).toEqual({ created: false, response: first.response });
      expect(await count(database, 'orders')).toBe(1);
      expect(await getCatalogProductDetail(database, 'replay-ultima-unidad')).toMatchObject({
        stockQuantity: 1,
        reservedQuantity: 1,
        availableQuantity: 0,
      });
    } finally {
      database.close();
    }
  });

  it('aprueba una sola vez, consume la reserva y descuenta stock físico exactamente una vez', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('aprobar-pedido', 1_000, 10), 'admin@test');
      const created = await createWhatsappOrder(database, orderRequest('aprobar-pedido', 3));
      const first = await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'approved',
        'admin@example.test',
      );
      expect(first.changed).toBe(true);
      expect(first.order).toMatchObject({
        status: 'approved',
        channel: 'whatsapp',
        resolved_by: 'admin@example.test',
      });
      expect(await getCatalogProductDetail(database, 'aprobar-pedido')).toMatchObject({
        stockQuantity: 7,
        reservedQuantity: 0,
        availableQuantity: 7,
      });

      const repeated = await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'approved',
        'admin@example.test',
      );
      expect(repeated.changed).toBe(false);
      expect(await getCatalogProductDetail(database, 'aprobar-pedido')).toMatchObject({
        stockQuantity: 7,
        reservedQuantity: 0,
      });
      await expect(resolveWhatsappOrder(
        database,
        created.response.orderId,
        'rejected',
        'admin@example.test',
      )).rejects.toMatchObject({ status: 409, code: 'ORDER_STATE_CONFLICT' });
    } finally {
      database.close();
    }
  });

  it('rechaza una sola vez, libera la reserva sin alterar stock físico y bloquea aprobación posterior', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('rechazar-pedido', 1_000, 10), 'admin@test');
      const created = await createWhatsappOrder(database, orderRequest('rechazar-pedido', 3));
      const first = await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'rejected',
        'admin@example.test',
      );
      expect(first.changed).toBe(true);
      expect(await getCatalogProductDetail(database, 'rechazar-pedido')).toMatchObject({
        stockQuantity: 10,
        reservedQuantity: 0,
        availableQuantity: 10,
      });
      const repeated = await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'rejected',
        'admin@example.test',
      );
      expect(repeated.changed).toBe(false);
      await expect(resolveWhatsappOrder(
        database,
        created.response.orderId,
        'approved',
        'admin@example.test',
      )).rejects.toMatchObject({ status: 409, code: 'ORDER_STATE_CONFLICT' });
    } finally {
      database.close();
    }
  });

  it('hace determinista una carrera aprobar/rechazar y protege las mutaciones de catálogo', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('carrera-estado', 1_000, 4), 'admin@test');
      const created = await createWhatsappOrder(database, orderRequest('carrera-estado', 3));
      await expect(patchCatalogProductInventory(
        database,
        'carrera-estado',
        { stockQuantity: 2 },
        'admin@example.test',
      )).rejects.toMatchObject({ status: 409, code: 'STOCK_BELOW_RESERVATIONS' });

      const results = await Promise.allSettled([
        resolveWhatsappOrder(database, created.response.orderId, 'approved', 'admin-a@test'),
        resolveWhatsappOrder(database, created.response.orderId, 'rejected', 'admin-b@test'),
      ]);
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      const product = await getCatalogProductDetail(database, 'carrera-estado');
      expect([
        { stockQuantity: 1, reservedQuantity: 0, availableQuantity: 1 },
        { stockQuantity: 4, reservedQuantity: 0, availableQuantity: 4 },
      ]).toContainEqual({
        stockQuantity: product?.stockQuantity,
        reservedQuantity: product?.reservedQuantity,
        availableQuantity: product?.availableQuantity,
      });
    } finally {
      database.close();
    }
  });

  it('no acepta precio del navegador y expone la proyección en el listado sin persistirla en JSON', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('precio-servidor', 2_345.67, 2), 'admin@test');
      const tampered = orderRequest('precio-servidor', 1);
      await expect(createWhatsappOrder(database, {
        ...tampered,
        items: [{ productId: 'precio-servidor', quantity: 1, price: 1 }],
      })).rejects.toMatchObject({ status: 400, code: 'INVALID_CART_LINE' });

      await createWhatsappOrder(database, tampered);
      const listed = (await listCatalogProducts(database)).find(({ id }) => id === 'precio-servidor');
      expect(listed).toMatchObject({ reservedQuantity: 1, availableQuantity: 1 });
      const stored = await database.prepare(
        `SELECT payload_json FROM catalog_product_mutations WHERE product_id = ?`,
      ).bind('precio-servidor').first<Readonly<{ payload_json: string }>>();
      expect(stored?.payload_json).not.toContain('reservedQuantity');
      expect(stored?.payload_json).not.toContain('availableQuantity');
    } finally {
      database.close();
    }
  });

  it('mantiene los productos con stock controlado en el canal reservado de WhatsApp', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('coexistencia-checkout', 1_000, 5), 'admin@test');
      await createWhatsappOrder(database, orderRequest('coexistencia-checkout', 4));
      const checkout = (quantity: number) => recalculateDynamicCart({
        idempotencyKey: crypto.randomUUID(),
        fulfillment: {
          method: 'coordinated_pickup',
          fullName: 'Ana Pérez',
          phone: '5491155554444',
          address: 'Calle 123',
          locality: 'CABA',
          province: 'Buenos Aires',
          postalCode: 'C1234ABC',
        },
        items: [{ productId: 'coexistencia-checkout', quantity }],
      }, database);
      await expect(checkout(2)).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        status: 409,
      });
      const controlledStockCheckout = checkout(1);
      await expect(controlledStockCheckout).rejects.toMatchObject({
        code: 'CHECKOUT_STOCK_CONTROLLED_REQUIRES_WHATSAPP',
        status: 409,
      });
      await expect(controlledStockCheckout).rejects.toThrow(/stock controlado.*WhatsApp/iu);
    } finally {
      database.close();
    }
  });

  it('prioriza pedidos WhatsApp pendientes aun fuera del rango administrativo', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('pendiente-prioritario', 1_000, 2), 'admin@test');
      const created = await createWhatsappOrder(database, orderRequest('pendiente-prioritario', 1));
      const range = {
        from: '2020-01-01T00:00:00.000Z',
        to: '2020-01-02T23:59:59.999Z',
        status: null,
        limit: 100,
        offset: 0,
      } as const;
      await expect(listAdminOrdersWithFulfillment(database, range)).resolves.toMatchObject({
        rows: [{ id: created.response.orderId, channel: 'whatsapp', status: 'pending' }],
      });
      await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'rejected',
        'admin@example.test',
      );
      await expect(listAdminOrdersWithFulfillment(database, range)).resolves.toMatchObject({
        rows: [],
      });
    } finally {
      database.close();
    }
  });
});

function productInput(id: string, amount: number, stockQuantity: number): Record<string, unknown> {
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: ['agroecologicos'],
    categoryNames: ['Agroecologicos'],
    presentation: '100 g',
    price: { amount, currency: 'ARS' },
    availability: 'available',
    stockQuantity,
    images: [],
    variants: [],
  };
}

function orderRequest(productId: string, quantity: number) {
  return {
    idempotencyKey: crypto.randomUUID(),
    fulfillment: null,
    items: [{ productId, quantity }],
  };
}

async function count(database: SqliteD1, table: 'orders' | 'order_items'): Promise<number> {
  const row = await database.prepare(`SELECT COUNT(*) AS value FROM ${table}`)
    .first<Readonly<{ value: number }>>();
  return row?.value ?? -1;
}
