import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../src/test/d1';
import {
  clearAdminLoginAttempts,
  consumeAdminLoginAttempt,
} from './admin-login-rate-limit';
import type { Env } from './platform';

const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0005_admin_auth.sql'),
  'utf8',
);
const secret = 'rate-limit-test-secret-that-is-not-used-in-production-123456';

describe('límite persistente del login administrativo', () => {
  it('bloquea por IP, no persiste datos de entrada y reinicia tras la ventana', async () => {
    const testD1 = createTestD1(migration);
    const env: Env = { DB: testD1.database, ADMIN_RATE_LIMIT_SECRET: secret };
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await consumeAdminLoginAttempt(
          request('198.51.100.4'),
          `10000000${attempt}`,
          env,
          1_000,
        );
      }
      await expect(
        consumeAdminLoginAttempt(
          request('198.51.100.4'),
          '100000009',
          env,
          1_000,
        ),
      ).rejects.toMatchObject({ status: 429, code: 'ADMIN_LOGIN_RATE_LIMITED' });

      const serialized = JSON.stringify(
        testD1.sqlite.prepare('SELECT * FROM admin_login_rate_limits').all(),
      );
      expect(serialized).not.toContain('198.51.100.4');
      expect(serialized).not.toContain('10000000');

      await expect(
        consumeAdminLoginAttempt(
          request('198.51.100.4'),
          '100000010',
          env,
          1_000 + 15 * 60 + 1,
        ),
      ).resolves.toBeUndefined();
    } finally {
      testD1.close();
    }
  });

  it('bloquea intentos distribuidos contra el mismo usuario y permite limpiar un éxito', async () => {
    const testD1 = createTestD1(migration);
    const env: Env = { DB: testD1.database, ADMIN_RATE_LIMIT_SECRET: secret };
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await consumeAdminLoginAttempt(
          request(`198.51.100.${attempt + 1}`),
          '10000000123',
          env,
          2_000,
        );
      }
      const lastRequest = request('203.0.113.2');
      await expect(
        consumeAdminLoginAttempt(lastRequest, '10000000123', env, 2_000),
      ).rejects.toMatchObject({ status: 429, code: 'ADMIN_LOGIN_RATE_LIMITED' });

      await clearAdminLoginAttempts(lastRequest, '10000000123', env);
      await expect(
        consumeAdminLoginAttempt(lastRequest, '10000000123', env, 2_001),
      ).resolves.toBeUndefined();
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado sin D1 o sin secreto independiente', async () => {
    await expect(
      consumeAdminLoginAttempt(request('198.51.100.4'), '10000000123', {}),
    ).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });

    const testD1 = createTestD1(migration);
    try {
      await expect(
        consumeAdminLoginAttempt(
          request('198.51.100.4'),
          '10000000123',
          { DB: testD1.database },
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: 'ADMIN_RATE_LIMIT_CONFIG_MISSING',
      });
    } finally {
      testD1.close();
    }

    const unmigratedD1 = createTestD1();
    try {
      await expect(
        consumeAdminLoginAttempt(
          request('198.51.100.4'),
          '10000000123',
          { DB: unmigratedD1.database, ADMIN_RATE_LIMIT_SECRET: secret },
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: 'ADMIN_RATE_LIMIT_UNAVAILABLE',
      });
    } finally {
      unmigratedD1.close();
    }
  });
});

function request(ip: string): Request {
  return new Request('https://example.test/api/admin/auth/login', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
  });
}
