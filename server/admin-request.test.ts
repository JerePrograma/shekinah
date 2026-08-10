import { handleAdminRequest } from './admin-request';
import type { AdminContextData, Env } from './platform';

const request = new Request('https://example.test/api/admin/summary');

function dataWithIdentity(): AdminContextData {
  return {
    adminIdentity: {
      sub: 'admin-sub',
      actor: 'admin@example.test',
      authMethod: 'cloudflare-access',
    },
    requestId: 'request-test',
  };
}

describe('manejo administrativo fail-closed', () => {
  it('responde JSON controlado cuando falta D1', async () => {
    const response = await handleAdminRequest(
      request,
      {},
      dataWithIdentity(),
      'admin.summary.read',
      () => Promise.resolve(new Response(null, { status: 200 })),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'DATABASE_UNAVAILABLE' },
    });
  });

  it('responde JSON controlado cuando falta la identidad verificada', async () => {
    const env: Env = {
      DB: {
        prepare: () => { throw new Error('No debe consultarse D1.'); },
        batch: () => Promise.resolve([]),
        exec: () => Promise.resolve({ count: 0, duration: 0 }),
      },
    };
    const response = await handleAdminRequest(
      request,
      env,
      {},
      'admin.summary.read',
      () => Promise.resolve(new Response(null, { status: 200 })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ACCESS_TOKEN_MISSING' },
    });
  });
});
