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
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const duxMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0012_dux_authoritative_inventory.sql'),
  'utf8',
);

const fulfillment = Object.freeze({
  method: 'coordinated_pickup' as const,
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
});

// Conservamos estos casos como documentación ejecutable del mecanismo local
// retirado. No deben reactivarse mientras Dux sea la autoridad de inventario.
describe.skip('reservas locales históricas de WhatsApp (fuera del flujo productivo)', () => {
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
      await expect(database.prepare(
        `SELECT address, locality, province, postal_code
         FROM order_fulfillment WHERE order_id = ?`,
      ).bind(created.response.orderId).first()).resolves.toEqual({
        address: '',
        locality: '',
        province: '',
        postal_code: '',
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

  it('exige datos completos antes de crear o reservar un pedido', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('datos-obligatorios', 500, 2), 'admin@test');
      await expect(createWhatsappOrder(database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: 'datos-obligatorios', quantity: 1 }],
      })).rejects.toMatchObject({ status: 400, code: 'WHATSAPP_CONSENT_REQUIRED' });
      await expect(createWhatsappOrder(database, {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: null,
        items: [{ productId: 'datos-obligatorios', quantity: 1 }],
        whatsappConsent: true,
      })).rejects.toMatchObject({ status: 400, code: 'INVALID_FULFILLMENT' });
      expect(await count(database, 'orders')).toBe(0);
      expect(await getCatalogProductDetail(database, 'datos-obligatorios')).toMatchObject({
        reservedQuantity: 0,
        availableQuantity: 2,
      });
    } finally {
      database.close();
    }
  });

  it('valida datos también para cotización manual sin persistir PII innecesaria', async () => {
    const database = new SqliteD1(migration);
    try {
      const input = productInput('cotizacion-manual', 800, 2);
      delete input.presentation;
      await createCatalogProduct(database, input, 'admin@test');
      const request = {
        ...orderRequest('cotizacion-manual', 1),
        fulfillment: { ...fulfillment, method: 'correo_argentino' as const },
      };
      const created = await createWhatsappOrder(database, request);
      expect(created.response.totalMinor).toBe(80_000);
      await expect(database.prepare(
        'SELECT COUNT(*) AS count FROM order_fulfillment WHERE order_id = ?',
      ).bind(created.response.orderId).first<number>('count')).resolves.toBe(0);
      await expect(database.prepare(
        'SELECT whatsapp_fulfillment_fingerprint FROM orders WHERE id = ?',
      ).bind(created.response.orderId).first<string>('whatsapp_fulfillment_fingerprint'))
        .resolves.toMatch(/^[a-f0-9]{64}$/u);
      await expect(createWhatsappOrder(database, request)).resolves.toEqual({
        created: false,
        response: created.response,
      });
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
        fulfillment,
        whatsappConsent: true,
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

  it('conserva la aprobación de reservas históricas sin vencimiento', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('reserva-historica', 1_000, 2), 'admin@test');
      const created = await createWhatsappOrder(database, orderRequest('reserva-historica', 1));
      await database.prepare(
        'UPDATE orders SET stock_reservation_expires_at = NULL WHERE id = ?',
      ).bind(created.response.orderId).run();

      const approved = await resolveWhatsappOrder(
        database,
        created.response.orderId,
        'approved',
        'admin@example.test',
      );
      expect(approved.changed).toBe(true);
      expect(await getCatalogProductDetail(database, 'reserva-historica')).toMatchObject({
        stockQuantity: 1,
        reservedQuantity: 0,
        availableQuantity: 1,
      });
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

  it('comparte la disponibilidad reservada entre WhatsApp y Checkout Pro', async () => {
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
      await expect(checkout(1)).resolves.toMatchObject({ itemCount: 1 });
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

  it('vence la reserva a las 24 horas, la libera una sola vez y bloquea aprobación tardía', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(database, productInput('reserva-vencida', 1_000, 1), 'admin@test');
      const first = await createWhatsappOrder(database, orderRequest('reserva-vencida', 1));
      await database.prepare(
        `UPDATE orders SET stock_reservation_expires_at = '2020-01-01T00:00:00.000Z'
         WHERE id = ?`,
      ).bind(first.response.orderId).run();

      await expect(listCatalogProducts(database)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'reserva-vencida',
            stockQuantity: 1,
            reservedQuantity: 0,
            availableQuantity: 1,
          }),
        ]),
      );
      await expect(resolveWhatsappOrder(
        database,
        first.response.orderId,
        'approved',
        'admin@example.test',
      )).rejects.toMatchObject({ status: 409, code: 'ORDER_STATE_CONFLICT' });
      await expect(database.prepare(
        'SELECT status, last_error_code FROM orders WHERE id = ?',
      ).bind(first.response.orderId).first()).resolves.toEqual({
        status: 'rejected',
        last_error_code: 'WHATSAPP_RESERVATION_EXPIRED',
      });

      const second = await createWhatsappOrder(database, orderRequest('reserva-vencida', 1));
      expect(second.created).toBe(true);
      expect(await getCatalogProductDetail(database, 'reserva-vencida')).toMatchObject({
        stockQuantity: 1,
        reservedQuantity: 1,
        availableQuantity: 0,
      });
    } finally {
      database.close();
    }
  });
});

describe('pedidos WhatsApp con inventario autoritativo Dux', () => {
  it('bloquea un producto local sin vínculo Dux y no crea una reserva local', async () => {
    const database = new SqliteD1(migration);
    try {
      await createCatalogProduct(
        database,
        productInput('whatsapp-sin-dux', 1_000, 10),
        'admin@test',
      );
      await expect(createWhatsappOrder(
        database,
        orderRequest('whatsapp-sin-dux', 1),
      )).rejects.toMatchObject({ status: 503, code: 'DUX_API_DISABLED' });
      expect(await count(database, 'orders')).toBe(0);
      await expect(getCatalogProductDetail(database, 'whatsapp-sin-dux')).resolves.toMatchObject({
        stockQuantity: 10,
        reservedQuantity: 0,
        availableQuantity: 10,
      });
    } finally {
      database.close();
    }
  });

  it('rechaza la reactivación de Mercado Libre antes de consultar o reservar stock', async () => {
    const database = new SqliteD1(migration);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await createCatalogProduct(
        database,
        productInput('whatsapp-sin-mercadolibre', 1_000, 10),
        'admin@test',
      );
      await expect(createWhatsappOrder(
        database,
        orderRequest('whatsapp-sin-mercadolibre', 1),
        { MERCADO_LIBRE_CATALOG_ENABLED: 'true' },
      )).rejects.toMatchObject({
        status: 503,
        code: 'MERCADO_LIBRE_INVENTORY_DISABLED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await count(database, 'orders')).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      database.close();
    }
  });

  it('bloquea la resolución directa de una orden vinculada a Dux', async () => {
    const database = new SqliteD1(`${migration}\n${duxMigration}`);
    try {
      const now = '2026-08-26T12:00:00.000Z';
      await database.prepare(
        `INSERT INTO orders (
          id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
          status, currency, total_minor, item_count, created_at, updated_at, channel
        ) VALUES (?, ?, ?, ?, 'pending', 'ARS', 1000, 1, ?, ?, 'whatsapp')`,
      ).bind(
        'ord_dux_whatsapp_00000000',
        'token_hash_dux_whatsapp',
        'checkout_key_dux_whatsapp',
        'cart_hash_dux_whatsapp',
        now,
        now,
      ).run();
      await database.prepare(
        `INSERT INTO dux_order_links (
          order_id, dux_reference, company_id, branch_id, deposit_id,
          reservation_state, request_fingerprint, created_at, updated_at
        ) VALUES (?, ?, '1', '2', '3', 'blocked', ?, ?, ?)`,
      ).bind(
        'ord_dux_whatsapp_00000000',
        'shekinah:ord_dux_whatsapp_00000000',
        'request_hash_dux_whatsapp',
        now,
        now,
      ).run();

      await expect(resolveWhatsappOrder(
        database,
        'ord_dux_whatsapp_00000000',
        'rejected',
        'admin@test',
      )).rejects.toMatchObject({
        status: 503,
        code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE',
      });
      await expect(database.prepare(
        'SELECT status FROM orders WHERE id = ?',
      ).bind('ord_dux_whatsapp_00000000').first()).resolves.toEqual({ status: 'pending' });
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
    fulfillment,
    items: [{ productId, quantity }],
    whatsappConsent: true,
  };
}

async function count(database: SqliteD1, table: 'orders' | 'order_items'): Promise<number> {
  const row = await database.prepare(`SELECT COUNT(*) AS value FROM ${table}`)
    .first<Readonly<{ value: number }>>();
  return row?.value ?? -1;
}
