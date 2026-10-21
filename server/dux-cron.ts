import type { Env } from './platform';

const endpoint = 'https://shekinah.ar/api/internal/dux/reconcile';
const phases = ['companies', 'branches', 'warehouses', 'items', 'publish'];

type Progress = Readonly<{ runId: string; phase: string; processed: number; total: number | null }>;

/** A small Cron Trigger relay. Pages retains the D1 lock and all Dux read guards. */
export default {
  async scheduled(controller: Readonly<{ scheduledTime: number; cron: string }>, env: Pick<Env, 'DUX_CRON_SECRET'>): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    if (!env.DUX_CRON_SECRET || env.DUX_CRON_SECRET.length < 32) throw new Error('DUX_CRON_SECRET_MISSING');
    const startedAt = new Date().toISOString();
    const requestId = crypto.randomUUID();
    const deadline = performance.now() + 7 * 60 * 1_000;
    let progress: Progress | null = null;
    for (let step = 0; step < 80; step += 1) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('DUX_RELAY_DEADLINE');
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.min(90_000, Math.ceil(remaining))),
          headers: { authorization: `Bearer ${env.DUX_CRON_SECRET}`, 'x-shekinah-scheduled-at': scheduledAt,
            'content-type': 'application/json' },
          body: JSON.stringify({ requestId }),
        });
      } catch {
        console.error('dux_cron_failed', { scheduledAt, startedAt, code: 'DUX_RELAY_TRANSPORT' });
        throw new Error('DUX_RELAY_TRANSPORT');
      }
      const reader = response.body?.getReader();
      let text = '';
      let size = 0;
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 32768) { await reader.cancel(); throw new Error('DUX_RELAY_RESPONSE_LIMIT'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      }
      let result: unknown;
      try { result = JSON.parse(text) as unknown; }
      catch { throw new Error('DUX_RELAY_RESPONSE_INVALID'); }
      if (response.status === 202) {
        if (!validProgress(result, requestId, progress)) throw new Error('DUX_RELAY_PROGRESS_INVALID');
        progress = result;
        await new Promise(resolve => setTimeout(resolve, 1_000));
        continue;
      }
      if (response.status !== 200 || !validPublication(result) ||
        (progress !== null && result.catalog.inventoryRunId !== progress.runId)) {
        console.error('dux_cron_failed', { scheduledAt, startedAt, httpStatus: response.status });
        throw new Error('DUX_RELAY_PUBLICATION_UNCONFIRMED');
      }
      console.log('dux_cron_published', { scheduledAt, startedAt, completedAt: new Date().toISOString(),
        inventoryRunId: result.catalog.inventoryRunId, publishedAt: result.catalog.syncedAt,
        stockReadAt: result.summary.startedAt, itemCount: result.catalog.itemCount });
      return;
    }
    throw new Error('DUX_RELAY_STEP_LIMIT');
  },
};

function validProgress(value: unknown, requestId: string, previous: Progress | null): value is Progress {
  return record(value) && value.status === 'running' && value.requestId === requestId &&
    typeof value.runId === 'string' && /^dux_sync_[A-Za-z0-9._:-]{1,180}$/u.test(value.runId) &&
    typeof value.phase === 'string' && phases.includes(value.phase) &&
    typeof value.processed === 'number' && Number.isSafeInteger(value.processed) && value.processed >= 0 && value.processed <= 1_000 &&
    (value.total === null || (typeof value.total === 'number' && Number.isSafeInteger(value.total) &&
      value.total >= value.processed && value.total <= 1_000)) && value.retryAfterMs === 1_000 &&
    (previous === null || (value.runId === previous.runId && value.processed >= previous.processed &&
      phases.indexOf(value.phase) >= phases.indexOf(previous.phase) &&
      (previous.total === null || value.total === previous.total)));
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validPublication(value: unknown): value is {
  summary: { startedAt: string }; catalog: { inventoryRunId: string; syncedAt: string; itemCount: number };
} {
  if (!record(value) || value.status !== 'completed' || !record(value.summary) || !record(value.catalog)) return false;
  const { summary, catalog } = value;
  return summary.status === 'succeeded' && summary.failed === 0 &&
    typeof summary.startedAt === 'string' && Number.isFinite(Date.parse(summary.startedAt)) &&
    typeof catalog.inventoryRunId === 'string' && /^dux_sync_[A-Za-z0-9._:-]{1,180}$/u.test(catalog.inventoryRunId) &&
    catalog.inventoryRunId === summary.runId && catalog.syncedAt === summary.completedAt &&
    typeof catalog.syncedAt === 'string' && Number.isFinite(Date.parse(catalog.syncedAt)) &&
    typeof catalog.catalogVersion === 'string' && /^[a-f0-9]{64}$/u.test(catalog.catalogVersion) &&
    catalog.priceListName === 'PRECIOS DEL NEGOCIO' && typeof catalog.itemCount === 'number' && Number.isSafeInteger(catalog.itemCount) && catalog.itemCount >= 0;
}
