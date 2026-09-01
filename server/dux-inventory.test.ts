import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1, type TestD1 } from '../src/test/d1';
import {
  DUX_MAX_ITEMS_PER_SYNC,
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
  isDuxInventoryBootstrapPending,
  listDuxInventoryUnits,
  readDuxInventoryConfig,
  syncDuxInventory,
  DUX_STAGING_JSON_MAX_BYTES,
  type DuxInventoryReader,
} from './dux-inventory';
import type { D1Database, D1PreparedStatement, D1Result, Env } from './platform';

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

describe('proyección autoritativa read-only de Dux', () => {
  it('detecta bootstrap pendiente con exactamente una consulta D1', async () => {
    const testD1 = database();
    try {
      let preparedQueries = 0;
      const meteredDatabase: D1Database = {
        prepare: (query: string): D1PreparedStatement => {
          preparedQueries += 1;
          return testD1.database.prepare(query);
        },
        exec: (query: string) => testD1.database.exec(query),
        batch: <T>(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result<T>[]> => (
          testD1.database.batch<T>(statements)
        ),
      };

      await expect(isDuxInventoryBootstrapPending(meteredDatabase)).resolves.toBe(true);
      expect(preparedQueries).toBe(1);
      await sync(
        testD1,
        reader([item('BOOTSTRAP', 'Bootstrap remoto', [stock(3, 1)])]),
        [],
        'dux_sync_bootstrap_helper',
      );
      preparedQueries = 0;
      await expect(isDuxInventoryBootstrapPending(meteredDatabase)).resolves.toBe(false);
      expect(preparedQueries).toBe(1);
    } finally {
      testD1.close();
    }
  });

  it('limita la identidad final escapada sin alterar códigos ASCII válidos', () => {
    const asciiCode = 'A'.repeat(300);
    expect(buildDuxInventoryKey(1, 3, asciiCode, null)).toBe(
      `dux:v2:1:3:${asciiCode}:base`,
    );
    expect(() => buildDuxInventoryKey(1, 3, '界'.repeat(300), null)).toThrowError(
      expect.objectContaining({
        status: 502,
        code: 'DUX_INVENTORY_KEY_INVALID',
      }),
    );
    expect(() => buildDuxInventoryKey(1, 3, '\uD800', null)).toThrowError(
      expect.objectContaining({
        status: 502,
        code: 'DUX_INVENTORY_KEY_INVALID',
      }),
    );
  });

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

  it('normaliza sólo diferencias conservadoras de nombre y presentación durante el bootstrap', async () => {
    const testD1 = database();
    try {
      const products = [
        product('te-rooibos', 'Té rooibos x 100 gr', undefined, '100 g'),
        product('harina-integral-1kg', 'Harina integral 1kg'),
        product('extracto-500ml', 'Extracto 0,5 l'),
        product('aceite-coco-360cc', 'Aceite de coco 360 cc'),
        product('abedul', 'Abedul', undefined, '50 g'),
      ];
      const summary = await sync(
        testD1,
        reader([
          item('TE', 'TE ROOIBOS 100GR', [stock(3, 4)]),
          item('HARINA', 'HARINA INTEGRAL 1000 GR', [stock(3, 5)]),
          item('EXTRACTO', 'EXTRACTO 500ML', [stock(3, 6)]),
          item('COCO', 'ACEITE DE COCO 360ML', [stock(3, 7)]),
          item('ABEDUL', 'ABEDUL 50GR', [stock(3, 8)]),
        ]),
        products,
        'dux_sync_conservative_names',
        '2026-08-26T10:00:00.000Z',
        'initial',
      );
      expect(summary).toMatchObject({ processed: 5, mapped: 5, ambiguous: 0, unmapped: 0 });
      const units = await listDuxInventoryUnits(testD1.database, env);
      expect(units.map((unit) => ({
        code: unit.itemCode,
        localProductId: unit.localProductId,
        mappingSource: unit.mappingSource,
      }))).toEqual([
        { code: 'ABEDUL', localProductId: 'abedul', mappingSource: 'exact_name' },
        { code: 'COCO', localProductId: 'aceite-coco-360cc', mappingSource: 'exact_name' },
        { code: 'EXTRACTO', localProductId: 'extracto-500ml', mappingSource: 'exact_name' },
        { code: 'HARINA', localProductId: 'harina-integral-1kg', mappingSource: 'exact_name' },
        { code: 'TE', localProductId: 'te-rooibos', mappingSource: 'exact_name' },
      ]);
    } finally {
      testD1.close();
    }
  });

  it('no aplica fuzzy ni ignora contradicciones históricas de cantidad durante el bootstrap', async () => {
    const testD1 = database();
    try {
      const contradictoryId = 'cola-de-pavo-futuro-fungi-50ml';
      const products = [
        product('cana-100g', 'Caña 100 g'),
        product('mix-gripal', 'Mix Gripal'),
        product('harina-500g', 'Harina 500g'),
        product('producto-500g', 'Producto 500g'),
        product('te-verde', 'Té Verde'),
        product('cafe-canela-500g', 'Café c/canela 500g'),
        product('almendra-100g', 'Almendra 100g'),
        product('vitamina-x3-plus', 'Vitamina X3 Plus'),
        product('token-100g2', 'Token 100g2'),
        product(contradictoryId, 'Hongos de Pino 100gr'),
        product('naranja-250gr', 'Naranja deshidratada 250gr', undefined, '50 g'),
      ];
      const summary = await sync(
        testD1,
        reader([
          item('CANA', 'CANA 100GR', [stock(3, 1)]),
          item('MIX', 'MI GRIPAL', [stock(3, 1)]),
          item('HARINA', 'HARINA 1KG', [stock(3, 1)]),
          item('PRODUCTO', 'PRODUCTO 500ML', [stock(3, 1)]),
          item('TEVERDE', 'TEVERDE', [stock(3, 1)]),
          item('CAFE', 'CAFE CON CANELA 500GR', [stock(3, 1)]),
          item('ALMENDRAS', 'ALMENDRAS 100GR', [stock(3, 1)]),
          item('VITAMINA', 'VITAMINA 3 PLUS', [stock(3, 1)]),
          item('TOKEN', 'TOKEN 100 G2', [stock(3, 1)]),
          item('HONGOS-NAME', 'HONGOS DE PINO 100GR', [stock(3, 1)]),
          item('NARANJA', 'NARANJA DESHIDRATADA 250GR', [stock(3, 1)]),
          item('HONGOS-EXTERNAL', 'OTRO PRODUCTO', [stock(3, 1)], {
            externalCode: contradictoryId,
          }),
        ]),
        products,
        'dux_sync_reject_false_positives',
        '2026-08-26T10:00:00.000Z',
        'initial',
      );
      expect(summary).toMatchObject({ processed: 12, mapped: 1, ambiguous: 0, unmapped: 11 });
      const units = await listDuxInventoryUnits(testD1.database, env);
      for (const code of [
        'CANA',
        'MIX',
        'HARINA',
        'PRODUCTO',
        'TEVERDE',
        'CAFE',
        'ALMENDRAS',
        'VITAMINA',
        'TOKEN',
        'HONGOS-NAME',
        'NARANJA',
      ]) {
        expect(byCode(units, code)).toMatchObject({
          mappingStatus: 'unmapped',
          localProductId: null,
          mappingCandidates: [],
        });
      }
      expect(byCode(units, 'HONGOS-EXTERNAL')).toMatchObject({
        mappingStatus: 'mapped',
        mappingSource: 'codigo_externo',
        localProductId: contradictoryId,
      });
    } finally {
      testD1.close();
    }
  });

  it('marca 2:1 y 1:2 como ambiguos después de la normalización conservadora', async () => {
    const testD1 = database();
    try {
      const products = [
        product(
          'anis-estrellado-100-gramos',
          'Anis en grano x 100 gramos',
          undefined,
          '100 g',
        ),
        product('anis-en-grano', 'Anís en grano x 100 gr', undefined, '100 g'),
        product('tintura-andino', 'Tintura Madre Andino °'),
      ];
      const summary = await sync(
        testD1,
        reader([
          item('ANIS', 'ANIS EN GRANO 100GR', [stock(3, 1)]),
          item('TINTURA-A', 'TINTURA MADRE ANDINO °', [stock(3, 1)]),
          item('TINTURA-B', 'TINTURA MADRE ANDINO °', [stock(3, 1)]),
        ]),
        products,
        'dux_sync_conservative_ambiguity',
        '2026-08-26T10:00:00.000Z',
        'initial',
      );
      expect(summary).toMatchObject({ processed: 3, mapped: 0, ambiguous: 3, unmapped: 0 });
      const units = await listDuxInventoryUnits(testD1.database, env);
      expect(byCode(units, 'ANIS')).toMatchObject({
        mappingStatus: 'ambiguous',
        localProductId: null,
        mappingCandidates: ['anis-en-grano', 'anis-estrellado-100-gramos'],
      });
      for (const code of ['TINTURA-A', 'TINTURA-B']) {
        expect(byCode(units, code)).toMatchObject({
          mappingStatus: 'ambiguous',
          localProductId: 'tintura-andino',
          mappingCandidates: ['tintura-andino'],
        });
      }
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

  it('publica no-op con frescura global y escribe sólo filas cuyo estado cambió', async () => {
    const testD1 = database();
    try {
      const stable = item('ESTABLE', 'Estable remoto', [stock(3, 9)]);
      await syncDuxInventory(testD1.database, env, 'test', {
        kind: 'initial',
        localProducts: [],
        client: reader([stable]),
        now: sequencedNow(
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:01:00.000Z',
        ),
        createRunId: () => 'dux_sync_delta_initial',
      });
      testD1.sqlite.exec(`CREATE TABLE inventory_write_audit (write_count INTEGER NOT NULL);
        INSERT INTO inventory_write_audit (write_count) VALUES (0);
        CREATE TRIGGER audit_dux_inventory_insert AFTER INSERT ON dux_inventory_items
        BEGIN UPDATE inventory_write_audit SET write_count = write_count + 1; END;
        CREATE TRIGGER audit_dux_inventory_update AFTER UPDATE ON dux_inventory_items
        BEGIN UPDATE inventory_write_audit SET write_count = write_count + 1; END;
        CREATE TRIGGER audit_dux_inventory_delete AFTER DELETE ON dux_inventory_items
        BEGIN UPDATE inventory_write_audit SET write_count = write_count + 1; END`);

      await syncDuxInventory(testD1.database, env, 'test', {
        kind: 'scheduled',
        localProducts: [],
        client: reader([stable]),
        now: sequencedNow(
          '2026-08-26T10:10:00.000Z',
          '2026-08-26T10:10:00.000Z',
          '2026-08-26T10:11:00.000Z',
        ),
        createRunId: () => 'dux_sync_delta_noop',
      });

      expect(inventoryWriteCount(testD1)).toBe(0);
      expect(testD1.sqlite.prepare(
        `SELECT item_count, changed_count FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_delta_noop'`,
      ).get()).toEqual({ item_count: 1, changed_count: 0 });
      expect(testD1.sqlite.prepare(
        `SELECT estimated_rows FROM dux_d1_write_budget
         WHERE utc_date = '2026-08-26'`,
      ).get()).toEqual({ estimated_rows: 142 });
      expect(testD1.sqlite.prepare(
        `SELECT last_synced_at, updated_at FROM dux_inventory_items
         WHERE cod_item = 'ESTABLE'`,
      ).get()).toEqual({
        last_synced_at: '2026-08-26T10:00:00.000Z',
        updated_at: '2026-08-26T10:00:00.000Z',
      });
      expect(await listDuxInventoryUnits(
        testD1.database,
        env,
        date('2026-08-26T10:11:01.000Z'),
      )).toMatchObject([{
        itemCode: 'ESTABLE',
        lastSyncedAt: '2026-08-26T10:11:00.000Z',
        fresh: true,
      }]);

      const changed = item('ESTABLE', 'Estable remoto', [stock(3, 8)]);
      await syncDuxInventory(testD1.database, env, 'test', {
        kind: 'scheduled',
        localProducts: [],
        client: reader([changed]),
        now: sequencedNow(
          '2026-08-26T10:20:00.000Z',
          '2026-08-26T10:20:00.000Z',
          '2026-08-26T10:21:00.000Z',
        ),
        createRunId: () => 'dux_sync_delta_changed',
      });
      expect(inventoryWriteCount(testD1)).toBe(1);
      expect(testD1.sqlite.prepare(
        `SELECT changed_count FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_delta_changed'`,
      ).get()).toEqual({ changed_count: 1 });

      await syncDuxInventory(testD1.database, env, 'test', {
        kind: 'scheduled',
        localProducts: [],
        client: reader([]),
        now: sequencedNow(
          '2026-08-26T10:30:00.000Z',
          '2026-08-26T10:30:00.000Z',
          '2026-08-26T10:31:00.000Z',
        ),
        createRunId: () => 'dux_sync_delta_absent',
      });
      expect(inventoryWriteCount(testD1)).toBe(2);
      expect(testD1.sqlite.prepare(
        `SELECT changed_count FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_delta_absent'`,
      ).get()).toEqual({ changed_count: 1 });

      await syncDuxInventory(testD1.database, env, 'test', {
        kind: 'scheduled',
        localProducts: [],
        client: reader([]),
        now: sequencedNow(
          '2026-08-26T10:40:00.000Z',
          '2026-08-26T10:40:00.000Z',
          '2026-08-26T10:41:00.000Z',
        ),
        createRunId: () => 'dux_sync_delta_absent_noop',
      });
      expect(inventoryWriteCount(testD1)).toBe(2);
      expect(testD1.sqlite.prepare(
        `SELECT changed_count FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_delta_absent_noop'`,
      ).get()).toEqual({ changed_count: 0 });
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_generation_items',
      ).get()).toEqual({ count: 0 });
      expect(testD1.sqlite.prepare(
        `SELECT estimated_rows FROM dux_d1_write_budget
         WHERE utc_date = '2026-08-26'`,
      ).get()).toEqual({ estimated_rows: 362 });
    } finally {
      testD1.close();
    }
  });

  it('rechaza el presupuesto diario antes de staging y preserva el snapshot publicado', async () => {
    const testD1 = database();
    try {
      const stable = item('PRESUPUESTO', 'Presupuesto remoto', [stock(3, 9)]);
      await sync(
        testD1,
        reader([stable]),
        [],
        'dux_sync_budget_published',
        '2026-08-26T10:00:00.000Z',
        'initial',
      );
      testD1.sqlite.prepare(
        `UPDATE dux_d1_write_budget SET estimated_rows = 39950
         WHERE utc_date = '2026-08-26'`,
      ).run();
      testD1.sqlite.exec(`CREATE TABLE staging_write_audit (write_count INTEGER NOT NULL);
        INSERT INTO staging_write_audit (write_count) VALUES (0);
        CREATE TRIGGER audit_staging_insert AFTER INSERT ON dux_inventory_generation_items
        BEGIN UPDATE staging_write_audit SET write_count = write_count + 1; END`);

      await expect(sync(
        testD1,
        reader([item('PRESUPUESTO', 'Presupuesto remoto', [stock(3, 8)])]),
        [],
        'dux_sync_budget_exhausted',
        '2026-08-26T10:10:00.000Z',
      )).rejects.toMatchObject({
        status: 503,
        code: 'DUX_D1_WRITE_BUDGET_EXHAUSTED',
      });

      expect((await listDuxInventoryUnits(
        testD1.database,
        env,
        date('2026-08-26T10:10:01.000Z'),
      )).map((unit) => unit.observedStock.available)).toEqual([9]);
      expect(testD1.sqlite.prepare(
        `SELECT generation_id, status FROM dux_inventory_generations
         ORDER BY generation_id`,
      ).all()).toEqual([
        { generation_id: 'dux_sync_budget_exhausted', status: 'failed' },
        { generation_id: 'dux_sync_budget_published', status: 'published' },
      ]);
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_generation_items',
      ).get()).toEqual({ count: 0 });
      expect(testD1.sqlite.prepare(
        'SELECT write_count FROM staging_write_audit',
      ).get()).toEqual({ write_count: 0 });
      expect(testD1.sqlite.prepare(
        `SELECT estimated_rows FROM dux_d1_write_budget
         WHERE utc_date = '2026-08-26'`,
      ).get()).toEqual({ estimated_rows: 39950 });
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

  it('mantiene publicada la generación anterior durante una carga por lotes que falla', async () => {
    const testD1 = database();
    try {
      const products = [product('estable', 'Estable')];
      await sync(testD1, reader([
        item('ESTABLE', 'Estable remoto', [stock(3, 9)], { externalCode: 'estable' }),
      ]), products, 'dux_sync_published');

      let batchCalls = 0;
      let observedDuringLoad: readonly number[] = [];
      const databaseWithInterruptedLoad: D1Database = {
        prepare: (query: string): D1PreparedStatement => testD1.database.prepare(query),
        exec: (query: string) => testD1.database.exec(query),
        batch: async <T>(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result<T>[]> => {
          batchCalls += 1;
          if (batchCalls === 3) throw new Error('simulated staging interruption');
          const results = await testD1.database.batch<T>(statements);
          if (batchCalls === 2) {
            observedDuringLoad = (await listDuxInventoryUnits(
              testD1.database,
              env,
              date('2026-08-26T10:01:00.000Z'),
            )).map((unit) => unit.observedStock.available);
          }
          return results;
        },
      };
      const nextItems = Array.from({ length: 51 }, (_, index) => item(
        `NUEVO-${String(index).padStart(2, '0')}`,
        `Nuevo ${index}`,
        [stock(3, index + 1)],
      ));

      await expect(syncDuxInventory(databaseWithInterruptedLoad, env, 'test', {
        kind: 'manual',
        localProducts: products,
        client: reader(nextItems),
        now: () => date('2026-08-26T10:01:00.000Z'),
        createRunId: () => 'dux_sync_interrupted_staging',
      })).rejects.toThrow('simulated staging interruption');

      expect(observedDuringLoad).toEqual([9]);
      expect(await listDuxInventoryUnits(
        testD1.database,
        env,
        date('2026-08-26T10:01:01.000Z'),
      )).toMatchObject([
        {
          itemCode: 'ESTABLE',
          observedStock: { available: 9 },
          lastSyncStatus: 'ok',
        },
      ]);
      expect(testD1.sqlite.prepare(`SELECT generation_id, status
        FROM dux_inventory_generations ORDER BY generation_id`).all()).toEqual([
        { generation_id: 'dux_sync_interrupted_staging', status: 'failed' },
        { generation_id: 'dux_sync_published', status: 'published' },
      ]);
      expect(testD1.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM dux_inventory_generation_items
        WHERE generation_id = 'dux_sync_interrupted_staging'`).get()).toEqual({ count: 0 });
    } finally {
      testD1.close();
    }
  });

  it('rechaza antes del bind un lote JSON que supera el margen D1 de dos megabytes', async () => {
    const testD1 = database();
    try {
      const oversized = item(
        'PAYLOAD-GRANDE',
        'Payload grande',
        [stock(3, 1)],
        { barcodes: ['x'.repeat(DUX_STAGING_JSON_MAX_BYTES)] },
      );

      await expect(sync(
        testD1,
        reader([oversized]),
        [],
        'dux_sync_oversized_staging',
        '2026-08-26T10:00:00.000Z',
        'initial',
      )).rejects.toMatchObject({
        status: 502,
        code: 'DUX_STAGING_PAYLOAD_TOO_LARGE',
      });
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_generation_items',
      ).get()).toEqual({ count: 0 });
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_items',
      ).get()).toEqual({ count: 0 });
      expect(testD1.sqlite.prepare(
        `SELECT status FROM dux_inventory_generations
         WHERE generation_id = 'dux_sync_oversized_staging'`,
      ).get()).toEqual({ status: 'failed' });
    } finally {
      testD1.close();
    }
  });

  it('publica el máximo operativo con menos de 50 queries D1 y 20 inserts de staging', async () => {
    const testD1 = database();
    try {
      let preparedQueries = 0;
      let stagingInserts = 0;
      const meteredDatabase: D1Database = {
        prepare: (query: string): D1PreparedStatement => {
          preparedQueries += 1;
          if (
            query.includes('INSERT INTO dux_inventory_generation_items') &&
            query.includes('FROM json_each(?2) AS staged')
          ) {
            stagingInserts += 1;
          }
          return testD1.database.prepare(query);
        },
        exec: (query: string) => testD1.database.exec(query),
        batch: <T>(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result<T>[]> => (
          testD1.database.batch<T>(statements)
        ),
      };
      const items = Array.from({ length: DUX_MAX_ITEMS_PER_SYNC }, (_, index) => item(
        `CAP-${String(index).padStart(4, '0')}`,
        `Capacidad ${index}`,
        [stock(3, index + 0.5)],
      ));

      const summary = await syncDuxInventory(meteredDatabase, env, 'test', {
        kind: 'initial',
        localProducts: [],
        client: reader(items),
        now: () => date('2026-08-26T10:00:00.000Z'),
        createRunId: () => 'dux_sync_capacity_budget',
      });

      expect(summary).toMatchObject({
        status: 'succeeded',
        processed: DUX_MAX_ITEMS_PER_SYNC,
        unmapped: DUX_MAX_ITEMS_PER_SYNC,
        failed: 0,
      });
      expect(stagingInserts).toBe(20);
      // El cliente real limita toda la corrida a 45 intentos HTTP y ejecuta
      // un heartbeat cada diez: como máximo suma cuatro queries D1.
      expect(preparedQueries).toBe(38);
      const maximumCoreQueries = preparedQueries + 4;
      expect(maximumCoreQueries).toBe(42);
      expect(maximumCoreQueries + 1).toBe(43); // internal: catálogo
      expect(maximumCoreQueries + 3).toBe(45); // admin: bootstrap, catálogo, auditoría
      expect(maximumCoreQueries + 6).toBe(48); // admin: fallo extremo y cleanup
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_items',
      ).get()).toEqual({ count: DUX_MAX_ITEMS_PER_SYNC });
      expect(testD1.sqlite.prepare(
        `SELECT estimated_rows FROM dux_d1_write_budget
         WHERE utc_date = '2026-08-26'`,
      ).get()).toEqual({ estimated_rows: 14_064 });
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si las variantes expanden más de 1.000 identidades', async () => {
    const testD1 = database();
    try {
      const excessiveStocks = Array.from(
        { length: DUX_MAX_ITEMS_PER_SYNC + 1 },
        (_, index) => stock(3, index + 0.5, { variantDetailId: index + 1 }),
      );

      await expect(sync(
        testD1,
        reader([item('DEMASIADAS-VARIANTES', 'Demasiadas variantes', excessiveStocks)]),
        [],
        'dux_sync_excessive_units',
      )).rejects.toMatchObject({
        status: 502,
        code: 'DUX_INVENTORY_UNIT_LIMIT',
      });
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM dux_inventory_items',
      ).get()).toEqual({ count: 0 });
      expect(testD1.sqlite.prepare(
        'SELECT status FROM dux_inventory_generations WHERE generation_id = ?',
      ).get('dux_sync_excessive_units')).toEqual({ status: 'failed' });
    } finally {
      testD1.close();
    }
  });

  it('revierte íntegramente la transición si falla la publicación de la generación completa', async () => {
    const testD1 = database();
    try {
      const products = [product('estable', 'Estable')];
      await sync(testD1, reader([
        item('ESTABLE', 'Estable remoto', [stock(3, 9)], { externalCode: 'estable' }),
      ]), products, 'dux_sync_before_publication_failure');
      testD1.sqlite.exec(`CREATE TRIGGER simulate_dux_publication_failure
        BEFORE INSERT ON dux_inventory_items
        WHEN NEW.cod_item = 'ROMPER'
        BEGIN
          SELECT RAISE(ABORT, 'SIMULATED_PUBLICATION_FAILURE');
        END`);

      await expect(sync(
        testD1,
        reader([item('ROMPER', 'Nueva fila', [stock(3, 100)])], undefined, {
          companies: [{ id: 1, legalName: 'Tenant no publicado' }],
        }),
        products,
        'dux_sync_publication_failure',
        '2026-08-26T10:01:00.000Z',
      )).rejects.toThrow('SIMULATED_PUBLICATION_FAILURE');

      expect(await listDuxInventoryUnits(
        testD1.database,
        env,
        date('2026-08-26T10:01:01.000Z'),
      )).toMatchObject([
        {
          itemCode: 'ESTABLE',
          observedStock: { available: 9 },
          lastSyncStatus: 'ok',
        },
      ]);
      expect((await getDuxInventoryStatus(
        testD1.database,
        env,
        date('2026-08-26T10:01:01.000Z'),
      )).tenant).toMatchObject({ companyName: 'Shekinah' });
      expect(testD1.sqlite.prepare(`SELECT generation_id, status
        FROM dux_inventory_generations ORDER BY generation_id`).all()).toEqual([
        { generation_id: 'dux_sync_before_publication_failure', status: 'published' },
        { generation_id: 'dux_sync_publication_failure', status: 'failed' },
      ]);
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
  return createTestD1(commerceMigration, duxMigration, atomicSnapshotMigration);
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

function product(
  id: string,
  name: string,
  sku?: string,
  presentation?: string,
): CatalogProductDetail {
  return Object.freeze({
    id,
    slug: id,
    path: `/tienda/producto/${id}/`,
    name,
    categorySlugs: Object.freeze([]),
    categoryNames: Object.freeze([]),
    price: Object.freeze({ amount: 1_000, currency: 'ARS' as const }),
    ...(sku === undefined ? {} : { sku }),
    ...(presentation === undefined ? {} : { presentation }),
    images: Object.freeze([]),
    variants: Object.freeze([]),
  });
}

function date(value: string): Date {
  return new Date(value);
}

function sequencedNow(...values: readonly string[]): () => Date {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    if (value === undefined) throw new Error('La prueba requiere al menos un instante.');
    return date(value);
  };
}

function inventoryWriteCount(testD1: TestD1): number {
  const row = testD1.sqlite.prepare(
    'SELECT write_count FROM inventory_write_audit',
  ).get() as Readonly<{ write_count: number }>;
  return row.write_count;
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
