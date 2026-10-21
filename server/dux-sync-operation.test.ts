import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DUX_SYNC_DEADLINE_MS, type DuxFetch } from './dux-api';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { writeDuxProductWebSettings } from './dux-product-web-settings';
import { getAdminDuxProductDetail, readPublicCatalog } from './dux-public-catalog';
import { advanceDuxSyncOperation, latestDuxSyncOperation, readDuxSyncRequestId } from './dux-sync-operation';
import type { D1Database, D1PreparedStatement, Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

const schema = readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name)).sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n');
const actor = 'test:sync-operator';
const requestId = '11111111-1111-4111-8111-111111111111';
const nextId = '22222222-2222-4222-8222-222222222222';
const databases: SqliteD1[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T13:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  for (const db of databases.splice(0)) db.close();
  vi.restoreAllMocks();
});

describe('sincronización Dux recuperable', () => {
  it.each(['true', 'false'])('publica 1000 productos sólo al terminar dentro de los límites con DIRECT=%s', async (direct) => {
    const db = database();
    let queries = 0;
    const metered = meteredDatabase(db, () => { queries += 1; });
    const env: Env = { ...environment(metered), DIRECT_CHECKOUT_ENABLED: direct };
    const provider = providerFixture(1000);
    const starts: number[] = [];
    const fetch: DuxFetch = (input, init) => { starts.push(Date.now()); return provider(input, init); };
    let result: Response | undefined;
    const startedAt = Date.now();
    for (let index = 0; index < 24; index += 1) {
      queries = 0;
      const stepStartedAt = Date.now();
      result = await step(metered, env, requestId, fetch);
      // Reserve four queries for authentication/audit wrappers.
      expect(queries + 4).toBeLessThanOrEqual(50);
      expect(Date.now() - stepStartedAt).toBeLessThan(60_000);
      if (result.status === 200) break;
      expect(result.status).toBe(202);
      expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_inventory_items').get()).toEqual({ count: 0 });
      expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()).toEqual({ count: 0 });
    }
    expect(result?.status).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(120_000);
    expect(starts).toHaveLength(23);
    for (let index = 1; index < starts.length; index += 1) expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(5000);
    const catalog = await readDuxCatalogSnapshot(db);
    expect(catalog.itemCount).toBe(1000);
    expect(catalog.stockReadAt).toBe('2026-10-21T13:00:00.000Z');
    expect(catalog.syncedAt).not.toBe(catalog.stockReadAt);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_operation_pages').get()).toEqual({ count: 0 });
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('sincroniza nombres y stock Dux por SKU, conserva nombres manuales y permite volver al último nombre Dux', async () => {
    const db = database();
    const env = environment(db);
    await complete(db, env, requestId, providerFixture(2, { names: ['Aceite de coco 200 cc', 'Aceite de coco 400 cc'] }));
    const previous = await readDuxCatalogSnapshot(db);
    const image = { src: `/api/catalog-images/${requestId}.webp`, alt: 'Foto web conservada' };
    for (const code of ['TEST-0', 'TEST-1']) {
      await writeDuxProductWebSettings(db, code, actor, { name: `Nombre comercial ${code}`, description: `Descripción web conservada ${code}`, images: [image] });
    }
    db.database.exec("UPDATE dux_catalog_control SET public_catalog_enabled = 1 WHERE company_id = '12862'");
    await vi.advanceTimersByTimeAsync(6000);
    const stock = { real: 9.25, reserved: 1, available: 8.25 };
    const provider = vi.fn(providerFixture(2, { names: ['Aceite de coco 180 cc', 'Aceite de coco 360 cc'], stock }));
    await complete(db, env, nextId, provider);
    const updated = await readDuxCatalogSnapshot(db);
    const storefront = await readPublicCatalog(db, env);
    for (const [index, name] of ['Aceite de coco 180 cc', 'Aceite de coco 360 cc'].entries()) {
      const code = `TEST-${index}`;
      const previousItem = previous.items.find(item => item.code === code);
      if (previousItem === undefined) throw new Error('Producto inicial de prueba ausente');
      expect(updated.items.find(item => item.code === code)).toMatchObject({ code, name, slug: previousItem.slug, warehouseStocks: [stock] });
      const expected = { sku: code, slug: previousItem.slug, name: `Nombre comercial ${code}`, duxName: name, nameOverride: `Nombre comercial ${code}`, description: `Descripción web conservada ${code}`,
        images: [image], commerce: { observedStock: stock, warehouseStocks: [stock] } };
      expect(storefront.productDetails.find(product => product.sku === code)).toMatchObject(expected);
      expect(await getAdminDuxProductDetail(db, env, previousItem.slug)).toMatchObject(expected);
    }
    expect(updated.catalogVersion).not.toBe(previous.catalogVersion);
    expect(db.database.prepare('SELECT stock_real, stock_reservado, stock_disponible FROM dux_inventory_items ORDER BY cod_item').all()).toEqual([
      { stock_real: 9.25, stock_reservado: 1, stock_disponible: 8.25 }, { stock_real: 9.25, stock_reservado: 1, stock_disponible: 8.25 },
    ]);
    for (const row of db.database.prepare('SELECT cod_item, raw_snapshot_json FROM dux_inventory_items').all()) {
      if (typeof row.raw_snapshot_json !== 'string') throw new Error('Evidencia de prueba inválida');
      const evidence: unknown = JSON.parse(row.raw_snapshot_json);
      expect(evidence).toMatchObject({ item: { code: row.cod_item, name: row.cod_item === 'TEST-0' ? 'Aceite de coco 180 cc' : 'Aceite de coco 360 cc' }, stock });
    }
    const calls = provider.mock.calls.length;
    await writeDuxProductWebSettings(db, 'TEST-0', actor, { name: null });
    const latestDuxItem = updated.items.find(item => item.code === 'TEST-0');
    if (latestDuxItem === undefined) throw new Error('Producto actualizado de prueba ausente');
    const restored = await getAdminDuxProductDetail(db, env, latestDuxItem.slug);
    expect(restored).toMatchObject({ sku: 'TEST-0', name: 'Aceite de coco 180 cc', duxName: 'Aceite de coco 180 cc',
      slug: latestDuxItem.slug, images: [image], description: 'Descripción web conservada TEST-0', commerce: { observedStock: stock } });
    expect(restored?.nameOverride).toBeUndefined();
    const refreshed = await readPublicCatalog(db, env);
    expect(refreshed.productDetails.find(product => product.sku === 'TEST-0')).toEqual(restored);
    expect(refreshed.productDetails.find(product => product.sku === 'TEST-1')).toMatchObject({ name: 'Nombre comercial TEST-1', nameOverride: 'Nombre comercial TEST-1', commerce: { observedStock: stock } });
    expect(provider).toHaveBeenCalledTimes(calls);
  });

  it('recupera una respuesta final perdida sin otra consulta al proveedor ni otra generación', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(2));
    const original = await complete(db, env, requestId, provider);
    const calls = provider.mock.calls.length;
    const recovered = await step(db, env, requestId, provider);
    expect(await recovered.json()).toEqual(await original.json());
    expect(provider).toHaveBeenCalledTimes(calls);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_runs').get()).toEqual({ count: 1 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_inventory_generations').get()).toEqual({ count: 1 });
  });

  it('conserva la página confirmada si se pierde la respuesta intermedia', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(51));
    for (let index = 0; index < 4; index += 1) await step(db, env, requestId, provider);
    const next = await step(db, env, requestId, provider);
    expect(await next.json()).toMatchObject({ status: 'running', phase: 'publish', processed: 51, total: 51 });
    const offsets = provider.mock.calls.map(([input]) => inputUrl(input)).filter(url => url.pathname.endsWith('/items'))
      .map(url => url.searchParams.get('offset'));
    expect(offsets).toEqual(['0', '50']);
    expect((await step(db, env, requestId, provider)).status).toBe(200);
  });

  it('excluye otro gesto mientras una lectura está activa y no duplica solicitudes concurrentes del mismo gesto', async () => {
    const db = database();
    const env = environment(db);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const upstream = providerFixture(1);
    const provider = vi.fn<DuxFetch>(async (input, init) => { entered(); await waiting; return upstream(input, init); });
    const first = advanceDuxSyncOperation(db, env, actor, requestId, 'manual', provider);
    await reached;
    const duplicate = await advanceDuxSyncOperation(db, env, actor, requestId, 'manual', provider);
    expect(duplicate.status).toBe(202);
    await expect(advanceDuxSyncOperation(db, env, actor, nextId, 'manual', provider)).rejects.toMatchObject({ code: 'DUX_SYNC_IN_PROGRESS' });
    release();
    expect((await first).status).toBe(202);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM dux_sync_operations WHERE status = 'running'").get()).toEqual({ count: 1 });
  });

  it('relee la fase después de reclamar el lease si otra petición avanzó entre la lectura y el claim', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(1));
    await step(db, env, requestId, provider);
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const staleCaller: D1Database = {
      prepare: query => query.includes('SET lease_token = ?2')
        ? delayedFirst(db.prepare(query), async () => { entered(); await waiting; }) : db.prepare(query),
      batch: statements => db.batch(statements), exec: query => db.exec(query),
    };
    const stalled = advanceDuxSyncOperation(staleCaller, { ...env, DB: staleCaller }, actor, requestId, 'manual', provider)
      .then(response => ({ response }), (error: unknown) => ({ error }));
    await reached;
    await step(db, env, requestId, provider);
    release();
    await vi.runAllTimersAsync();
    const result = await stalled;
    if ('error' in result) throw result.error;
    expect(await result.response.json()).toMatchObject({ phase: 'items' });
    expect(provider.mock.calls.map(([input]) => inputUrl(input).pathname.split('/').at(-1)))
      .toEqual(['empresas', 'sucursales', 'depositos']);
  });

  it('un fallo tardío de un lease vencido no borra el progreso de su sucesor', async () => {
    const db = database();
    const env = environment(db);
    let entered!: () => void;
    let rejectFetch!: (error: Error) => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const hanging = new Promise<Response>((_resolve, reject) => { rejectFetch = reject; });
    const first = advanceDuxSyncOperation(db, env, actor, requestId, 'manual', () => { entered(); return hanging; })
      .then(response => ({ response }), (error: unknown) => ({ error }));
    await reached;
    const beforeRetry = reservedWrites(db);
    await vi.advanceTimersByTimeAsync(61_000);
    const successor = await step(db, env, requestId, providerFixture(1));
    expect(await successor.json()).toMatchObject({ phase: 'branches' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rejectFetch(new Error('Late network failure'));
    await first;
    expect(db.database.prepare('SELECT status, phase FROM dux_sync_operations WHERE request_id = ?').get(requestId))
      .toEqual({ status: 'running', phase: 'branches' });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_operation_pages WHERE request_id = ?').get(requestId)).toEqual({ count: 1 });
    expect(reservedWrites(db) - beforeRetry).toBe(5);
  });

  it('una lectura antigua sin token no invalida una fase posterior cuando vence su plazo', async () => {
    const db = database();
    const env = environment(db);
    const provider = providerFixture(1);
    await step(db, env, requestId, provider);
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const staleCaller: D1Database = {
      prepare: query => query === 'SELECT * FROM dux_sync_operations WHERE request_id = ?1'
        ? delayedFirst(db.prepare(query), async () => { entered(); await waiting; }, true) : db.prepare(query),
      batch: statements => db.batch(statements), exec: query => db.exec(query),
    };
    const old = advanceDuxSyncOperation(staleCaller, { ...env, DB: staleCaller }, actor, requestId, 'manual', provider)
      .then(response => ({ response }), (error: unknown) => ({ error }));
    await reached;
    await step(db, env, requestId, provider);
    await vi.advanceTimersByTimeAsync(DUX_SYNC_DEADLINE_MS);
    release();
    expect(await old).toMatchObject({ error: { code: 'DUX_SYNC_DEADLINE_EXCEEDED' } });
    expect(db.database.prepare('SELECT status, phase FROM dux_sync_operations WHERE request_id = ?1').get(requestId))
      .toEqual({ status: 'running', phase: 'warehouses' });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_operation_pages WHERE request_id = ?1').get(requestId)).toEqual({ count: 2 });
  });

  it.each(['provider', 'total', 'expiry'] as const)('preserva la publicación anterior ante una falla de %s', async (failure) => {
    const db = database();
    const env = environment(db);
    await complete(db, env, requestId, providerFixture(1, { name: 'Aceite de coco 250 cc' }));
    const before = await readDuxCatalogSnapshot(db);
    await vi.advanceTimersByTimeAsync(6000);
    const provider = vi.fn(providerFixture(51, { name: 'Aceite de coco 500 cc', failSecondPage: failure === 'provider', changeTotal: failure === 'total' }));
    for (let index = 0; index < 4; index += 1) await step(db, env, nextId, provider);
    if (failure === 'expiry') await vi.advanceTimersByTimeAsync(DUX_SYNC_DEADLINE_MS);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const expectedCode = failure === 'expiry' ? 'DUX_SYNC_DEADLINE_EXCEEDED' : failure === 'total' ? 'DUX_RESPONSE_INVALID' : 'DUX_UNAVAILABLE';
    await expect(step(db, env, nextId, provider)).rejects.toMatchObject({ code: expectedCode });
    expect(await readDuxCatalogSnapshot(db)).toEqual(before);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM dux_sync_operation_pages WHERE request_id = ?").get(nextId)).toEqual({ count: 0 });
    const calls = provider.mock.calls.length;
    await expect(step(db, env, nextId, provider)).rejects.toMatchObject({ code: expectedCode });
    expect(provider).toHaveBeenCalledTimes(calls);
  });

  it('retoma publicación después de una interrupción con inventario ya confirmado sin releer Dux', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(1));
    for (let index = 0; index < 4; index += 1) await step(db, env, requestId, provider);
    const staged = db.database.prepare('SELECT page_key, payload_json FROM dux_sync_operation_pages WHERE request_id = ?').all(requestId);
    const result = await step(db, env, requestId, provider);
    const published: unknown = await result.json();
    // Recreate the durable state left by termination between inventory/catalog
    // publication and the last operation receipt, retaining the same run.
    db.database.prepare("UPDATE dux_sync_operations SET status = 'running', result_json = NULL, lease_until_ms = 0 WHERE request_id = ?").run(requestId);
    const insert = db.database.prepare('INSERT INTO dux_sync_operation_pages (request_id, page_key, payload_json) VALUES (?, ?, ?)');
    for (const row of staged) {
      if (typeof row.page_key !== 'string' || typeof row.payload_json !== 'string') throw new Error('Staging de prueba inválido');
      insert.run(requestId, row.page_key, row.payload_json);
    }
    const beforeCalls = provider.mock.calls.length;
    const beforeRecovery = reservedWrites(db);
    const recovered = await step(db, env, requestId, provider);
    expect(await recovered.json()).toEqual(published);
    expect(provider).toHaveBeenCalledTimes(beforeCalls);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_runs').get()).toEqual({ count: 1 });
    expect(reservedWrites(db) - beforeRecovery).toBe(16);
  });

  it('rechaza el presupuesto diario agotado antes de consultar Dux', async () => {
    const db = database();
    const env = environment(db);
    db.database.prepare('INSERT INTO dux_d1_write_budget (utc_date, estimated_rows, created_at, updated_at) VALUES (?, 40000, ?, ?)')
      .run('2026-10-21', new Date().toISOString(), new Date().toISOString());
    const provider = vi.fn(providerFixture(1));
    await expect(step(db, env, requestId, provider)).rejects.toMatchObject({ code: 'DUX_D1_WRITE_BUDGET_EXHAUSTED' });
    expect(provider).not.toHaveBeenCalled();
    expect(db.database.prepare('SELECT status FROM dux_sync_operations WHERE request_id = ?').get(requestId)).toEqual({ status: 'failed' });
  });

  it('cierra un inicio initial pendiente de 0026 si la reserva falló antes de confirmarse, sin consultar Dux', async () => {
    const db = database();
    const interrupted = interruptedStartupDatabase(db, 'budget');
    const provider = vi.fn(providerFixture(1));
    await expect(step(interrupted, environment(interrupted), requestId, provider)).rejects.toThrow('Interrupción D1 simulada');
    // The existing 0026 fields also identify an initial operation left pending
    // by an older worker; no new migration or paid-plan assumption is needed.
    const pending = db.database.prepare('SELECT kind, status, phase, attempts, lease_token FROM dux_sync_operations WHERE request_id = ?').get(requestId);
    expect(pending).toMatchObject({ kind: 'initial', status: 'running', phase: 'companies', attempts: 0 });
    expect(typeof pending?.lease_token).toBe('string');
    expect((await step(db, environment(db), requestId, provider)).status).toBe(202);
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(step(db, environment(db), requestId, provider)).rejects.toMatchObject({ code: 'DUX_SYNC_START_UNCERTAIN' });
    expect(db.database.prepare('SELECT status, attempts, error_code FROM dux_sync_operations WHERE request_id = ?').get(requestId))
      .toEqual({ status: 'failed', attempts: 0, error_code: 'DUX_SYNC_START_UNCERTAIN' });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_d1_write_budget').get()).toEqual({ count: 0 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_operation_pages').get()).toEqual({ count: 0 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()).toEqual({ count: 0 });
    expect(provider).not.toHaveBeenCalled();
  });

  it('no reembolsa una reserva acreditada si la liberación inicial quedó ambigua y termina sin consultar Dux', async () => {
    const db = database();
    const interrupted = interruptedStartupDatabase(db, 'release_before_commit');
    const provider = vi.fn(providerFixture(1));
    await expect(step(interrupted, environment(interrupted), requestId, provider)).rejects.toThrow('Interrupción D1 simulada');
    expect(reservedWrites(db)).toBe(120 + 96);
    const pending = db.database.prepare('SELECT attempts, lease_token FROM dux_sync_operations WHERE request_id = ?').get(requestId);
    expect(pending?.attempts).toBe(0);
    expect(typeof pending?.lease_token).toBe('string');
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(step(db, environment(db), requestId, provider)).rejects.toMatchObject({ code: 'DUX_SYNC_START_UNCERTAIN' });
    await expect(step(db, environment(db), requestId, provider)).rejects.toMatchObject({ code: 'DUX_SYNC_START_UNCERTAIN' });
    expect(reservedWrites(db)).toBe(120 + 96);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()).toEqual({ count: 0 });
    expect(provider).not.toHaveBeenCalled();
  });

  it('continúa con token NULL si la liberación confirmó pero perdió su respuesta, sin volver a cobrar la base', async () => {
    const db = database();
    const interrupted = interruptedStartupDatabase(db, 'release_after_commit');
    const provider = vi.fn(providerFixture(1));
    await expect(step(interrupted, environment(interrupted), requestId, provider)).rejects.toThrow('Interrupción D1 simulada');
    expect(reservedWrites(db)).toBe(120 + 96);
    expect(db.database.prepare('SELECT status, phase, attempts, lease_token, lease_until_ms FROM dux_sync_operations WHERE request_id = ?').get(requestId))
      .toEqual({ status: 'running', phase: 'companies', attempts: 0, lease_token: null, lease_until_ms: 0 });
    expect(await (await step(db, environment(db), requestId, provider)).json()).toMatchObject({ phase: 'branches' });
    expect(reservedWrites(db)).toBe(120 + 96);
    expect((await complete(db, environment(db), requestId, provider)).status).toBe(200);
    expect(reservedWrites(db)).toBe(120 + 96 + 16 + 14);
    expect(provider).toHaveBeenCalledTimes(4);
    expect((await readDuxCatalogSnapshot(db)).itemCount).toBe(1);
  });

  it('limita el tamaño total de staging aunque cada página individual sea válida', async () => {
    const db = database();
    const env = environment(db);
    const provider = providerFixture(1000, { description: 'a'.repeat(9000) });
    let failure: unknown;
    for (let index = 0; index < 24; index += 1) {
      try { await step(db, env, requestId, provider); }
      catch (error: unknown) { failure = error; break; }
    }
    expect(failure).toMatchObject({ code: 'DUX_STAGING_PAYLOAD_TOO_LARGE' });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()).toEqual({ count: 0 });
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_operation_pages').get()).toEqual({ count: 0 });
  });

  it('rechaza la falta de 0026 sin consultar al proveedor', async () => {
    const previousSchema = readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name) && !name.startsWith('0026_'))
      .sort().map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n');
    const db = new SqliteD1(previousSchema);
    databases.push(db);
    const provider = vi.fn(providerFixture(1));
    await expect(step(db, environment(db), requestId, provider)).rejects.toMatchObject({ status: 503, code: 'DUX_SYNC_MIGRATION_REQUIRED' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('impide usar una identidad de otro actor, empresa, sucursal o depósito sin consultar Dux', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(1));
    await step(db, env, requestId, provider);
    for (const [otherActor, changedEnv] of [
      ['other:operator', env], [actor, { ...env, DUX_COMPANY_ID: '2' }],
      [actor, { ...env, DUX_BRANCH_ID: '2' }], [actor, { ...env, DUX_DEPOSIT_ID: '2' }],
    ] as const) {
      await expect(advanceDuxSyncOperation(db, changedEnv, otherActor, requestId, 'manual', provider))
        .rejects.toMatchObject({ status: 409, code: 'DUX_SYNC_IDENTITY_MISMATCH' });
    }
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('expone progreso y fallo conservando el inicio sin inventar una fecha de finalización para una corrida vencida', async () => {
    const db = database();
    const env = environment(db);
    expect(await latestDuxSyncOperation(db)).toBeNull();
    const provider = providerFixture(1);
    await step(db, env, requestId, provider);
    expect(await latestDuxSyncOperation(db)).toMatchObject({ status: 'running', startedAt: '2026-10-21T13:00:00.000Z', completedAt: null,
      processed: 0, failed: 0, errorCode: null });
    await vi.advanceTimersByTimeAsync(DUX_SYNC_DEADLINE_MS);
    expect(await latestDuxSyncOperation(db)).toMatchObject({ status: 'failed', startedAt: '2026-10-21T13:00:00.000Z', completedAt: null,
      failed: 1, errorCode: 'DUX_SYNC_DEADLINE_EXCEEDED' });
    await expect(step(db, env, requestId, provider)).rejects.toMatchObject({ code: 'DUX_SYNC_DEADLINE_EXCEEDED' });
    expect(await latestDuxSyncOperation(db)).toMatchObject({ status: 'failed', startedAt: '2026-10-21T13:00:00.000Z',
      completedAt: new Date().toISOString(), failed: 1, errorCode: 'DUX_SYNC_DEADLINE_EXCEEDED' });
  });

  it('el guard SQL impide iniciar una corrida legacy mientras se recolecta el catálogo', async () => {
    const db = database();
    await step(db, environment(db), requestId, providerFixture(1));
    expect(() => db.database.prepare(`INSERT INTO dux_sync_runs
      (id, kind, status, trigger_actor, started_at, created_at, updated_at)
      VALUES ('dux_sync_legacy_overlap', 'manual', 'running', 'test', ?1, ?1, ?1)`)
      .run(new Date().toISOString())).toThrow('DUX_SYNC_IN_PROGRESS');
  });

  it('simula el contador de 288 no-ops diarios y confirma el último ciclo real de 1000 productos dentro de 40000', async () => {
    const db = database();
    const env = environment(db);
    const provider = providerFixture(1000);
    vi.setSystemTime(new Date('2026-10-20T23:50:00.000Z'));
    await complete(db, env, requestId, provider);
    vi.setSystemTime(new Date('2026-10-21T00:00:00.000Z'));
    const stepWrites: number[] = [];
    for (let index = 0; index < 24; index += 1) {
      const before = logicalWrites(db);
      const response = await step(db, env, nextId, provider, 'scheduled');
      stepWrites.push(logicalWrites(db) - before);
      if (response.status === 200) break;
      expect(response.status).toBe(202);
    }
    // SQLite total_changes measures logical table writes, not Cloudflare's
    // billable rows_written (which also includes index maintenance).
    expect(stepWrites).toHaveLength(24);
    expect(stepWrites).toEqual([7, ...Array.from({ length: 22 }, () => 4), 33]);
    expect(stepWrites.reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(136);
    expect(reservedWrites(db)).toBe(136);
    db.database.prepare('UPDATE dux_d1_write_budget SET estimated_rows = ?1 WHERE utc_date = ?2').run(136 * 287, '2026-10-21');
    vi.setSystemTime(new Date('2026-10-21T23:55:00.000Z'));
    await complete(db, env, '33333333-3333-4333-8333-333333333333', provider, 'scheduled');
    expect(reservedWrites(db)).toBe(39_168);
    expect(db.database.prepare("SELECT changed_count FROM dux_inventory_generations WHERE status = 'published'").get()).toEqual({ changed_count: 0 });
    expect((await readDuxCatalogSnapshot(db)).itemCount).toBe(1000);
  });

  it('cobra el margen administrativo de 96 y mantiene el coste de delta en 14 por item cambiado', async () => {
    const db = database();
    const env = environment(db);
    await complete(db, env, requestId, providerFixture(2, { names: ['Aceite de coco 200 cc', 'Aceite de coco 400 cc'] }));
    expect(reservedWrites(db)).toBe(120 + 96 + 16 + 14 * 2);
    await vi.advanceTimersByTimeAsync(6000);
    const before = reservedWrites(db);
    await complete(db, env, nextId, providerFixture(2, { names: ['Aceite de coco 180 cc', 'Aceite de coco 400 cc'] }), 'scheduled');
    expect(reservedWrites(db) - before).toBe(136 + 14);
    expect(db.database.prepare("SELECT changed_count FROM dux_inventory_generations WHERE status = 'published'").get()).toEqual({ changed_count: 1 });
  });

  it('no consulta Dux si el margen de recolección no cabe en el presupuesto restante', async () => {
    const db = database();
    const env = environment(db);
    await complete(db, env, requestId, providerFixture(1));
    const previous = await readDuxCatalogSnapshot(db);
    db.database.prepare('UPDATE dux_d1_write_budget SET estimated_rows = 39900 WHERE utc_date = ?1').run('2026-10-21');
    await vi.advanceTimersByTimeAsync(6000);
    const provider = vi.fn(providerFixture(1, { name: 'No debe publicarse', stock: { real: 1, reserved: 0, available: 1 } }));
    await expect(step(db, env, nextId, provider, 'scheduled')).rejects.toMatchObject({ code: 'DUX_D1_WRITE_BUDGET_EXHAUSTED' });
    expect(provider).not.toHaveBeenCalled();
    expect(await readDuxCatalogSnapshot(db)).toEqual(previous);
  });

  it('no publica ni vuelve a consultar Dux si no alcanza el margen de 16 para publicar', async () => {
    const db = database();
    const env = environment(db);
    await complete(db, env, requestId, providerFixture(1));
    const previous = await readDuxCatalogSnapshot(db);
    await vi.advanceTimersByTimeAsync(6000);
    const provider = vi.fn(providerFixture(1, { name: 'No debe publicarse', stock: { real: 1, reserved: 0, available: 1 } }));
    for (let index = 0; index < 4; index += 1) await step(db, env, nextId, provider, 'scheduled');
    const calls = provider.mock.calls.length;
    db.database.prepare('UPDATE dux_d1_write_budget SET estimated_rows = 39990 WHERE utc_date = ?1').run('2026-10-21');
    await expect(step(db, env, nextId, provider, 'scheduled')).rejects.toMatchObject({ code: 'DUX_D1_WRITE_BUDGET_EXHAUSTED' });
    expect(provider).toHaveBeenCalledTimes(calls);
    expect(await readDuxCatalogSnapshot(db)).toEqual(previous);
    expect(db.database.prepare('SELECT COUNT(*) AS count FROM dux_sync_runs').get()).toEqual({ count: 1 });
  });

  it('permite el intento 45 y termina al agotarlo sin consultar otra vez al proveedor', async () => {
    const db = database();
    const env = environment(db);
    const provider = vi.fn(providerFixture(1));
    await step(db, env, requestId, provider);
    db.database.prepare('UPDATE dux_sync_operations SET attempts = 44 WHERE request_id = ?1').run(requestId);
    expect((await step(db, env, requestId, provider)).status).toBe(202);
    expect(db.database.prepare('SELECT attempts FROM dux_sync_operations WHERE request_id = ?1').get(requestId)).toEqual({ attempts: 45 });
    const calls = provider.mock.calls.length;
    await expect(step(db, env, requestId, provider)).rejects.toMatchObject({ code: 'DUX_SUBREQUEST_BUDGET_EXHAUSTED' });
    expect(provider).toHaveBeenCalledTimes(calls);
    expect(db.database.prepare('SELECT status FROM dux_sync_operations WHERE request_id = ?1').get(requestId)).toEqual({ status: 'failed' });
  });
});

describe('identidad de petición Dux', () => {
  it('conserva compatibilidad sin cuerpo y acepta únicamente el UUID declarado', async () => {
    expect(await readDuxSyncRequestId(syncRequest())).toBeNull();
    expect(await readDuxSyncRequestId(syncRequest(JSON.stringify({ requestId })))).toBe(requestId);
  });

  it.each([
    JSON.stringify({ requestId: 'not-a-uuid' }), JSON.stringify({ requestId, actor: 'other' }),
    JSON.stringify({ requestId, padding: 'a'.repeat(128) }),
  ])('rechaza una identidad o campos fuera del contrato', async (body) => {
    await expect(readDuxSyncRequestId(syncRequest(body))).rejects.toMatchObject({ status: 400, code: 'DUX_SYNC_REQUEST_INVALID' });
  });

  it('corta y cancela un cuerpo transmitido por partes al superar 128 bytes', async () => {
    const cancelled = vi.fn();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('a'.repeat(64))); controller.enqueue(encoder.encode('a'.repeat(64))); controller.enqueue(encoder.encode('a')); },
      cancel: cancelled,
    });
    const init = { method: 'POST', body: stream, duplex: 'half' };
    const request = new Request('https://shekinah.ar/api/admin/dux/sync', init);
    await expect(readDuxSyncRequestId(request)).rejects.toMatchObject({ status: 400, code: 'DUX_SYNC_REQUEST_INVALID' });
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});

function syncRequest(body?: string): Request {
  return new Request('https://shekinah.ar/api/admin/dux/sync', { method: 'POST', ...(body === undefined ? {} : { body }) });
}

function database(): SqliteD1 {
  const db = new SqliteD1(schema);
  databases.push(db);
  db.database.exec("UPDATE dux_catalog_control SET snapshot_collection_enabled = 1 WHERE company_id = '12862'");
  return db;
}
function environment(database: D1Database): Env {
  return { DB: database, DIRECT_CHECKOUT_ENABLED: 'true', DUX_API_ENABLED: 'true', DUX_API_TOKEN: 'test-only-token',
    DUX_COMPANY_ID: '12862', DUX_BRANCH_ID: '1', DUX_DEPOSIT_ID: '25566', DUX_SNAPSHOT_MAX_AGE_SECONDS: '900' };
}
async function step(database: D1Database, env: Env, id: string, fetch: DuxFetch, kind: 'manual' | 'scheduled' = 'manual'): Promise<Response> {
  const settled = advanceDuxSyncOperation(database, env, actor, id, kind, fetch)
    .then(response => ({ response }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.response;
}
async function complete(database: D1Database, env: Env, id: string, fetch: DuxFetch, kind: 'manual' | 'scheduled' = 'manual'): Promise<Response> {
  for (let index = 0; index < 80; index += 1) {
    const response = await step(database, env, id, fetch, kind);
    if (response.status === 200) return response;
    expect(response.status).toBe(202);
  }
  throw new Error('La sincronización de prueba no terminó');
}
function meteredDatabase(database: D1Database, count: () => void): D1Database {
  return { prepare(query: string): D1PreparedStatement { count(); return database.prepare(query); },
    batch: statements => database.batch(statements), exec: query => database.exec(query) };
}
function reservedWrites(database: SqliteD1, utcDate = new Date().toISOString().slice(0, 10)): number {
  const row = database.database.prepare('SELECT estimated_rows FROM dux_d1_write_budget WHERE utc_date = ?1').get(utcDate);
  if (typeof row?.estimated_rows !== 'number') throw new Error('Presupuesto de prueba ausente');
  return row.estimated_rows;
}
function logicalWrites(database: SqliteD1): number {
  const row = database.database.prepare('SELECT total_changes() AS written').get();
  if (typeof row?.written !== 'number') throw new Error('Contador de prueba ausente');
  return row.written;
}
function interruptedStartupDatabase(database: D1Database, failure: 'budget' | 'release_before_commit' | 'release_after_commit'): D1Database {
  return {
    prepare: query => {
      const statement = database.prepare(query);
      const interrupted = failure === 'budget' ? query.includes('INSERT INTO dux_d1_write_budget')
        : query.includes('UPDATE dux_sync_operations SET lease_token = NULL, lease_until_ms = 0');
      return interrupted ? interruptedStatement(statement, failure === 'budget' ? 'first' : 'run', failure === 'release_after_commit') : statement;
    },
    batch: statements => database.batch(statements), exec: query => database.exec(query),
  };
}
function interruptedStatement(statement: D1PreparedStatement, method: 'first' | 'run', afterCommit: boolean): D1PreparedStatement {
  async function interrupt<T>(execute: () => Promise<T>): Promise<T> {
    if (afterCommit) await execute();
    throw new Error('Interrupción D1 simulada');
  }
  return {
    bind: (...values) => interruptedStatement(statement.bind(...values), method, afterCommit),
    first: <T>(column?: string) => method === 'first' ? interrupt(() => statement.first<T>(column)) : statement.first<T>(column),
    run: <T>() => method === 'run' ? interrupt(() => statement.run<T>()) : statement.run<T>(),
    all: <T>() => statement.all<T>(), raw: <T>(options?: Readonly<{ columnNames?: boolean }>) => statement.raw<T>(options),
  };
}
function delayedFirst(statement: D1PreparedStatement, beforeFirst: () => Promise<void>, captureBeforeWait = false): D1PreparedStatement {
  return {
    bind: (...values) => delayedFirst(statement.bind(...values), beforeFirst, captureBeforeWait),
    first: async <T>(column?: string) => {
      if (captureBeforeWait) { const captured = await statement.first<T>(column); await beforeFirst(); return captured; }
      await beforeFirst(); return statement.first<T>(column);
    },
    all: <T>() => statement.all<T>(), run: <T>() => statement.run<T>(), raw: <T>(options?: Readonly<{ columnNames?: boolean }>) => statement.raw<T>(options),
  };
}
function inputUrl(input: RequestInfo | URL): URL { return input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url); }
function providerFixture(total: number, options: { name?: string; names?: readonly string[]; description?: string;
  stock?: Readonly<{ real: number; reserved: number; available: number }>; failSecondPage?: boolean; changeTotal?: boolean } = {}): DuxFetch {
  return input => {
    const url = inputUrl(input);
    let value: unknown;
    if (url.pathname.endsWith('/empresas')) value = { datos: [{ id_empresa: 12862, razon_social: 'Empresa de prueba' }] };
    else if (url.pathname.endsWith('/sucursales')) value = { datos: [{ id_empresa: 12862, id_sucursal: 1, sucursal: 'Principal' }] };
    else if (url.pathname.endsWith('/depositos')) value = { datos: [{ id_empresa: 12862, id_deposito: 25566, deposito: 'Central', habilitado: true }] };
    else {
      const offset = Number(url.searchParams.get('offset'));
      if (options.failSecondPage && offset > 0) return Promise.resolve(new Response('{}', { status: 503 }));
      value = { datos: Array.from({ length: Math.min(50, total - offset) }, (_, index) => ({
        cod_item: `TEST-${offset + index}`, item: options.names?.[offset + index] ?? (offset + index === 0 ? options.name ?? 'Producto prueba 0' : `Producto prueba ${offset + index}`),
        habilitado: true, codigo_externo: null, codigos_barra: null, ctd_unidades_por_bulto: 1,
        ...(options.description === undefined ? {} : { descripcion: options.description }),
        precios: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 3500 }], rubro: null, sub_rubro: null,
        stock: [{ id: 25566, nombre: 'Central', stock_real: options.stock?.real ?? 12.68, stock_reservado: options.stock?.reserved ?? 0, stock_disponible: options.stock?.available ?? 12.68,
          id_det_item: null, cod_barra_detalle: null, talle: null, color: null }],
      })), paginacion: { total: options.changeTotal && offset > 0 ? total + 1 : total, offset, limit: 50, hay_mas: offset + 50 < total } };
    }
    return Promise.resolve(new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
  };
}
