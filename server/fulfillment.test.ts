import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RecalculatedCart } from './catalog';
import {
  createPaymentCart,
  persistOrderFulfillment,
  requireCheckoutFulfillment,
  reserveCheckoutIntent,
} from './fulfillment';
import { prepareOrder } from './orders';
import { SqliteD1 } from './test/sqlite-d1';

const migration = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
]
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

function cart(locality = 'CABA', shippingMinor = 1_900_000, quantity = 1): RecalculatedCart {
  const unitPriceMinor = 750_000;
  const productsTotalMinor = unitPriceMinor * quantity;
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([
      Object.freeze({
        product: Object.freeze({ id: 'producto-prueba', name: 'Producto de prueba', presentation: '50 g', available: true, unitPriceMinor }),
        quantity,
        subtotalMinor: productsTotalMinor,
      }),
    ]),
    itemCount: quantity,
    productsTotalMinor,
    shippingMinor,
    shippingTier: shippingMinor === 0 ? 'coordinated_pickup' : 'correo_up_to_1kg',
    totalWeightGrams: 50 * quantity,
    fulfillment: Object.freeze({
      method: shippingMinor === 0 ? 'coordinated_pickup' : 'correo_argentino',
      fullName: 'Ana Pérez', phone: '5491155554444', address: 'Calle 123', locality,
      province: 'Buenos Aires', postalCode: 'C1234ABC',
    }),
    totalMinor: productsTotalMinor + shippingMinor,
  });
}

describe('persistencia de fulfillment', () => {
  it('conflicta si la misma clave cambia datos y persiste el snapshot del pedido', async () => {
    const database = new SqliteD1(migration);
    try {
      const idempotencyKey = crypto.randomUUID();
      const firstCart = cart();
      await reserveCheckoutIntent(database, idempotencyKey, firstCart);
      const equivalent = Object.freeze({
        ...firstCart,
        fulfillment: requireCheckoutFulfillment({
          ...firstCart.fulfillment,
          fullName: '  Ana   Pérez ',
          phone: '+54 9 11 5555-4444',
        }),
      });
      await expect(reserveCheckoutIntent(database, idempotencyKey, equivalent)).resolves.toBeUndefined();
      await expect(reserveCheckoutIntent(database, idempotencyKey, cart('La Plata'))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(reserveCheckoutIntent(database, idempotencyKey, cart('CABA', 1_900_000, 2))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await database.prepare('UPDATE checkout_intents SET cart_fingerprint = NULL WHERE checkout_idempotency_key = ?').bind(idempotencyKey).run();
      await expect(reserveCheckoutIntent(database, idempotencyKey, firstCart)).resolves.toBeUndefined();
      const prepared = await prepareOrder({ cart: firstCart, database, idempotencyKey, tokenSecret: 'o'.repeat(40) });
      await persistOrderFulfillment(database, prepared.order.id, firstCart);
      const row = await database.prepare('SELECT * FROM order_fulfillment WHERE order_id = ?').bind(prepared.order.id).first<Record<string, unknown>>();
      expect(row).toMatchObject({ shipping_minor: 1_900_000, products_total_minor: 750_000, locality: 'CABA' });
      expect(createPaymentCart(firstCart).lines).toHaveLength(2);
      expect(createPaymentCart(cart('CABA', 0)).lines).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('permite una sola intención cuando la misma clave compite con dos carritos', async () => {
    const database = new SqliteD1(migration);
    try {
      const idempotencyKey = crypto.randomUUID();
      const outcomes = await Promise.allSettled([
        reserveCheckoutIntent(database, idempotencyKey, cart()),
        reserveCheckoutIntent(database, idempotencyKey, cart('CABA', 1_900_000, 2)),
      ]);
      expect(outcomes.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    } finally {
      database.close();
    }
  });
});
