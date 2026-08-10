import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';

import {
  createCatalogProduct,
  getBaseCatalogCategories,
  getCatalogProductDetail,
  replaceCatalogProductImages,
} from '../../../../../server/catalog-store';
import { MAX_CATALOG_IMAGE_BYTES } from '../../../../../server/catalog-images';
import type {
  AdminContextData,
  Env,
  PagesFunctionContext,
} from '../../../../../server/platform';
import { MemoryR2Bucket } from '../../../../../server/test/memory-r2';
import { createTestD1 } from '../../../../../src/test/d1';
import { onRequest as imageResource } from './image';

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
  requestId: 'catalog-image-test',
};
const pngBytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

describe('API administrativa de imagen de producto', () => {
  it('sube, persiste, reemplaza y elimina imágenes administradas', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      await createCatalogProduct(
        testD1.database,
        productInput('producto-con-imagen'),
        'admin@example.test',
      );

      const firstResponse = await imageResource(context(
        testD1.database,
        'producto-con-imagen',
        'PUT',
        pngBytes,
        bucket,
      ));
      expect(firstResponse.status).toBe(200);
      const firstPayload = await firstResponse.json() as {
        product: { primaryImage: { src: string } };
      };
      expect(firstPayload.product.primaryImage.src).toMatch(
        /^\/api\/catalog-images\/[0-9a-f-]+\.png$/u,
      );
      expect(bucket.keys).toHaveLength(1);
      await expect(getCatalogProductDetail(
        testD1.database,
        'producto-con-imagen',
      )).resolves.toMatchObject({
        primaryImage: { src: firstPayload.product.primaryImage.src },
      });

      const secondResponse = await imageResource(context(
        testD1.database,
        'producto-con-imagen',
        'PUT',
        pngBytes,
        bucket,
      ));
      expect(secondResponse.status).toBe(200);
      expect(bucket.keys).toHaveLength(1);
      expect(bucket.deletedKeys).toContain(
        `products/${firstPayload.product.primaryImage.src.slice('/api/catalog-images/'.length)}`,
      );

      const deleteResponse = await imageResource(context(
        testD1.database,
        'producto-con-imagen',
        'DELETE',
        undefined,
        bucket,
      ));
      expect(deleteResponse.status).toBe(200);
      expect(bucket.keys).toHaveLength(0);
      await expect(deleteResponse.json()).resolves.toMatchObject({
        product: { images: [] },
      });
    } finally {
      testD1.close();
    }
  });

  it('permite quitar una imagen legacy sin binding R2', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    try {
      const response = await imageResource(context(
        testD1.database,
        'guayaba',
        'DELETE',
      ));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        product: { id: 'guayaba', images: [] },
      });
    } finally {
      testD1.close();
    }
  });

  it('conserva un objeto administrado mientras otro producto lo referencia', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      await createCatalogProduct(
        testD1.database,
        productInput('imagen-compartida-a'),
        'admin@example.test',
      );
      const uploadResponse = await imageResource(context(
        testD1.database,
        'imagen-compartida-a',
        'PUT',
        pngBytes,
        bucket,
      ));
      const uploaded = await uploadResponse.json() as {
        product: { primaryImage: { src: string; alt: string } };
      };
      const image = uploaded.product.primaryImage;
      await createCatalogProduct(
        testD1.database,
        productInput('imagen-compartida-b'),
        'admin@example.test',
      );
      await replaceCatalogProductImages(
        testD1.database,
        'imagen-compartida-b',
        [image],
        'admin@example.test',
      );

      expect((await imageResource(context(
        testD1.database,
        'imagen-compartida-a',
        'DELETE',
        undefined,
        bucket,
      ))).status).toBe(200);
      expect(bucket.keys).toHaveLength(1);
      expect((await imageResource(context(
        testD1.database,
        'imagen-compartida-b',
        'DELETE',
        undefined,
        bucket,
      ))).status).toBe(200);
      expect(bucket.keys).toHaveLength(0);
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado sin R2 al subir y al eliminar una imagen administrada', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      await createCatalogProduct(
        testD1.database,
        productInput('producto-r2-requerido'),
        'admin@example.test',
      );
      const missingUpload = await imageResource(context(
        testD1.database,
        'producto-r2-requerido',
        'PUT',
        pngBytes,
      ));
      expect(missingUpload.status).toBe(503);

      expect((await imageResource(context(
        testD1.database,
        'producto-r2-requerido',
        'PUT',
        pngBytes,
        bucket,
      ))).status).toBe(200);
      const missingDelete = await imageResource(context(
        testD1.database,
        'producto-r2-requerido',
        'DELETE',
      ));
      expect(missingDelete.status).toBe(503);
      expect((await getCatalogProductDetail(
        testD1.database,
        'producto-r2-requerido',
      ))?.primaryImage).toBeDefined();
    } finally {
      testD1.close();
    }
  });

  it('rechaza magic bytes incoherentes y streams mayores a 4 MiB', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      const mismatch = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        pngBytes,
        bucket,
        'image/jpeg',
      ));
      expect(mismatch.status).toBe(415);
      await expect(mismatch.json()).resolves.toMatchObject({
        error: { code: 'IMAGE_SIGNATURE_MISMATCH' },
      });

      const unsupported = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        new TextEncoder().encode('<svg/>'),
        bucket,
        'image/svg+xml',
      ));
      expect(unsupported.status).toBe(415);
      await expect(unsupported.json()).resolves.toMatchObject({
        error: { code: 'UNSUPPORTED_IMAGE_TYPE' },
      });

      const oversized = new Uint8Array(MAX_CATALOG_IMAGE_BYTES + 1);
      oversized.set(pngBytes);
      const oversizedResponse = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        oversized,
        bucket,
      ));
      expect(oversizedResponse.status).toBe(413);
      expect(bucket.keys).toHaveLength(0);

      const atLimit = new Uint8Array(MAX_CATALOG_IMAGE_BYTES);
      atLimit.set(pngBytes);
      const atLimitResponse = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        atLimit,
        bucket,
      ));
      expect(atLimitResponse.status).toBe(200);
      expect(bucket.keys).toHaveLength(1);
    } finally {
      testD1.close();
    }
  });

  it('elimina el objeto nuevo si D1 falla después del upload', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      testD1.sqlite.exec(`CREATE TRIGGER fail_catalog_image_persist
        BEFORE INSERT ON catalog_product_mutations
        BEGIN
          SELECT RAISE(FAIL, 'forced catalog persistence failure');
        END`);
      const response = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        pngBytes,
        bucket,
      ));
      expect(response.status).toBe(500);
      expect(bucket.keys).toHaveLength(0);
      expect(bucket.deletedKeys).toHaveLength(1);
    } finally {
      testD1.close();
    }
  });

  it('hereda autenticación y protección same-origin', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const bucket = new MemoryR2Bucket();
    try {
      const anonymous = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        pngBytes,
        bucket,
        'image/png',
        {},
      ));
      expect(anonymous.status).toBe(401);
      const crossOrigin = await imageResource(context(
        testD1.database,
        'guayaba',
        'PUT',
        pngBytes,
        bucket,
        'image/png',
        adminData,
        'https://attacker.test',
      ));
      expect(crossOrigin.status).toBe(403);
      expect(bucket.keys).toHaveLength(0);
    } finally {
      testD1.close();
    }
  });
});

function productInput(id: string): Record<string, unknown> {
  const category = getBaseCatalogCategories()[0];
  if (category === undefined) throw new Error('Falta categoría canónica para la prueba.');
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: [category.slug],
    categoryNames: [category.name],
    price: { amount: 1_000, currency: 'ARS' },
    availability: 'available',
    images: [],
    variants: [],
  };
}

function context(
  database: NonNullable<Env['DB']>,
  id: string,
  method: 'PUT' | 'DELETE',
  body?: Uint8Array<ArrayBuffer>,
  bucket?: MemoryR2Bucket,
  contentType = 'image/png',
  data: AdminContextData = adminData,
  origin = 'https://example.test',
): PagesFunctionContext<Env, 'id', AdminContextData> {
  return {
    request: new Request(`https://example.test/api/admin/products/${id}/image`, {
      method,
      headers: {
        ...(method === 'PUT' ? { 'content-type': contentType } : {}),
        origin,
      },
      ...(body === undefined ? {} : { body }),
    }),
    env: {
      DB: database,
      ...(bucket === undefined ? {} : { CATALOG_IMAGES: bucket }),
      PUBLIC_SITE_URL: 'https://example.test',
    },
    params: { id },
    data,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
