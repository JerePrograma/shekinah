import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestD1 } from '../src/test/d1';
import { recordDuxFreshnessBreach } from './dux-freshness';

it('audita sólo stock de más de quince minutos usando el inicio de su lectura y sin rejuvenecerlo', async () => {
  const testD1 = createTestD1(...readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort().map(name=>readFileSync(resolve('migrations',name),'utf8')));
  try {
    testD1.sqlite.exec(`UPDATE dux_catalog_control SET snapshot_collection_enabled=1;
      INSERT INTO dux_sync_runs (id,kind,status,trigger_actor,started_at,completed_at,created_at,updated_at)
      VALUES ('dux_sync_freshness','scheduled','succeeded','test','2026-09-08T12:00:00.000Z','2026-09-08T12:01:30.000Z','2026-09-08T12:00:00.000Z','2026-09-08T12:01:30.000Z');`);
    testD1.sqlite.prepare(`INSERT INTO dux_catalog_snapshots_v2 (id,inventory_run_id,catalog_version,price_list_name,item_count,payload_json,synced_at,created_at,updated_at)
      VALUES (1,'dux_sync_freshness',?,'PRECIOS DEL NEGOCIO',0,?,'2026-09-08T12:01:30.000Z','2026-09-08T12:01:30.000Z','2026-09-08T12:01:30.000Z')`)
      .run('a'.repeat(64), JSON.stringify({schemaVersion:2,priceListName:'PRECIOS DEL NEGOCIO',items:[]}));
    await recordDuxFreshnessBreach(testD1.database,'scheduler:cloudflare-cron','2026-09-08T12:14:59.000Z');
    expect(testD1.sqlite.prepare('SELECT id FROM admin_audit').all()).toHaveLength(0);
    await recordDuxFreshnessBreach(testD1.database,'scheduler:cloudflare-cron','2026-09-08T12:15:01.000Z');
    const rows = testD1.sqlite.prepare('SELECT action,metadata_json FROM admin_audit').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('dux.stock_freshness_exceeded');
    expect(JSON.parse(String(rows[0]?.metadata_json))).toMatchObject({stockReadAt:'2026-09-08T12:00:00.000Z', maximumAgeSeconds:900});
    expect(testD1.sqlite.prepare('SELECT started_at FROM dux_sync_runs').get()?.started_at).toBe('2026-09-08T12:00:00.000Z');
  } finally { testD1.close(); }
});
