import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AdminContextData, Env, PagesFunctionContext } from '../../../server/platform';
import { SqliteD1 } from '../../../server/test/sqlite-d1';
import { onRequest } from './commerce-readiness';

function migrations(): string {
  const root = resolve(process.cwd(), 'migrations');
  return readdirSync(root)
    .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
    .sort()
    .map((name) => readFileSync(resolve(root, name), 'utf8'))
    .join('\n');
}

function context(
  database: SqliteD1,
  authenticated = true,
  method = 'GET',
): PagesFunctionContext<Env, string, AdminContextData> {
  return {
    request: new Request('https://shekinah.ar/api/admin/commerce-readiness', { method }),
    env: {
      DB: database,
      WEB_ORDERS_ENABLED: 'false',
      COMMERCE_ENABLED: 'false',
      DUX_API_ENABLED: 'false',
      DUX_API_TOKEN: 'dux-secret-do-not-expose',
      DUX_COMPANY_ID: '12862',
      DUX_BRANCH_ID: '1',
      DUX_DEPOSIT_ID: '25566',
      ORDER_TOKEN_SECRET: 'o'.repeat(40),
      MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
      MERCADO_PAGO_ACCESS_TOKEN: 'sandbox-token-do-not-expose-123456',
      MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(40),
      PUBLIC_SITE_URL: 'https://shekinah.ar',
    },
    params: {},
    data: authenticated
      ? {
          adminIdentity: {
            sub: 'admin-readiness-test',
            actor: 'admin-readiness-test',
            authMethod: 'password',
          },
          requestId: 'readiness-request',
        }
      : {},
    functionPath: '/api/admin/commerce-readiness',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

describe('endpoint administrativo de preparación comercial', () => {
  it('requiere identidad administrativa y no expone secretos', async () => {
    const database = new SqliteD1(migrations());
    try {
      const unauthorized = await onRequest(context(database, false));
      expect(unauthorized.status).toBe(401);

      const response = await onRequest(context(database));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = await response.json() as Record<string, unknown>;
      expect(body).toHaveProperty('webRequests.schemaReady', true);
      expect(body).toHaveProperty('checkout.automaticDuxMutationAllowed', false);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('dux-secret-do-not-expose');
      expect(serialized).not.toContain('sandbox-token-do-not-expose');
      expect(serialized).not.toContain('oooooooooooooooo');
      expect(database.database.prepare(
        "SELECT COUNT(*) AS count FROM admin_audit WHERE action = 'admin.commerce.readiness'",
      ).get()?.count).toBe(1);
    } finally {
      database.close();
    }
  });

  it('es sólo lectura y rechaza métodos mutantes', async () => {
    const database = new SqliteD1(migrations());
    try {
      const before = database.database.prepare('SELECT total_changes() AS total').get()?.total;
      const response = await onRequest(context(database, true, 'POST'));
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
      expect(database.database.prepare('SELECT total_changes() AS total').get()?.total).toBe(before);
    } finally {
      database.close();
    }
  });
});
