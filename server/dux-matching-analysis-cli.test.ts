import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const generatedAt = '2026-09-03T12:00:00.000Z';

describe('análisis local Dux/local/Mercado Libre', () => {
  it('genera resumen y CSV sin modificar la fuente', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'shekinah-dux-matching-'));
    const input = resolve(directory, 'source.json');
    const output = resolve(directory, 'output');
    try {
      writeFileSync(input, JSON.stringify(sourceFixture()), 'utf8');
      const result = spawnSync(
        process.execPath,
        [
          resolve(process.cwd(), 'scripts', 'analyze-dux-catalog-matches.mjs'),
          input,
          output,
        ],
        { encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const summary = JSON.parse(readFileSync(
        resolve(output, 'catalog-matching-summary.json'),
        'utf8',
      )) as Readonly<Record<string, unknown>>;
      expect(summary).toMatchObject({
        summary: {
          confirmedOneToOne: 1,
          suggestedOneToOne: 1,
          ambiguous: 1,
          duxOnly: 1,
          localOnly: 1,
          mercadoLibreOnlyPublications: 1,
        },
      });
      expect(readFileSync(resolve(output, 'dux-local-matching.csv'), 'utf8'))
        .toContain('A,NOMBRE DUX A,2000');
      expect(readFileSync(resolve(output, 'review-required.csv'), 'utf8'))
        .toContain('C,ANIS EN GRANO 100 GR,ambiguous');
      expect(readFileSync(resolve(output, 'local-only.csv'), 'utf8'))
        .toContain('solo-local');
      expect(readFileSync(resolve(output, 'mercadolibre-only.csv'), 'utf8'))
        .toContain('MLA3');
      const sourceAfter = JSON.parse(readFileSync(input, 'utf8')) as unknown;
      expect(sourceAfter).toEqual(sourceFixture());
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function sourceFixture() {
  return {
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    priceListName: 'PRECIOS DEL NEGOCIO',
    duxItems: [
      duxItem('A', 'NOMBRE DUX A'),
      duxItem('B', 'Hierba B 100gr'),
      duxItem('C', 'ANIS EN GRANO 100 GR'),
      duxItem('D', 'PRODUCTO EXCLUSIVO DUX'),
    ],
    localProducts: [
      localProduct('local-a', 'Nombre editorial A', 'A', true, true),
      localProduct('local-b', 'Hierba B', null, false, true, '100 g'),
      localProduct('anis-a', 'Anís en grano 100gr'),
      localProduct('anis-b', 'Anis en grano 100 g'),
      localProduct('solo-local', 'Producto sólo local'),
    ],
    inventoryUnits: [inventoryUnit('A', 'local-a')],
    mercadoLibre: {
      available: true,
      connectionPresent: true,
      sellerId: '1',
      nickname: 'SHEKINAH',
      lastVerifiedAt: generatedAt,
      latestRunStatus: 'succeeded',
      latestRunCompletedAt: generatedAt,
      latestSyncedAt: generatedAt,
      freshByLegacyThreshold: true,
      maximumAgeSeconds: 900,
      invalidRowCount: 0,
      units: [
        mercadoLibreUnit('MLA1', 'A', 'local-a', 'NOMBRE DUX A'),
        mercadoLibreUnit('MLA2', null, 'local-b', 'Otro título de B'),
        mercadoLibreUnit('MLA3', 'ML-ONLY', null, 'Publicación sólo Mercado Libre'),
      ],
    },
  };
}

function duxItem(code: string, name: string) {
  return {
    code,
    name,
    enabled: true,
    unitsPerPackage: 1,
    prices: [{ id: 1, name: 'PRECIOS DEL NEGOCIO', amount: 2_000 }],
    category: { id: 10, name: 'Hierbas' },
    subcategory: null,
    imageUrl: null,
    description: null,
  };
}

function localProduct(
  id: string,
  name: string,
  sku: string | null = null,
  withImage = false,
  withDescription = false,
  presentation: string | null = null,
) {
  const image = {
    src: `/images/original/catalog/${'a'.repeat(64)}.webp`,
    alt: `Imagen ${id}`,
  };
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name,
    categorySlugs: [],
    categoryNames: [],
    ...(presentation === null ? {} : { presentation }),
    price: { amount: 1_000, currency: 'ARS' },
    ...(sku === null ? {} : { sku }),
    ...(withImage ? { primaryImage: image } : {}),
    ...(withDescription ? { description: `Descripción ${id}` } : {}),
    images: withImage ? [image] : [],
    variants: [],
  };
}

function inventoryUnit(code: string, localProductId: string) {
  return {
    inventoryKey: `dux:v2:1:3:${code}:base`,
    itemCode: code,
    variantDetailId: null,
    externalCode: null,
    barcode: null,
    itemName: `Item ${code}`,
    localProductId,
    mappingStatus: 'mapped',
    mappingSource: 'persisted',
    mappingCandidates: [localProductId],
    depositId: '3',
    depositName: 'Principal',
    observedStock: { real: 5, reserved: 1, available: 4 },
    unitsPerPackage: 1,
    unit: null,
    isWeighable: null,
    allowsDecimal: null,
    commercialQuantityStep: null,
    quantitySemanticsStatus: 'unavailable_from_v2_items',
    checkoutEligible: false,
    catalogVersion: 'b'.repeat(64),
    lastSyncStatus: 'ok',
    lastSyncErrorCode: null,
    lastSyncedAt: generatedAt,
    absentSince: null,
    fresh: true,
  };
}

function mercadoLibreUnit(
  itemId: string,
  sellerSku: string | null,
  localProductId: string | null,
  title: string,
) {
  return {
    itemId,
    variationId: null,
    sellerSku,
    localProductId,
    title,
    itemStatus: 'active',
    primaryImageUrl: `https://http2.mlstatic.com/${itemId}.jpg`,
    permalink: `https://articulo.mercadolibre.com.ar/${itemId}`,
    mappingStatus: localProductId === null ? 'unmapped' : 'mapped',
    lastSyncStatus: 'ok',
    lastSyncedAt: generatedAt,
  };
}
