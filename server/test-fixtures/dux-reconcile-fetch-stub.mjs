const scenario = process.env.DUX_RUNNER_TEST_SCENARIO;
let calls = 0;
process.on('exit', () => { console.log(`DUX_RUNNER_TEST_REQUESTS=${calls}`); });

const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, milliseconds, ...arguments_) => (
  nativeSetTimeout(callback, Math.min(Number(milliseconds), 1), ...arguments_)
);

globalThis.fetch = async () => {
  calls += 1;
  if (scenario === 'server_error_then_cooldown') {
    return calls === 1
      ? jsonResponse(500, 'DUX_UNAVAILABLE')
      : jsonResponse(429, 'DUX_SYNC_COOLDOWN');
  }
  if (scenario === 'timeout_then_in_progress') {
    if (calls === 1) throw new DOMException('simulated timeout', 'TimeoutError');
    return jsonResponse(409, 'DUX_SYNC_IN_PROGRESS');
  }
  if (scenario === 'initial_overlap') {
    return jsonResponse(409, 'DUX_SYNC_IN_PROGRESS');
  }
  if (scenario === 'initial_cooldown') {
    return jsonResponse(429, 'DUX_SYNC_COOLDOWN');
  }
  if (scenario === 'disabled') {
    return new Response(JSON.stringify({ status: 'disabled' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (scenario === 'invalid_success_json') return new Response('not JSON', { status: 200 });
  if (scenario?.startsWith('catalog_')) {
    return new Response(JSON.stringify(catalogResult(scenario)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error('Escenario de runner Dux no reconocido.');
};

function catalogResult(kind) {
  const result = {
    status: 'completed',
    summary: {
      runId: 'dux_sync_runner_fixture', status: 'succeeded', processed: 2, failed: 0,
      mapped: 1, unmapped: 1, ambiguous: 0, completedAt: '2026-09-07T01:09:11.000Z',
    },
    catalog: {
      inventoryRunId: 'dux_sync_runner_fixture', catalogVersion: 'a'.repeat(64),
      priceListName: 'PRECIOS DEL NEGOCIO', itemCount: 3, syncedAt: '2026-09-07T01:09:11.000Z',
    },
  };
  switch (kind) {
    case 'catalog_published': break;
    case 'catalog_missing': delete result.catalog; break;
    case 'catalog_disabled': result.catalog = { status: 'disabled', reason: 'snapshot_collection_disabled' }; break;
    case 'catalog_pending_migration': result.catalog = { status: 'pending_migration', migration: '0017_dux_complete_public_catalog.sql' }; break;
    case 'catalog_run_mismatch': result.catalog.inventoryRunId = 'dux_sync_another'; break;
    case 'catalog_missing_run': delete result.summary.runId; break;
    case 'catalog_invalid_version': result.catalog.catalogVersion = 'invalid'; break;
    case 'catalog_wrong_price_list': result.catalog.priceListName = 'Otra lista'; break;
    case 'catalog_invalid_count': result.catalog.itemCount = -1; break;
    case 'catalog_time_mismatch': result.catalog.syncedAt = '2026-09-07T01:09:10.000Z'; break;
    case 'catalog_invalid_time': result.catalog.syncedAt = result.summary.completedAt = 'invalid'; break;
    case 'catalog_invalid_metric': result.summary.mapped = -1; break;
    case 'catalog_partial_inventory': result.summary.status = 'partial'; result.summary.failed = 1; break;
    default: throw new Error('Escenario de catálogo desconocido.');
  }
  return result;
}

function jsonResponse(status, code) {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: {
      'content-type': 'application/json',
      'retry-after': '0',
    },
  });
}
