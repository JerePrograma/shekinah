import type { Env } from './platform';

const endpoint = 'https://shekinah.ar/api/internal/dux/reconcile';
const phases = ['companies', 'branches', 'warehouses', 'items', 'publish'];
const MAX_REQUESTS = 50;
const MAX_STEP_ATTEMPTS = 2;
const DEADLINE_MS = 7 * 60 * 1_000;

type Progress = Readonly<{ runId: string; phase: string; processed: number; total: number | null }>;
type RequestState = { requests: number };
class RelayError extends Error {}
class RetryableRelayError extends RelayError {}

/** A small Cron Trigger relay. Pages retains the D1 lock and all Dux read guards. */
export default {
  async scheduled(controller: Readonly<{ scheduledTime: number; cron: string }>, env: Pick<Env, 'DUX_CRON_SECRET'>): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    const startedAt = new Date().toISOString();
    const requestId = crypto.randomUUID();
    const deadline = performance.now() + DEADLINE_MS;
    const state: RequestState = { requests: 0 };
    let progress: Progress | null = null;
    console.log('dux_cron_started', { scheduledAt, startedAt, requestId, cron: controller.cron });
    try {
      if (!env.DUX_CRON_SECRET || env.DUX_CRON_SECRET.length < 32) throw new RelayError('DUX_CRON_SECRET_MISSING');
      while (state.requests < MAX_REQUESTS) {
        const { response, result } = await requestStep(env.DUX_CRON_SECRET, scheduledAt, requestId, deadline, state);
        if (response.status === 202) {
          if (!validProgress(result, requestId, progress)) throw new RelayError('DUX_RELAY_PROGRESS_INVALID');
          progress = result;
          if (state.requests >= MAX_REQUESTS) throw new RelayError('DUX_RELAY_STEP_LIMIT');
          await pause(1_000, deadline);
          continue;
        }
        if (response.status !== 200 || !validPublication(result) ||
          (progress !== null && result.catalog.inventoryRunId !== progress.runId)) {
          throw new RelayError('DUX_RELAY_PUBLICATION_UNCONFIRMED');
        }
        console.log('dux_cron_published', { scheduledAt, startedAt, completedAt: new Date().toISOString(),
          inventoryRunId: result.catalog.inventoryRunId, publishedAt: result.catalog.syncedAt,
          stockReadAt: result.summary.startedAt, itemCount: result.catalog.itemCount, requests: state.requests });
        return;
      }
      throw new RelayError('DUX_RELAY_STEP_LIMIT');
    } catch (error: unknown) {
      const code = error instanceof RelayError ? error.message : 'DUX_RELAY_UNAVAILABLE';
      console.error('dux_cron_failed', { scheduledAt, startedAt, requestId, requests: state.requests, code });
      throw new RelayError(code);
    }
  },
};

async function requestStep(secret: string, scheduledAt: string, requestId: string, deadline: number, state: RequestState): Promise<Readonly<{ response: Response; result: unknown }>> {
  for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt += 1) {
    const remaining = remainingTime(deadline);
    if (state.requests >= MAX_REQUESTS) throw new RelayError('DUX_RELAY_STEP_LIMIT');
    state.requests += 1;
    let httpStatus: number | null = null;
    try {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.min(90_000, Math.ceil(remaining))),
          headers: { authorization: `Bearer ${secret}`, 'x-shekinah-scheduled-at': scheduledAt,
            'content-type': 'application/json' },
          body: JSON.stringify({ requestId }),
        });
      } catch { throw new RetryableRelayError('DUX_RELAY_TRANSPORT'); }
      httpStatus = response.status;
      if (response.status >= 400 && response.status < 500) {
        // Once a terminal client status is known, a broken response body must
        // not turn that rejection into another authenticated POST.
        try { await response.body?.cancel(); } catch { /* The HTTP status is already conclusive. */ }
        throw new RelayError('DUX_RELAY_PUBLICATION_UNCONFIRMED');
      }
      const result = await readPayload(response);
      remainingTime(deadline);
      if (!response.ok) {
        // A structured server error is terminal, including provider rejection,
        // cooldown, protected overlap and exhausted budgets. Only an unclassified
        // gateway failure may recover the same operation after lost transport.
        if (record(result) && record(result.error) && typeof result.error.code === 'string') {
          throw new RelayError('DUX_RELAY_PUBLICATION_UNCONFIRMED');
        }
        if (response.status >= 500) throw new RetryableRelayError('DUX_RELAY_GATEWAY');
        throw new RelayError('DUX_RELAY_PUBLICATION_UNCONFIRMED');
      }
      return { response, result };
    } catch (error: unknown) {
      if (!(error instanceof RetryableRelayError)) throw error;
      if (attempt === MAX_STEP_ATTEMPTS) throw new RelayError(error.message);
      console.warn('dux_cron_retry', { scheduledAt, attempt, requests: state.requests, httpStatus, code: error.message });
      await pause(2_000, deadline);
    }
  }
  throw new RelayError('DUX_RELAY_TRANSPORT');
}

async function readPayload(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 32768) {
          try { await reader.cancel(); } catch { /* The bounded body is already rejected. */ }
          throw new RelayError('DUX_RELAY_RESPONSE_LIMIT');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } catch (error: unknown) {
      if (error instanceof RelayError) throw error;
      throw new RetryableRelayError('DUX_RELAY_TRANSPORT');
    }
  }
  try { return JSON.parse(text) as unknown; }
  catch {
    if (response.status >= 500) throw new RetryableRelayError('DUX_RELAY_GATEWAY');
    throw new RelayError('DUX_RELAY_RESPONSE_INVALID');
  }
}

function remainingTime(deadline: number): number {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new RelayError('DUX_RELAY_DEADLINE');
  return remaining;
}

async function pause(milliseconds: number, deadline: number): Promise<void> {
  if (remainingTime(deadline) <= milliseconds) throw new RelayError('DUX_RELAY_DEADLINE');
  await new Promise(resolve => setTimeout(resolve, milliseconds));
  remainingTime(deadline);
}

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
