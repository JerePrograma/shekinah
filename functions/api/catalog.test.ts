import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../../src/test/d1';
import type { Env, PagesFunctionContext } from '../../server/platform';
import { onRequest as listCatalog } from './catalog';
import { onRequest as getCatalogProduct } from './catalog/[id]';

const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);

describe('API pública del catálogo', () => {
  it('lista el catálogo efectivo mediante GET y usa respuestas no cacheables', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const response = await listCatalog(context('/api/catalog', testD1.database));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const payload = await response.json() as { products: Array<{ id?: unknown }> };
      expect(payload.products.some(({ id }) => id === 'guayaba')).toBe(true);

      const methodResponse = await listCatalog(context('/api/catalog', testD1.database, 'POST'));
      expect(methodResponse.status).toBe(405);
      expect(methodResponse.headers.get('allow')).toBe('GET');
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si D1 no está configurado y no expone stock compilado', async () => {
    const list = await listCatalog(context('/api/catalog'));
    expect(list.status).toBe(503);
    await expect(list.json()).resolves.toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });

    const detail = await getCatalogProduct(detailContext('guayaba'));
    expect(detail.status).toBe(503);
    await expect(detail.json()).resolves.toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
  });

  it('conserva los 510 productos base si todavía falta la tabla 0004', async () => {
    const testD1 = createTestD1();
    try {
      const listResponse = await listCatalog(context('/api/catalog', testD1.database));
      const listPayload = await listResponse.json() as { products: unknown[] };
      expect(listResponse.status).toBe(200);
      expect(listPayload.products).toHaveLength(510);

      const detailResponse = await getCatalogProduct(
        detailContext('guayaba', testD1.database),
      );
      expect(detailResponse.status).toBe(200);
    } finally {
      testD1.close();
    }
  });
});

function context(
  path: string,
  database?: Env['DB'],
  method = 'GET',
): PagesFunctionContext {
  return {
    request: new Request(`https://example.test${path}`, { method }),
    env: database === undefined ? {} : { DB: database },
    params: {},
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

function detailContext(
  id: string,
  database?: Env['DB'],
): PagesFunctionContext<Env, 'id'> {
  return {
    request: new Request(`https://example.test/api/catalog/${encodeURIComponent(id)}`),
    env: database === undefined ? {} : { DB: database },
    params: { id },
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
