import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hmacSha256Hex } from '../../../server/crypto';
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
});
