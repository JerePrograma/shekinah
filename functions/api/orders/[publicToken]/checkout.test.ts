import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Env, PagesFunctionContext } from '../../../../server/platform';
import { SqliteD1 } from '../../../../server/test/sqlite-d1';
import { onRequest } from './checkout';

const doubles = vi.hoisted(() => ({
  checkout: vi.fn(),
  consume: vi.fn(),
  limits: vi.fn(),
}));

vi.mock('../../../../server/assisted-payment', () => ({
  createOrRecoverAssistedPreference: doubles.checkout,
}));
vi.mock('../../../../server/web-request-rate-limit', () => ({
  consumeWebRequestAccess: doubles.consume,
  webRequestLimits: doubles.limits,
}));

const migration = readFileSync(resolve(process.cwd(), 'migrations', '0001_commerce.sql'), 'utf8');
const token = 'a'.repeat(64);
const mercadoPagoAccessToken = 'TEST-' + '1'.repeat(20);

function context(
  database: SqliteD1,
  changes: Partial<Env> = {},
  origin = 'https://example.test',
  body?: string,
): PagesFunctionContext<Env, 'publicToken'> {
  return {
    request: new Request(`https://example.test/api/orders/${token}/checkout`, {
      method: 'POST',
      headers: { origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body }),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
      COMMERCE_ENABLED: 'true',
      ASSISTED_CHECKOUT_ENABLED: 'true',
      ORDER_TOKEN_SECRET: 'o'.repeat(40),
      MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
      MERCADO_PAGO_ACCESS_TOKEN: mercadoPagoAccessToken,
      MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(40),
      ...changes,
    },
    params: { publicToken: token },
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

beforeEach(() => {
  doubles.checkout.mockReset().mockResolvedValue({
    checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-assisted',
    orderId: `ord_${'b'.repeat(24)}`,
    totalMinor: 123400,
    created: true,
  });
  doubles.consume.mockReset().mockResolvedValue(undefined);
  doubles.limits.mockReset().mockResolvedValue([{ key: 'test', limit: 10 }]);
});

describe('checkout público de solicitud asistida', () => {
  it('usa sólo el token protegido y devuelve la preferencia del servidor', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(database));
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-assisted',
        totalMinor: 123400,
      });
      expect(doubles.checkout).toHaveBeenCalledWith(database, token, {
        accessToken: mercadoPagoAccessToken,
        mode: 'sandbox',
        siteUrl: new URL('https://example.test'),
      });
      expect(doubles.consume).toHaveBeenCalledTimes(1);
    } finally { database.close(); }
  });

  it.each([
    [{ COMMERCE_ENABLED: 'false' }, 'COMMERCE_DISABLED'],
    [{ ASSISTED_CHECKOUT_ENABLED: 'false' }, 'ASSISTED_CHECKOUT_DISABLED'],
  ] as const)('mantiene el kill-switch cerrado (%s)', async (changes, code) => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(database, changes));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: { code } });
      expect(doubles.checkout).not.toHaveBeenCalled();
      expect(doubles.consume).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('rechaza origen ajeno y cualquier body antes de tocar Mercado Pago', async () => {
    const database = new SqliteD1(migration);
    try {
      expect((await onRequest(context(database, {}, 'https://foreign.test'))).status).toBe(403);
      expect((await onRequest(context(database, {}, 'https://example.test', '{}'))).status).toBe(400);
      expect(doubles.checkout).not.toHaveBeenCalled();
      expect(doubles.consume).not.toHaveBeenCalled();
    } finally { database.close(); }
  });

  it('falla cerrado si falta webhook, secreto de pedido o credencial de pago', async () => {
    const database = new SqliteD1(migration);
    try {
      for (const changes of [
        { MERCADO_PAGO_WEBHOOK_SECRET: '' },
        { ORDER_TOKEN_SECRET: '' },
        { MERCADO_PAGO_ACCESS_TOKEN: '' },
      ]) {
        doubles.checkout.mockClear();
        const response = await onRequest(context(database, changes));
        expect(response.status).toBe(503);
        expect(doubles.checkout).not.toHaveBeenCalled();
      }
    } finally { database.close(); }
  });
});
