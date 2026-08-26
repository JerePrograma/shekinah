import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCatalogProduct } from '../../../server/catalog-store';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { createWhatsappOrder } from '../../../server/whatsapp-orders';
import { createTestD1 } from '../../../src/test/d1';
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
  '0009_mercadolibre_catalog_and_inventory.sql',
  '0010_checkout_terminal_reservation_release.sql',
  '0011_local_order_stock_required.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'));

const fulfillment = Object.freeze({
  method: 'coordinated_pickup' as const,
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
});

describe('retiro del stock local en pedidos WhatsApp', () => {
  it('la API falla cerrada en Dux antes de consultar el stock local', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createUnconfiguredProduct(testD1.database, 'whatsapp-sin-stock-api');
      const response = await whatsappOrder(publicContext(
        testD1.database,
        orderRequest('whatsapp-sin-stock-api'),
      ));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'DUX_API_DISABLED' },
      });
      await expect(testD1.database.prepare(
        'SELECT COUNT(*) AS value FROM orders',
      ).first<number>('value')).resolves.toBe(0);
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado antes del stock local aunque se invoque el servicio directamente', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createUnconfiguredProduct(testD1.database, 'whatsapp-sin-stock-directo');

      await expect(createWhatsappOrder(
        testD1.database,
        orderRequest('whatsapp-sin-stock-directo'),
      )).rejects.toMatchObject({
        status: 503,
        code: 'DUX_API_DISABLED',
      });
      await expect(testD1.database.prepare(
        'SELECT COUNT(*) AS value FROM orders',
      ).first<number>('value')).resolves.toBe(0);
    } finally {
      testD1.close();
    }
  });
});

async function createUnconfiguredProduct(
  database: NonNullable<Env['DB']>,
  id: string,
): Promise<void> {
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
    images: [],
    variants: [],
  }, 'admin@example.test');
}

function orderRequest(productId: string) {
  return {
    idempotencyKey: crypto.randomUUID(),
    fulfillment,
    items: [{ productId, quantity: 1 }],
    whatsappConsent: true,
  };
}

function publicContext(
  database: NonNullable<Env['DB']>,
  body: unknown,
): PagesFunctionContext {
  return {
    request: new Request('https://example.test/api/orders/whatsapp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://example.test',
      },
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
