import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hmacSha256Hex } from '../../../server/crypto';
import type { RecalculatedCart } from '../../../server/catalog';
import { getOrderById, prepareOrder } from '../../../server/orders';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { SqliteD1 } from '../../../server/test/sqlite-d1';
import { onRequest } from './mercadopago';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const webhookSecret = 's'.repeat(40);
const requestId = 'request-123';
const timestamp = '1720000000';
const dataId = '123456';

function context(database: SqliteD1, request: Request): PagesFunctionContext<Env> {
  return {
    request,
    env: {
      DB: database,
      MERCADO_PAGO_ACCESS_TOKEN: 'access-token-for-tests-only',
      MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
    },
    params: {},
    data: {},
    functionPath: '/api/webhooks/mercadopago',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

async function signature(id = dataId): Promise<string> {
  const digest = await hmacSha256Hex(
    webhookSecret,
    `id:${id};request-id:${requestId};ts:${timestamp};`,
  );
  return `ts=${timestamp},v1=${digest}`;
}

function request(
  body: string,
  contentType: string,
  signatureHeader: string,
): Request {
  return new Request(
    `https://example.test/api/webhooks/mercadopago?data.id=${dataId}`,
    {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-request-id': requestId,
        'x-signature': signatureHeader,
      },
      body,
    },
  );
}

describe('entrada del webhook de Mercado Pago', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rechaza una firma inválida antes de procesar el cuerpo', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(
        database,
        request('{', 'application/json', `ts=${timestamp},v1=${'0'.repeat(64)}`),
      ));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WEBHOOK_SIGNATURE_INVALID' },
      });
    } finally {
      database.close();
    }
  });

  it('exige JSON aun con firma válida', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(
        database,
        request('{}', 'text/plain', await signature()),
      ));
      expect(response.status).toBe(415);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
      });
    } finally {
      database.close();
    }
  });

  it('limita el cuerpo aunque no se declare Content-Length', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(
        database,
        request(`{"padding":"${'x'.repeat(64_001)}"}`, 'application/json', await signature()),
      ));
      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'BODY_TOO_LARGE' },
      });
    } finally {
      database.close();
    }
  });

  it('rechaza un identificador corporal distinto del valor firmado', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(
        database,
        request(JSON.stringify({ data: { id: '999999' } }), 'application/json', await signature()),
      ));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'PAYMENT_ID_MISMATCH' },
      });
    } finally {
      database.close();
    }
  });

  it('aprueba desde la consulta autoritativa sin duplicar efectos en redeliveries', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: testCart(), database, idempotencyKey: crypto.randomUUID(), tokenSecret: 'o'.repeat(40),
      });
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(paymentResponse({
        externalReference: prepared.order.id,
        amountMinor: prepared.order.total_minor,
        currency: 'ARS',
        status: 'approved',
      })));
      globalThis.fetch = fetchMock;
      const body = JSON.stringify({
        id: 'notification-1', type: 'payment', action: 'payment.updated', data: { id: dataId },
      });
      const first = await onRequest(context(database, request(body, 'application/json', await signature())));
      const duplicate = await onRequest(context(database, request(body, 'application/json', await signature())));
      const semanticRedelivery = await onRequest(context(database, request(JSON.stringify({
        id: 'notification-2', type: 'payment', action: 'payment.updated', data: { id: dataId },
      }), 'application/json', await signature())));
      expect(first.status).toBe(200);
      expect(duplicate.status).toBe(200);
      expect(semanticRedelivery.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('approved');
      await expect(database.prepare('SELECT COUNT(*) AS count FROM payments').first())
        .resolves.toEqual({ count: 1 });
      await expect(database.prepare("SELECT COUNT(*) AS count FROM payment_events WHERE status = 'processed'").first())
        .resolves.toEqual({ count: 2 });
    } finally {
      database.close();
    }
  });

  it('persiste las transiciones pending, rejected, approved y refunded consultadas al proveedor', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: testCart(), database, idempotencyKey: crypto.randomUUID(), tokenSecret: 'o'.repeat(40),
      });
      const statuses = ['pending', 'rejected', 'approved', 'refunded'] as const;
      globalThis.fetch = vi.fn<typeof fetch>();
      for (const [index, status] of statuses.entries()) {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(paymentResponse({
          externalReference: prepared.order.id,
          amountMinor: prepared.order.total_minor,
          currency: 'ARS',
          status,
        }));
        const response = await onRequest(context(database, request(JSON.stringify({
          id: `notification-status-${index}`, type: 'payment', action: 'payment.updated', data: { id: dataId },
        }), 'application/json', await signature())));
        expect(response.status).toBe(200);
        expect((await getOrderById(database, prepared.order.id))?.status).toBe(status);
      }
      await expect(database.prepare('SELECT COUNT(*) AS count FROM payments').first())
        .resolves.toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('ignora pagos con monto o moneda diferentes sin aprobar el pedido', async () => {
    for (const mismatch of [
      { amountDelta: 1, currency: 'ARS' },
      { amountDelta: 0, currency: 'USD' },
    ] as const) {
      const database = new SqliteD1(migration);
      try {
        const prepared = await prepareOrder({
          cart: testCart(), database, idempotencyKey: crypto.randomUUID(), tokenSecret: 'o'.repeat(40),
        });
        globalThis.fetch = vi.fn<typeof fetch>(() => Promise.resolve(paymentResponse({
          externalReference: prepared.order.id,
          amountMinor: prepared.order.total_minor + mismatch.amountDelta,
          currency: mismatch.currency,
          status: 'approved',
        })));
        const response = await onRequest(context(database, request(
          JSON.stringify({ id: 'notification-mismatch', type: 'payment', data: { id: dataId } }),
          'application/json',
          await signature(),
        )));
        expect(response.status).toBe(200);
        expect((await getOrderById(database, prepared.order.id))?.status).toBe('preference_pending');
        await expect(database.prepare('SELECT status, error_code FROM payment_events LIMIT 1').first())
          .resolves.toEqual({ status: 'ignored', error_code: 'PAYMENT_AMOUNT_MISMATCH' });
      } finally {
        database.close();
      }
    }
  });
});

function testCart(): RecalculatedCart {
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([Object.freeze({
      product: Object.freeze({
        id: 'producto-prueba', name: 'Producto de prueba', presentation: '50 g',
        available: true, unitPriceMinor: 750_000,
      }),
      quantity: 1,
      subtotalMinor: 750_000,
    })]),
    itemCount: 1,
    productsTotalMinor: 750_000,
    shippingMinor: 0,
    shippingTier: 'coordinated_pickup',
    totalWeightGrams: 50,
    fulfillment: Object.freeze({
      method: 'coordinated_pickup', fullName: 'Ana Pérez', phone: '5491155554444',
      address: 'Calle 123', locality: 'CABA', province: 'Buenos Aires', postalCode: 'C1234ABC',
    }),
    totalMinor: 750_000,
  });
}

function paymentResponse({
  amountMinor,
  currency,
  externalReference,
  status,
}: Readonly<{
  amountMinor: number;
  currency: string;
  externalReference: string;
  status: string;
}>): Response {
  return new Response(JSON.stringify({
    id: dataId,
    external_reference: externalReference,
    status,
    status_detail: 'accredited',
    transaction_amount: amountMinor / 100,
    currency_id: currency,
    date_approved: '2026-08-04T10:00:00.000Z',
    date_last_updated: '2026-08-04T10:00:00.000Z',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}
