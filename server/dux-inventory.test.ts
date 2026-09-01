import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1, type TestD1 } from '../src/test/d1';
import {
  DUX_V2_ITEM_INVENTORY_SEMANTICS,
  type DuxBranch,
  type DuxCompany,
  type DuxItem,
  type DuxItemStock,
  type DuxWarehouse,
} from './dux-api';
import {
  buildDuxInventoryKey,
  getDuxInventoryStatus,
  getDuxInventoryUnitForDisplay,
  listDuxInventoryUnits,
  readDuxInventoryConfig,
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

const env: Env = Object.freeze({
  DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'test-only-token',
  DUX_COMPANY_ID: '1',
  DUX_BRANCH_ID: '2',
  DUX_DEPOSIT_ID: '3',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '300',
});

describe('proyección autoritativa read-only de Dux', () => {
  it('mapea por identidad externa, SKU, barcode y nombre sólo en bootstrap; luego prioriza el vínculo persistido', async () => {
    const testD1 = database();
    try {
      const products = [
        product('externo', 'Producto externo'),
        product('por-sku', 'Producto por SKU', 'SKU-2'),
        product('por-barcode', 'Producto por barcode', '779000000001'),
        product('por-nombre', 'Té Verde'),
        product('preservado', 'Producto local preservado'),
      ];
      const firstClient = reader([
        item('ITEM-EXT', 'Producto remoto', [stock(3, 7.5)], { externalCode: 'externo' }),
        item('SKU-2', 'Otro nombre', [stock(3, 5)]),
        item('ITEM-BARCODE', 'Otro barcode', [stock(3, 6)], {
          barcodes: ['779000000001'],
        }),
        item('ITEM-NAME', 'TÉ   VERDE', [stock(3, 4)]),
        item('ITEM-NONE', 'Sin coincidencia', [stock(3, 3)]),
      ]);
      const first = await sync(
        testD1,
        firstClient,
        products,
        'dux_sync_first',
        '2026-08-26T10:00:00.000Z',
        'initial',
      );
      expect(first).toMatchObject({
        status: 'succeeded',
        processed: 5,
        mapped: 4,
        unmapped: 1,
        ambiguous: 0,
        localProductsPreserved: 5,
      });
      const units = await listDuxInventoryUnits(testD1.database, env, date('2026-08-26T10:01:00.000Z'));
      expect(byCode(units, 'ITEM-EXT')).toMatchObject({
        localProductId: 'externo',
        mappingStatus: 'mapped',
        mappingSource: 'codigo_externo',
      });
      expect(byCode(units, 'SKU-2')).toMatchObject({
        localProductId: 'por-sku',
        mappingSource: 'sku',
      });
      expect(byCode(units, 'ITEM-BARCODE')).toMatchObject({
        localProductId: 'por-barcode',
        mappingSource: 'cod_barra',
      });
      expect(byCode(units, 'ITEM-NAME')).toMatchObject({
        localProductId: 'por-nombre',
        mappingSource: 'exact_name',
      });
      expect(byCode(units, 'ITEM-NONE')).toMatchObject({
        localProductId: null,
        mappingStatus: 'unmapped',
        mappingCandidates: [],
      });

      const firstVersion = byCode(units, 'ITEM-EXT').catalogVersion;
      await sync(
        testD1,
        reader([
          item('ITEM-EXT', 'Producto remoto', [stock(3, 7.5)], { externalCode: 'por-sku' }),
          item('ITEM-LATE-NAME', 'TÉ VERDE', [stock(3, 2)]),
        ]),
        products,
        'dux_sync_second',
        '2026-08-26T10:02:00.000Z',
      );
      const persisted = await listDuxInventoryUnits(
        testD1.database,
        env,
        date('2026-08-26T10:02:01.000Z'),
      );
      expect(byCode(persisted, 'ITEM-EXT')).toMatchObject({
        localProductId: 'externo',
        mappingSource: 'persisted',
      });
      expect(byCode(persisted, 'ITEM-LATE-NAME')).toMatchObject({
        localProductId: null,
        mappingStatus: 'unmapped',
      });
      expect(byCode(persisted, 'ITEM-EXT').catalogVersion).not.toBe(firstVersion);
      expect(persisted.filter((unit) => unit.lastSyncStatus === 'absent')).toHaveLength(4);
      expect(products).toHaveLength(5);
    } finally {
      testD1.close();
    }
  });

  it('marca ambigüedad por múltiples candidatos exactos y por una oferta local candidata a varias filas Dux', async () => {
    const testD1 = database();
    try {
      const products = [
        product('sku-a', 'SKU A', 'DUPLICADO'),
        product('sku-b', 'SKU B', 'DUPLICADO'),
        product('compartido', 'Compartido'),
      ];
      const summary = await sync(testD1, reader([
        item('DUPLICADO', 'No aplica', [stock(3, 8)]),
        item('ROW-A', 'Fila A', [stock(3, 6)], { externalCode: 'compartido' }),
        item('ROW-B', 'Fila B', [stock(3, 5)], { externalCode: 'compartido' }),
      ]), products, 'dux_sync_ambiguous');
      expect(summary).toMatchObject({ processed: 3, mapped: 0, unmapped: 0, ambiguous: 3 });
      const units = await listDuxInventoryUnits(testD1.database, env);
      expect(byCode(units, 'DUPLICADO')).toMatchObject({
        mappingStatus: 'ambiguous',
        localProductId: null,
        mappingCandidates: ['sku-a', 'sku-b'],
      });
      expect(byCode(units, 'ROW-A')).toMatchObject({
        mappingStatus: 'ambiguous',
        localProductId: 'compartido',
        mappingCandidates: ['compartido'],
      });
      expect(byCode(units, 'ROW-B')).toMatchObject({
        mappingStatus: 'ambiguous',
        localProductId: 'compartido',
        mappingCandidates: ['compartido'],
      });
    } finally {
      testD1.close();
    }
  });

  it('conserva decimales y negativos sin recalcular, produce hash estable y nunca habilita checkout sin semántica', async () => {
    const testD1 = database();
    try {
      const products = [product('decimal', 'Producto decimal')];
      const remote = item('DECIMAL', 'Producto decimal remoto', [stock(
        3,
        702.1,
        { real: 738.5, reserved: 36.4, variantDetailId: 44 },
      )], { externalCode: 'decimal', unitsPerPackage: 2.44 });
      await sync(testD1, reader([remote]), products, 'dux_sync_decimal_first');
      const first = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'decimal',
        date('2026-08-26T10:00:01.000Z'),
      );
      expect(first).toMatchObject({
        inventoryKey: buildDuxInventoryKey(1, 3, 'DECIMAL', 44),
        observedStock: { real: 738.5, reserved: 36.4, available: 702.1 },
        unitsPerPackage: 2.44,
        unit: null,
        isWeighable: null,
        allowsDecimal: null,
        commercialQuantityStep: null,
        quantitySemanticsStatus: 'unavailable_from_v2_items',
        checkoutEligible: false,
        fresh: true,
      });
      const firstVersion = required(first).catalogVersion;
      await sync(
        testD1,
        reader([remote]),
        products,
        'dux_sync_decimal_second',
        '2026-08-26T10:01:00.000Z',
      );
      const second = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'decimal',
        date('2026-08-26T10:01:01.000Z'),
      );
      expect(required(second).catalogVersion).toBe(firstVersion);

      const negative = item('NEGATIVE', 'Negativo', [stock(
        3,
        -2.44,
        { real: -1.25, reserved: 1.19 },
      )]);
      await sync(
        testD1,
        reader([remote, negative]),
        products,
        'dux_sync_negative',
        '2026-08-26T10:02:00.000Z',
      );
      const units = await listDuxInventoryUnits(testD1.database, env, date('2026-08-26T10:02:01.000Z'));
      expect(byCode(units, 'NEGATIVE').observedStock).toEqual({
        real: -1.25,
        reserved: 1.19,
        available: -2.44,
      });
      expect((await getDuxInventoryStatus(testD1.database, env)).counts.negativeStock).toBe(1);
    } finally {
      testD1.close();
    }
  });

  it('marca filas ausentes sin borrarlas y considera obsoleto el snapshot fuera del máximo', async () => {
    const testD1 = database();
    try {
      const products = [product('vigente', 'Vigente')];
      await sync(testD1, reader([
        item('VIGENTE', 'Vigente remoto', [stock(3, 4)], { externalCode: 'vigente' }),
      ]), products, 'dux_sync_present');
      const stale = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'vigente',
        date('2026-08-26T10:05:01.000Z'),
      );
      expect(stale).toMatchObject({ fresh: false, checkoutEligible: false, lastSyncStatus: 'ok' });

      const summary = await sync(
        testD1,
        reader([item('VIGENTE', 'Vigente remoto', [stock(99, 100)], {
          externalCode: 'vigente',
        })]),
        products,
        'dux_sync_absent',
        '2026-08-26T10:06:00.000Z',
      );
      expect(summary).toMatchObject({
        status: 'partial',
        processed: 1,
        failed: 1,
        absent: 1,
      });
      const absent = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'vigente',
        date('2026-08-26T10:06:01.000Z'),
      );
      expect(absent).toMatchObject({
        lastSyncStatus: 'absent',
        fresh: false,
        checkoutEligible: false,
        absentSince: '2026-08-26T10:06:00.000Z',
      });
      expect(await listDuxInventoryUnits(testD1.database, env)).toHaveLength(1);
      expect((await getDuxInventoryStatus(testD1.database, env)).latestRun).toMatchObject({
        status: 'partial',
        failed: 1,
      });

      await sync(
        testD1,
        reader([
          item('VIGENTE-NUEVO', 'Vigente remoto', [stock(3, 2.44)], {
            externalCode: 'vigente',
          }),
        ]),
        products,
        'dux_sync_reidentified',
        '2026-08-26T10:07:00.000Z',
      );
      const reidentified = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'vigente',
        date('2026-08-26T10:07:01.000Z'),
      );
      expect(reidentified).toMatchObject({
        itemCode: 'VIGENTE-NUEVO',
        lastSyncStatus: 'ok',
        observedStock: { available: 2.44 },
      });
      expect(await listDuxInventoryUnits(testD1.database, env)).toHaveLength(2);
    } finally {
      testD1.close();
    }
  });

  it('conserva el último snapshot ante caída Dux y registra la corrida fallida', async () => {
    const testD1 = database();
    try {
      const products = [product('estable', 'Estable')];
      await sync(testD1, reader([
        item('ESTABLE', 'Estable remoto', [stock(3, 9)], { externalCode: 'estable' }),
      ]), products, 'dux_sync_good');
      const failing = reader([], new Error('provider unavailable'));
      await expect(sync(
        testD1,
        failing,
        products,
        'dux_sync_failed',
        '2026-08-26T10:03:00.000Z',
      )).rejects.toThrow('provider unavailable');
      const unit = await getDuxInventoryUnitForDisplay(
        testD1.database,
        env,
        'estable',
        date('2026-08-26T10:03:01.000Z'),
      );
      expect(unit).toMatchObject({ observedStock: { available: 9 }, lastSyncStatus: 'ok' });
      const status = await getDuxInventoryStatus(
        testD1.database,
        env,
        date('2026-08-26T10:03:01.000Z'),
      );
      expect(status.latestRun).toMatchObject({
        id: 'dux_sync_failed',
        status: 'failed',
        errorCode: 'DUX_SYNC_FAILED',
      });
    } finally {
      testD1.close();
    }
  });

  it('usa un lease global, rechaza concurrencia y recupera leases abandonados', async () => {
    const testD1 = database();
    try {
      testD1.sqlite.prepare(
        `INSERT INTO dux_sync_runs (
          id, kind, status, trigger_actor, started_at, created_at, updated_at
        ) VALUES (?, 'scheduled', 'running', 'scheduler', ?, ?, ?)`,
      ).run(
        'dux_sync_active',
        '2026-08-26T09:59:00.000Z',
        '2026-08-26T09:59:00.000Z',
        '2026-08-26T09:59:00.000Z',
      );
      const blockedClient = reader([]);
      await expect(sync(
        testD1,
        blockedClient,
        [],
        'dux_sync_blocked',
      )).rejects.toMatchObject({ code: 'DUX_SYNC_IN_PROGRESS', status: 409 });
      expect(blockedClient.calls.items).toBe(0);

      const recovered = await sync(
        testD1,
        reader([]),
        [],
        'dux_sync_recovered',
        '2026-08-26T10:31:00.000Z',
      );
      expect(recovered.status).toBe('succeeded');
      expect(testD1.sqlite.prepare(
        'SELECT status, error_code FROM dux_sync_runs WHERE id = ?',
      ).get('dux_sync_active')).toEqual({
        status: 'failed',
        error_code: 'DUX_SYNC_ABANDONED',
      });
    } finally {
      testD1.close();
    }
  });

  it('aplica el intervalo global entre corridas aunque utilicen clientes distintos', async () => {
    const testD1 = database();
    try {
      await sync(
        testD1,
        reader([]),
        [],
        'dux_sync_first',
        '2026-08-26T10:00:00.000Z',
      );
      const blockedClient = reader([]);
      await expect(sync(
        testD1,
        blockedClient,
        [],
        'dux_sync_too_soon',
        '2026-08-26T10:00:04.999Z',
      )).rejects.toMatchObject({ code: 'DUX_SYNC_COOLDOWN', status: 429 });
      expect(blockedClient.calls.companies).toBe(0);

      const allowedClient = reader([]);
      await expect(sync(
        testD1,
        allowedClient,
        [],
        'dux_sync_after_cooldown',
        '2026-08-26T10:00:05.000Z',
      )).resolves.toMatchObject({ status: 'succeeded' });
      expect(allowedClient.calls.items).toBe(1);
    } finally {
      testD1.close();
    }
  });

  it('valida IDs positivos y las relaciones empresa/sucursal/depósito expuestas por Dux', async () => {
    expect(() => readDuxInventoryConfig({ ...env, DUX_COMPANY_ID: '0' })).toThrowError(
      expect.objectContaining({ code: 'DUX_CONFIG_INVALID' }),
    );
    expect(() => readDuxInventoryConfig({ ...env, DUX_BRANCH_ID: '2.5' })).toThrowError(
      expect.objectContaining({ code: 'DUX_CONFIG_INVALID' }),
    );
    const testD1 = database();
    try {
      const mismatched = reader([], undefined, {
        branches: [{ id: 2, companyId: 99, name: 'Sucursal ajena' }],
      });
      await expect(sync(
        testD1,
        mismatched,
        [],
        'dux_sync_mismatch',
      )).rejects.toMatchObject({ code: 'DUX_BRANCH_COMPANY_MISMATCH' });
      expect(mismatched.calls.items).toBe(0);
    } finally {
      testD1.close();
    }
  });
});

function database(): TestD1 {
  return createTestD1(commerceMigration, duxMigration);
}

function sync(
  testD1: TestD1,
  client: TestReader,
  localProducts: readonly CatalogProductDetail[],
  runId: string,
  now = '2026-08-26T10:00:00.000Z',
  kind: 'initial' | 'full' | 'manual' | 'scheduled' = 'manual',
) {
  return syncDuxInventory(testD1.database, env, 'test', {
    kind,
    localProducts,
    client,
    now: () => date(now),
    createRunId: () => runId,
  });
}

class TestReader implements DuxInventoryReader {
  readonly calls = { companies: 0, branches: 0, warehouses: 0, items: 0 };
  readonly #items: readonly DuxItem[];
  readonly #failure: Error | undefined;
  readonly #companies: readonly DuxCompany[];
  readonly #branches: readonly DuxBranch[];
  readonly #warehouses: readonly DuxWarehouse[];

  constructor(
    items: readonly DuxItem[],
    failure?: Error,
    overrides: Readonly<{
      companies?: readonly DuxCompany[];
      branches?: readonly DuxBranch[];
      warehouses?: readonly DuxWarehouse[];
    }> = {},
  ) {
    this.#items = items;
    this.#failure = failure;
    this.#companies = overrides.companies ?? [{ id: 1, legalName: 'Shekinah' }];
    this.#branches = overrides.branches ?? [{ id: 2, companyId: 1, name: 'Principal' }];
    this.#warehouses = overrides.warehouses ?? [{
      id: 3,
      companyId: 1,
      name: 'Depósito central',
      enabled: true,
    }];
  }

  listEmpresas(): Promise<readonly DuxCompany[]> {
    this.calls.companies += 1;
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    return Promise.resolve(this.#companies);
  }

  listSucursales(): Promise<readonly DuxBranch[]> {
    this.calls.branches += 1;
    return Promise.resolve(this.#branches);
  }

  listDepositos(): Promise<readonly DuxWarehouse[]> {
    this.calls.warehouses += 1;
    return Promise.resolve(this.#warehouses);
  }

  listItems(): Promise<readonly DuxItem[]> {
    this.calls.items += 1;
    return Promise.resolve(this.#items);
  }
}

function reader(
  items: readonly DuxItem[],
  failure?: Error,
  overrides?: ConstructorParameters<typeof TestReader>[2],
): TestReader {
  return new TestReader(items, failure, overrides);
}

function item(
  code: string,
  name: string,
  stocks: readonly DuxItemStock[],
  options: Readonly<{
    externalCode?: string;
    unitsPerPackage?: number;
    barcodes?: readonly string[];
  }> = {},
): DuxItem {
  return Object.freeze({
    code,
    externalCode: options.externalCode ?? null,
    name,
    barcodes: Object.freeze([...(options.barcodes ?? [])]),
    enabled: true,
    unitsPerPackage: options.unitsPerPackage ?? null,
    stocks: Object.freeze(stocks),
    inventorySemantics: DUX_V2_ITEM_INVENTORY_SEMANTICS,
  });
}

function stock(
  warehouseId: number,
  available: number,
  options: Readonly<{
    real?: number;
    reserved?: number;
    variantDetailId?: number;
  }> = {},
): DuxItemStock {
  return Object.freeze({
    warehouseId,
    warehouseName: 'Depósito central',
    realQuantity: options.real ?? available,
    reservedQuantity: options.reserved ?? 0,
    availableQuantity: available,
    variantDetailId: options.variantDetailId ?? null,
    variantBarcode: null,
    size: null,
    color: null,
  });
}

function product(id: string, name: string, sku?: string): CatalogProductDetail {
  return Object.freeze({
    id,
    slug: id,
    path: `/tienda/producto/${id}/`,
    name,
    categorySlugs: Object.freeze([]),
    categoryNames: Object.freeze([]),
    price: Object.freeze({ amount: 1_000, currency: 'ARS' as const }),
    ...(sku === undefined ? {} : { sku }),
    images: Object.freeze([]),
    variants: Object.freeze([]),
  });
}

function date(value: string): Date {
  return new Date(value);
}

function byCode<T extends Readonly<{ itemCode: string }>>(units: readonly T[], code: string): T {
  const unit = units.find((candidate) => candidate.itemCode === code);
  if (unit === undefined) throw new Error(`No se encontró ${code} en la prueba.`);
  return unit;
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error('La prueba esperaba una unidad Dux.');
  return value;
}
