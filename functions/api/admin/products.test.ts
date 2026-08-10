import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getBaseCatalogCategories } from '../../../server/catalog-store';
import type {
  AdminContextData,
  Env,
  PagesFunctionContext,
} from '../../../server/platform';
import { createTestD1 } from '../../../src/test/d1';
import { onRequest as productsCollection } from './products';
import { onRequest as productResource } from './products/[id]';

const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);
const adminData: AdminContextData = {
  adminIdentity: {
    sub: 'admin-sub',
    actor: 'admin@example.test',
    authMethod: 'cloudflare-access',
  },
  requestId: 'catalog-admin-test',
};

describe('API administrativa de productos', () => {
  it('lista, crea, lee, actualiza y elimina con auditoría', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    try {
      const listResponse = await productsCollection(collectionContext(testD1.database));
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { products: unknown[] };
      expect(listPayload.products).toHaveLength(510);

      const createdProduct = productInput('producto-api');
      const createResponse = await productsCollection(collectionContext(
        testD1.database,
        'POST',
        createdProduct,
      ));
      expect(createResponse.status).toBe(201);
      await expect(createResponse.json()).resolves.toMatchObject({
        product: { id: 'producto-api', price: { amount: 1_000 } },
      });

      const readResponse = await productResource(resourceContext(
        testD1.database,
        'producto-api',
      ));
      expect(readResponse.status).toBe(200);

      const updateResponse = await productResource(resourceContext(
        testD1.database,
        'producto-api',
        'PUT',
        { ...createdProduct, price: { amount: 2_345.67, currency: 'ARS' } },
      ));
      expect(updateResponse.status).toBe(200);
      await expect(updateResponse.json()).resolves.toMatchObject({
        product: { id: 'producto-api', price: { amount: 2_345.67 } },
      });

      const deleteResponse = await productResource(resourceContext(
        testD1.database,
        'producto-api',
        'DELETE',
      ));
      expect(deleteResponse.status).toBe(204);
      const missingResponse = await productResource(resourceContext(
        testD1.database,
        'producto-api',
      ));
      expect(missingResponse.status).toBe(404);

      const auditedActions = testD1.sqlite
        .prepare('SELECT action FROM admin_audit ORDER BY created_at, rowid')
        .all()
        .map((row) => row.action);
      expect(auditedActions).toEqual(expect.arrayContaining([
        'catalog.products.list',
        'catalog.products.create',
        'catalog.products.read',
        'catalog.products.update',
        'catalog.products.delete',
      ]));
    } finally {
      testD1.close();
    }
  });

  it('rechaza método, input inválido, origen cruzado y falta de identidad', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    try {
      const methodResponse = await productsCollection(collectionContext(
        testD1.database,
        'PATCH',
      ));
      expect(methodResponse.status).toBe(405);
      expect(methodResponse.headers.get('allow')).toBe('GET, POST');

      const invalidResponse = await productsCollection(collectionContext(
        testD1.database,
        'POST',
        { ...productInput('producto-invalido'), variants: [{ available: true, options: [] }] },
      ));
      expect(invalidResponse.status).toBe(400);
      await expect(invalidResponse.json()).resolves.toMatchObject({
        error: { code: 'INVALID_PRODUCT' },
      });

      const crossOriginResponse = await productsCollection(collectionContext(
        testD1.database,
        'POST',
        productInput('producto-cross-origin'),
        adminData,
        'https://attacker.test',
      ));
      expect(crossOriginResponse.status).toBe(403);
      await expect(crossOriginResponse.json()).resolves.toMatchObject({
        error: { code: 'ORIGIN_REJECTED' },
      });

      const noIdentityResponse = await productsCollection(collectionContext(
        testD1.database,
        'GET',
        undefined,
        {},
      ));
      expect(noIdentityResponse.status).toBe(401);
      await expect(noIdentityResponse.json()).resolves.toMatchObject({
        error: { code: 'ACCESS_TOKEN_MISSING' },
      });
    } finally {
      testD1.close();
    }
  });

  it('devuelve CATALOG_MIGRATION_REQUIRED cuando 0004 todavía no fue aplicada', async () => {
    const testD1 = createTestD1(commerceMigration);
    try {
      const response = await productsCollection(collectionContext(
        testD1.database,
        'POST',
        productInput('producto-sin-migracion'),
      ));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'CATALOG_MIGRATION_REQUIRED' },
      });
      expect(testD1.sqlite.prepare(
        "SELECT action, outcome_status FROM admin_audit WHERE action = 'catalog.products.create'",
      ).get()).toEqual({ action: 'catalog.products.create', outcome_status: 503 });
    } finally {
      testD1.close();
    }
  });
});

function productInput(id: string): Record<string, unknown> {
  const category = getBaseCatalogCategories()[0];
  if (category === undefined) throw new Error('No existe una categoría canónica para pruebas.');
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: [category.slug],
    categoryNames: [category.name],
    presentation: '100 g',
    price: { amount: 1_000, currency: 'ARS' },
    sku: `SKU-${id}`,
    availability: 'available',
    shortDescription: 'Descripción breve',
    description: 'Descripción completa',
    images: [],
    variants: [],
  };
}

function collectionContext(
  database: NonNullable<Env['DB']>,
  method = 'GET',
  body?: unknown,
  data: AdminContextData = adminData,
  origin = 'https://example.test',
): PagesFunctionContext<Env, string, AdminContextData> {
  return {
    request: new Request('https://example.test/api/admin/products', {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json', origin },
            body: JSON.stringify(body),
          }),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
    },
    params: {},
    data,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

function resourceContext(
  database: NonNullable<Env['DB']>,
  id: string,
  method = 'GET',
  body?: unknown,
): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(`https://example.test/api/admin/products/${id}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json', origin: 'https://example.test' },
            body: JSON.stringify(body),
          }),
      ...(method === 'DELETE' ? { headers: { origin: 'https://example.test' } } : {}),
    }),
    env: {
      DB: database,
      PUBLIC_SITE_URL: 'https://example.test',
    },
    params: { id },
    data: adminData,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
