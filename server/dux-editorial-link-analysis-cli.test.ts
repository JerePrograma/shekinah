import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const generatedAt = '2026-09-03T15:00:00.000Z';

describe('plan editorial Dux/local', () => {
  it('separa identidades, presentaciones y bloqueos de precio sin escribir datos', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'shekinah-dux-editorial-'));
    const sourcePath = resolve(directory, 'source.json');
    const baseReportPath = resolve(directory, 'base-report.json');
    const outputPath = resolve(directory, 'output');

    try {
      const source = sourceFixture();
      const baseReport = baseReportFixture();
      writeFileSync(sourcePath, JSON.stringify(source), 'utf8');
      writeFileSync(baseReportPath, JSON.stringify(baseReport), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          resolve(process.cwd(), 'scripts', 'analyze-dux-editorial-links.mjs'),
          sourcePath,
          baseReportPath,
          outputPath,
        ],
        { encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const report = JSON.parse(readFileSync(
        resolve(outputPath, 'dux-editorial-link-report.json'),
        'utf8',
      )) as Readonly<{
        readOnly: boolean;
        quality: Readonly<Record<string, unknown>>;
        summary: Readonly<Record<string, unknown>>;
        proposals: readonly Readonly<Record<string, unknown>>[];
      }>;

      expect(report).toMatchObject({
        readOnly: true,
        quality: {
          usablePublicPrice: 4,
          placeholderPublicPrice: 1,
          missingOrZeroPublicPrice: 1,
          quantified: 5,
          unquantified: 1,
          cutoverPriceBlockers: 2,
        },
        summary: {
          confirmedIdentity: 1,
          autoFull: 1,
          totalAutoConfirmable: 2,
          reviewImage: 1,
          ambiguous: 1,
          noCandidate: 2,
          duplicateSemanticLocalGroups: 1,
        },
      });

      expect(proposalByCode(report.proposals, 'A')).toMatchObject({
        status: 'confirmed_identity',
        selectedLocalId: 'local-a',
        recommendedFields: ['images', 'description'],
      });
      expect(proposalByCode(report.proposals, 'B')).toMatchObject({
        status: 'auto_full',
        selectedLocalId: 'adobo',
        presentationRelation: 'same',
        recommendedFields: ['images', 'description'],
      });
      expect(proposalByCode(report.proposals, 'C')).toMatchObject({
        status: 'review_image',
        selectedLocalId: 'hierba',
        presentationRelation: 'different',
        recommendedFields: ['images'],
      });
      expect(proposalByCode(report.proposals, 'D')).toMatchObject({
        status: 'ambiguous',
        selectedLocalId: null,
      });

      expect(readFileSync(
        resolve(outputPath, 'auto-confirmable-links.csv'),
        'utf8',
      )).toContain('B,ADOBO 100GR');
      expect(readFileSync(
        resolve(outputPath, 'manual-review-links.csv'),
        'utf8',
      )).toContain('C,HIERBA 100GR');
      expect(readFileSync(
        resolve(outputPath, 'dux-catalog-quality.csv'),
        'utf8',
      )).toContain('F,PRECIO PLACEHOLDER,1,placeholder');
      expect(readFileSync(
        resolve(outputPath, 'local-duplicate-semantic-groups.csv'),
        'utf8',
      )).toContain('hongos de pino');

      expect(JSON.parse(readFileSync(sourcePath, 'utf8'))).toEqual(source);
      expect(JSON.parse(readFileSync(baseReportPath, 'utf8'))).toEqual(baseReport);
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
      duxItem('A', 'NOMBRE DUX A 100GR', 2_000),
      duxItem('B', 'ADOBO 100GR', 2_000),
      duxItem('C', 'HIERBA 100GR', 2_000),
      duxItem('D', 'HONGOS DE PINO 100GR', 2_000),
      duxItem('E', 'SIN CANDIDATO', 0),
      duxItem('F', 'PRECIO PLACEHOLDER', 1),
    ],
    localProducts: [
      localProduct('local-a', 'Nombre editorial A', '100 g', 'Fracción mínima: 100gr'),
      localProduct('adobo', 'Adobo', null, 'Fracción mínima: 100gr'),
      localProduct('hierba', 'Hierba 50gr', '50 g', 'Fracción mínima: 50gr'),
      localProduct('hongos-a', 'Hongos de pino', null, 'Fracción mínima: 100gr'),
      localProduct('hongos-b', 'Hongos de Pino 100gr', '100 g', 'Descripción genérica.'),
    ],
    inventoryUnits: [
      inventoryUnit('A', 'local-a'),
      inventoryUnit('B', null),
      inventoryUnit('C', null),
      inventoryUnit('D', null),
      inventoryUnit('F', null),
    ],
    mercadoLibre: {
      available: false,
      connectionPresent: false,
      sellerId: null,
      nickname: null,
      lastVerifiedAt: null,
      latestRunStatus: null,
      latestRunCompletedAt: null,
      latestSyncedAt: null,
      freshByLegacyThreshold: false,
      maximumAgeSeconds: 900,
      invalidRowCount: 0,
      units: [],
    },
  };
}

function baseReportFixture() {
  return {
    generatedAt,
    readOnly: true,
    matches: [
      baseMatch('A', 'NOMBRE DUX A 100GR', 'confirmed', 'local-a', [
        baseCandidate('local-a', 'Nombre editorial A', 1),
      ]),
      baseMatch('B', 'ADOBO 100GR', 'dux_only', null, []),
      baseMatch('C', 'HIERBA 100GR', 'dux_only', null, []),
      baseMatch('D', 'HONGOS DE PINO 100GR', 'dux_only', null, []),
      baseMatch('E', 'SIN CANDIDATO', 'dux_only', null, []),
      baseMatch('F', 'PRECIO PLACEHOLDER', 'dux_only', null, []),
    ],
  };
}

function duxItem(code: string, name: string, amount: number) {
  return {
    code,
    name,
    enabled: true,
    unitsPerPackage: 1,
    prices: [{ id: 1, name: 'PRECIOS DEL NEGOCIO', amount }],
    category: { id: 10, name: 'Hierbas' },
    subcategory: null,
    imageUrl: null,
    description: null,
  };
}

function localProduct(
  id: string,
  name: string,
  presentation: string | null,
  description: string,
) {
  const image = {
    src: `/images/original/catalog/${id.padEnd(64, 'a').slice(0, 64)}.webp`,
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
    primaryImage: image,
    description,
    images: [image],
    variants: [],
  };
}

function inventoryUnit(code: string, localProductId: string | null) {
  return {
    inventoryKey: `dux:v2:1:3:${code}:base`,
    itemCode: code,
    variantDetailId: null,
    externalCode: null,
    barcode: null,
    itemName: `Item ${code}`,
    localProductId,
    mappingStatus: localProductId === null ? 'unmapped' : 'mapped',
    mappingSource: localProductId === null ? null : 'persisted',
    mappingCandidates: localProductId === null ? [] : [localProductId],
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

function baseMatch(
  code: string,
  name: string,
  status: 'confirmed' | 'dux_only',
  selectedId: string | null,
  candidates: readonly ReturnType<typeof baseCandidate>[],
) {
  return {
    dux: { code, name },
    local: {
      status,
      selectedId,
      candidates,
    },
  };
}

function baseCandidate(id: string, name: string, score: number) {
  return {
    id,
    name,
    score,
    reasons: ['persisted_inventory_mapping'],
  };
}

function proposalByCode(
  proposals: readonly Readonly<Record<string, unknown>>[],
  code: string,
): Readonly<Record<string, unknown>> {
  const proposal = proposals.find((value) => {
    const dux = value.dux;
    return typeof dux === 'object' && dux !== null &&
      'code' in dux && dux.code === code;
  });
  if (proposal === undefined) throw new Error(`No se encontró ${code}.`);
  return proposal;
}
