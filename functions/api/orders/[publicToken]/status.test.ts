import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { sha256Hex } from '../../../../server/crypto';
import type {
  Env,
  PagesFunctionContext,
} from '../../../../server/platform';
import { SqliteD1 } from '../../../../server/test/sqlite-d1';
import { onRequest } from './status';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);

function context(
  database: SqliteD1,
  publicToken: string,
): PagesFunctionContext<Env, 'publicToken'> {
  return {
    request: new Request(`https://example.test/api/orders/${publicToken}/status`),
    env: { DB: database },
    params: { publicToken },
    data: {},
    functionPath: '/api/orders/[publicToken]/status',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

describe('estado público del pedido', () => {
  it('responde de forma indistinguible para token inválido o inexistente', async () => {
    const database = new SqliteD1(migration);
    try {
      const invalid = await onRequest(context(database, 'token-invalido'));
      const missing = await onRequest(context(database, 'a'.repeat(64)));
      expect(invalid.status).toBe(404);
      expect(missing.status).toBe(404);
      await expect(invalid.json()).resolves.toEqual(await missing.json());
    } finally {
      database.close();
    }
  });

  it('expone sólo el estado público mínimo y no el identificador interno', async () => {
    const database = new SqliteD1(migration);
    const publicToken = 'b'.repeat(64);
    const tokenHash = await sha256Hex(publicToken);
    const now = '2026-07-31T12:00:00.000Z';
    try {
      await database
        .prepare(
          `INSERT INTO orders (
            id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
            status, currency, total_minor, item_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'approved', 'ARS', ?, ?, ?, ?)`,
        )
        .bind(
          'ord_private_internal',
          tokenHash,
          '00000000-0000-4000-8000-000000000000',
          'f'.repeat(64),
          123_400,
          2,
          now,
          now,
        )
        .run();

      const response = await onRequest(context(database, publicToken));
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toEqual({
        status: 'approved',
        currency: 'ARS',
        totalMinor: 123_400,
        itemCount: 2,
        updatedAt: now,
      });
      expect(body).not.toHaveProperty('id');
      expect(JSON.stringify(body)).not.toContain('ord_private_internal');
    } finally {
      database.close();
    }
  });
});
