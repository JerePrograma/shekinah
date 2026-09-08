import type { D1Database } from './platform';

/** Records a breached objective; serving a response never changes inventory dates. */
export async function recordDuxFreshnessBreach(database: D1Database, actor: string, observedAt = new Date().toISOString()): Promise<void> {
  await database.prepare(`INSERT INTO admin_audit (
    id, actor_sub, actor_email, action, target_type, target_id, request_id, outcome_status, metadata_json, created_at
  ) SELECT ?1, ?2, ?2, 'dux.stock_freshness_exceeded', 'dux_sync_run', run.id, ?1, 503,
    json_object('stockReadAt', run.started_at, 'observedAt', ?3, 'maximumAgeSeconds', 900,
      'observedAgeSeconds', (julianday(?3) - julianday(run.started_at)) * 86400), ?3
    FROM dux_catalog_snapshots_v2 AS catalog JOIN dux_sync_runs AS run ON run.id = catalog.inventory_run_id
    WHERE catalog.id = 1 AND (julianday(?3) - julianday(run.started_at)) * 86400 > 900`)
    .bind(crypto.randomUUID(), actor, observedAt).run();
}
