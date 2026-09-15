import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDuxInventoryReader } from './dux-inventory-reader';
import { syncDuxInventory } from './dux-inventory';
import { SqliteD1 } from './test/sqlite-d1';
import type { D1Database, Env } from './platform';

const schema = readdirSync(resolve('migrations')).filter(name => /^\d{4}_.*\.sql$/u.test(name)).sort()
  .map(name => readFileSync(resolve('migrations', name), 'utf8')).join('\n');

it.each([0, 1, 2])('mantiene 1000 productos y coordinación con %i retries dentro de D1 Free', async (retries) => {
  const db = new SqliteD1(schema);
  let queries = 0;
  let staging = 0;
  let requests = 0;
  const starts: number[] = [];
  const metered: D1Database = {
    prepare: query => {
      queries += 1;
      if (query.includes('FROM json_each(?2) AS staged')) staging += 1;
      return db.prepare(query);
    },
    batch: statements => db.batch(statements),
    exec: query => db.exec(query),
  };
  const env: Env = { DB: metered, DIRECT_CHECKOUT_ENABLED: 'true', DUX_API_ENABLED: 'true',
    DUX_API_TOKEN: 'test-only-token', DUX_COMPANY_ID: '1', DUX_BRANCH_ID: '2', DUX_DEPOSIT_ID: '3' };
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
  try {
    const reader = createDuxInventoryReader(env, input => {
      requests += 1;
      starts.push(Date.now());
      if (requests <= retries) return Promise.resolve(new Response('{}', { status: 503 }));
      const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
      let value: unknown;
      if (url.pathname.endsWith('/empresas')) value = { datos: [{ id_empresa: 1, razon_social: 'Empresa prueba' }] };
      else if (url.pathname.endsWith('/sucursales')) value = { datos: [{ id_empresa: 1, id_sucursal: 2, sucursal: 'Principal' }] };
      else if (url.pathname.endsWith('/depositos')) value = { datos: [{ id_empresa: 1, id_deposito: 3, deposito: 'Central', habilitado: true }] };
      else {
        const offset = Number(url.searchParams.get('offset'));
        value = { datos: Array.from({ length: 50 }, (_, index) => ({
          cod_item: `TEST-${offset + index}`, item: `Producto prueba ${offset + index}`, habilitado: true,
          codigo_externo: null, codigos_barra: null, ctd_unidades_por_bulto: 1,
          stock: [{ id: 3, nombre: 'Central', stock_real: 12.68, stock_reservado: 0, stock_disponible: 12.68,
            id_det_item: null, cod_barra_detalle: null, talle: null, color: null }],
        })), paginacion: { total: 1000, offset, limit: 50, hay_mas: offset < 950 } };
      }
      return Promise.resolve(new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
    });
    const sync = syncDuxInventory(metered, env, 'test', { kind: 'initial', localProducts: [], client: reader });
    const result = retries < 2
      ? expect(sync).resolves.toMatchObject({ status: 'succeeded', processed: 1000, failed: 0 })
      : expect(sync).rejects.toMatchObject({ code: 'DUX_SUBREQUEST_BUDGET_EXHAUSTED' });
    await vi.runAllTimersAsync();
    await result;
    if (retries === 2) {
      expect(requests).toBe(24);
      expect(queries + 6).toBeLessThanOrEqual(50);
      expect(await db.prepare('SELECT COUNT(*) AS count FROM dux_inventory_items').first()).toEqual({ count: 0 });
      expect(await db.prepare('SELECT status FROM dux_inventory_generations').first()).toEqual({ status: 'failed' });
      return;
    }
    expect(reader.takeCatalogItems()).toHaveLength(1000);
    expect(requests).toBe(23 + retries);
    expect(staging).toBe(2);
    expect(queries).toBe(43 + retries);
    // Incluye seis consultas de margen para wrappers, publicación/cleanup y auditoría.
    expect(queries + 6).toBeLessThanOrEqual(50);
    for (let index = 1; index < starts.length; index += 1) expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(5000);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM dux_inventory_items').first()).toEqual({ count: 1000 });
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  } finally { vi.useRealTimers(); db.close(); }
});
