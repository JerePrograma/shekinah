import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import {
  DUX_V2_ITEM_INVENTORY_SEMANTICS,
  type DuxItem,
  type DuxItemStock,
} from './dux-api';
import {
  listDuxInventoryUnits,
  syncDuxInventory,
  type DuxInventoryReader,
} from './dux-inventory';
import type { Env } from './platform';

const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const duxMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0012_dux_authoritative_inventory.sql'),
  'utf8',
);
const atomicSnapshotMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0014_dux_atomic_inventory_snapshots.sql'),
  'utf8',
);

const env: Env = Object.freeze({
  DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'test-only-token',
  DUX_COMPANY_ID: '1',
  DUX_BRANCH_ID: '2',
  DUX_DEPOSIT_ID: '3',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '300',
});

const products: readonly CatalogProductDetail[] = Object.freeze([
  product(
    'anis-estrellado-100-gramos',
    'Anis en grano x 100 gramos',
    '100 g',
  ),
  product(
    'anis-en-grano',
    'Anís en grano x 100 gr',
    '100 g',
  ),
  product(
    'tintura-andino',
    'Tintura Madre Andino °',
  ),
]);

describe('persistencia de ambigüedades Dux', () => {
  it('conserva 2:1 y 1:2 en una corrida manual posterior al bootstrap', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      duxMigration,
      atomicSnapshotMigration,
    );

    try {
      const items = remoteItems();

      const first = await syncDuxInventory(
        testD1.database,
        env,
        'test',
        {
          kind: 'initial',
          localProducts: products,
          client: reader(items),
          now: () => new Date('2026-08-26T10:00:00.000Z'),
          createRunId: () => 'dux_sync_ambiguity_initial',
        },
      );

      expect(first).toMatchObject({
        processed: 3,
        mapped: 0,
        ambiguous: 3,
        unmapped: 0,
        failed: 0,
      });

      const second = await syncDuxInventory(
        testD1.database,
        env,
        'test',
        {
          kind: 'manual',
          localProducts: products,
          client: reader(items),
          now: () => new Date('2026-08-26T10:02:00.000Z'),
          createRunId: () => 'dux_sync_ambiguity_manual',
        },
      );

      expect(second).toMatchObject({
        processed: 3,
        mapped: 0,
        ambiguous: 3,
        unmapped: 0,
        failed: 0,
      });

      const units = await listDuxInventoryUnits(
        testD1.database,
        env,
        new Date('2026-08-26T10:02:01.000Z'),
      );

      expect(byCode(units, 'ANIS')).toMatchObject({
        mappingStatus: 'ambiguous',
        localProductId: null,
        mappingCandidates: [
          'anis-en-grano',
          'anis-estrellado-100-gramos',
        ],
      });

      for (const code of ['TINTURA-A', 'TINTURA-B']) {
        expect(byCode(units, code)).toMatchObject({
          mappingStatus: 'ambiguous',
          localProductId: 'tintura-andino',
          mappingCandidates: ['tintura-andino'],
        });
      }

      expect(testD1.sqlite.prepare(
        `SELECT changed_count
         FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_ambiguity_manual'`,
      ).get()).toEqual({
        changed_count: 0,
      });
    } finally {
      testD1.close();
    }
  });
});

function reader(items: readonly DuxItem[]): DuxInventoryReader {
  return Object.freeze({
    listEmpresas: () => Promise.resolve([
      { id: 1, legalName: 'Shekinah' },
    ]),
    listSucursales: () => Promise.resolve([
      { id: 2, companyId: 1, name: 'Principal' },
    ]),
    listDepositos: () => Promise.resolve([
      {
        id: 3,
        companyId: 1,
        name: 'Depósito central',
        enabled: true,
      },
    ]),
    listItems: () => Promise.resolve(items),
  });
}

function remoteItems(): readonly DuxItem[] {
  return Object.freeze([
    item('ANIS', 'ANIS EN GRANO 100GR'),
    item('TINTURA-A', 'TINTURA MADRE ANDINO °'),
    item('TINTURA-B', 'TINTURA MADRE ANDINO °'),
  ]);
}

function item(code: string, name: string): DuxItem {
  return Object.freeze({
    code,
    externalCode: null,
    name,
    barcodes: Object.freeze([]),
    enabled: true,
    unitsPerPackage: null,
    stocks: Object.freeze([stock()]),
    inventorySemantics: DUX_V2_ITEM_INVENTORY_SEMANTICS,
  });
}

function stock(): DuxItemStock {
  return Object.freeze({
    warehouseId: 3,
    warehouseName: 'Depósito central',
    realQuantity: 1,
    reservedQuantity: 0,
    availableQuantity: 1,
    variantDetailId: null,
    variantBarcode: null,
    size: null,
    color: null,
  });
}

function product(
  id: string,
  name: string,
  presentation?: string,
): CatalogProductDetail {
  return Object.freeze({
    id,
    slug: id,
    path: `/tienda/producto/${id}/`,
    name,
    categorySlugs: Object.freeze([]),
    categoryNames: Object.freeze([]),
    price: Object.freeze({
      amount: 1_000,
      currency: 'ARS' as const,
    }),
    ...(presentation === undefined ? {} : { presentation }),
    images: Object.freeze([]),
    variants: Object.freeze([]),
  });
}

function byCode<T extends Readonly<{ itemCode: string }>>(
  units: readonly T[],
  code: string,
): T {
  const unit = units.find((candidate) => candidate.itemCode === code);
  if (unit === undefined) {
    throw new Error(`No se encontró ${code}.`);
  }
  return unit;
}