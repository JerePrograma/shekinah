import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RecalculatedCart } from './catalog';
import {
  createPaymentCart,
  persistOrderFulfillment,
  reserveCheckoutIntent,
} from './fulfillment';
import { prepareOrder } from './orders';
import { SqliteD1 } from './test/sqlite-d1';

const migration = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql']
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

function cart(locality = 'CABA', shippingMinor = 1_900_000): RecalculatedCart {
  const productsTotalMinor = 750_000;
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([
      Object.freeze({
        product: Object.freeze({ id: 'producto-prueba', name: 'Producto de prueba', presentation: '50 g', available: true, unitPriceMinor: productsTotalMinor }),
        quantity: 1,
        subtotalMinor: productsTotalMinor,
      }),
    ]),
    itemCount: 1,
    productsTotalMinor,
    shippingMinor,
    shippingTier: shippingMinor === 0 ? 'coordinated_pickup' : 'correo_up_to_1kg',
    totalWeightGrams: 50,
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
      await reserveCheckoutIntent(database, idempotencyKey, firstCart.fulfillment);
      await expect(reserveCheckoutIntent(database, idempotencyKey, cart('La Plata').fulfillment)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
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
});
