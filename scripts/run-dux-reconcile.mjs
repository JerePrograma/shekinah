const expectedPath = '/api/internal/dux/reconcile';
const requestTimeoutMs = 90_000;
const maximumRetryDelayMs = 30_000;
const reconciliationDeadlineMs = 7 * 60 * 1_000;
const maximumRequests = 80;
const phases = ['companies', 'branches', 'warehouses', 'items', 'publish'];
const transportCodes = new Set([
  'ABORT_ERR', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_SIGNATURE_FAILURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class NonRetryableReconciliationError extends Error {}
class ReconciliationResponseError extends Error {}

const target = parseTarget(process.env.SHEKINAH_RECONCILE_URL);
const secret = requireSecret(process.env.SHEKINAH_RECONCILE_SECRET);
const requestId = crypto.randomUUID();

const result = await reconcileWithRetry(target, secret);
if (result.status === 'disabled') {
  throw new Error('La reconciliación Dux no se ejecutó porque la integración está deshabilitada.');
} else if (result.status === 'in_progress') {
  throw new Error(
    'La reconciliación Dux no se ejecutó porque ya existe un ciclo protegido por el lock D1 ' +
    '(DUX_SYNC_IN_PROGRESS).',
  );
} else {
  const optionalMetrics = [
    ['vinculadas', result.summary.mapped],
    ['sin_vincular', result.summary.unmapped],
    ['ambiguas', result.summary.ambiguous],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `${label}=${value}`)
    .join(' ');
  console.log(
    `Reconciliación Dux completada: estado=${result.summary.status} ` +
    `procesadas=${result.summary.processed} fallidas=${result.summary.failed}` +
    (optionalMetrics === '' ? '.' : ` ${optionalMetrics}.`),
  );
  if (result.summary.status !== 'succeeded' || result.summary.failed > 0) {
    throw new Error('La reconciliación Dux requiere atención operativa.');
  }
  console.log(
    `Catálogo Dux confirmado: run=${result.catalog.inventoryRunId} ` +
    `productos=${result.catalog.itemCount} versión=${result.catalog.catalogVersion} ` +
    `publicado=${result.catalog.syncedAt}.`,
  );
}

async function reconcileWithRetry(url, schedulerSecret) {
  const startedAt = performance.now();
  const state = { requests: 0, progress: null };
  while (true) {
    const result = await requestStep(url, schedulerSecret, startedAt, state);
    if (result.status !== 'running') return result;
    state.progress = result;
    await boundedDelay(result.retryAfterMs, startedAt);
  }
}

async function requestStep(url, schedulerSecret, startedAt, state) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let phase = 'fetch_headers';
    let httpStatus = null;
    try {
      const remaining = remainingTime(startedAt);
      if (state.requests >= maximumRequests) {
        throw new NonRetryableReconciliationError('La reconciliación Dux agotó sus pasos (DUX_RECONCILE_STEP_LIMIT).');
      }
      state.requests += 1;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${schedulerSecret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, Math.ceil(remaining))),
      });
      httpStatus = response.status;
      phase = 'read_body';
      const payload = await readResponse(response);
      phase = 'classify_response';
      const protectedOverlap = response.status === 409 &&
        errorCode(payload) === 'DUX_SYNC_IN_PROGRESS';
      if (protectedOverlap && attempt === 1 && lastError === undefined) {
        return { status: 'in_progress' };
      }
      if (response.status === 429 && errorCode(payload) === 'DUX_SYNC_COOLDOWN') {
        throw new NonRetryableReconciliationError(
          'La reconciliación Dux no se ejecutó porque el ciclo anterior sigue en cooldown ' +
          '(DUX_SYNC_COOLDOWN).',
        );
      }
      if (!response.ok) {
        const code = errorCode(payload) ?? `HTTP_${response.status}`;
        const message = `La reconciliación Dux respondió ${response.status} (${code}).`;
        if (errorCode(payload) !== null || response.status < 500) {
          throw new NonRetryableReconciliationError(message);
        }
        const error = new ReconciliationResponseError(message);
        if (attempt === 2) throw error;
        lastError = error;
        await boundedDelay(retryDelayMs(response), startedAt);
        continue;
      }
      if (response.status === 202) return parseProgress(payload, state.progress);
      if (response.status !== 200) throw invalidProgress();
      const result = parseResult(payload);
      if (result.status === 'completed' && state.progress !== null &&
        result.catalog.inventoryRunId !== state.progress.runId) throw invalidProgress();
      return result;
    } catch (error) {
      if (error instanceof NonRetryableReconciliationError) throw error;
      const diagnostic = {
        version: 1, attempt, request: state.requests, phase, httpStatus,
        errorClass: safeErrorClass(error), errorCode: safeTransportCode(error),
        causeCode: isRecord(error) ? safeTransportCode(error.cause) : null,
      };
      console.error('dux_reconcile_request_failure', JSON.stringify(diagnostic));
      lastError = new Error(
        `No se pudo confirmar el paso Dux (DUX_RECONCILE_TRANSPORT; fase=${phase}; ` +
        `HTTP=${httpStatus ?? 'none'}; clase=${diagnostic.errorClass}; ` +
        `código=${diagnostic.errorCode ?? 'none'}; causa=${diagnostic.causeCode ?? 'none'}).`,
      );
      if (attempt === 2) break;
      await boundedDelay(2_000, startedAt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('La reconciliación Dux no pudo completarse.');
}

function safeErrorClass(error) {
  if (error instanceof ReconciliationResponseError) return 'response_error';
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof AggregateError) return 'aggregate_error';
  if (error instanceof DOMException) {
    if (error.name === 'TimeoutError') return 'timeout_error';
    if (error.name === 'AbortError') return 'abort_error';
    return 'dom_exception';
  }
  return error instanceof Error ? 'error' : 'unknown';
}

function safeTransportCode(error) {
  return isRecord(error) && typeof error.code === 'string' && transportCodes.has(error.code) ? error.code : null;
}

function parseProgress(value, previous) {
  if (!isRecord(value) || value.status !== 'running' || value.requestId !== requestId ||
    typeof value.runId !== 'string' || !/^dux_sync_[A-Za-z0-9._:-]{1,180}$/u.test(value.runId) ||
    !phases.includes(value.phase) || !isMetric(value.processed) || value.processed > 1_000 ||
    !(value.total === null || (isMetric(value.total) && value.total <= 1_000 && value.processed <= value.total)) ||
    value.retryAfterMs !== 1_000 ||
    (previous !== null && (value.runId !== previous.runId || value.processed < previous.processed ||
      phases.indexOf(value.phase) < phases.indexOf(previous.phase) ||
      (previous.total !== null && value.total !== previous.total)))) {
    throw invalidProgress();
  }
  return value;
}

function invalidProgress() {
  return new NonRetryableReconciliationError('El progreso de la reconciliación Dux no es válido (DUX_RECONCILE_PROGRESS_INVALID).');
}

function remainingTime(startedAt) {
  const remaining = reconciliationDeadlineMs - (performance.now() - startedAt);
  if (remaining <= 0) {
    throw new NonRetryableReconciliationError('La reconciliación Dux excedió el plazo (DUX_RECONCILE_DEADLINE).');
  }
  return remaining;
}

async function boundedDelay(milliseconds, startedAt) {
  const remaining = remainingTime(startedAt);
  await delay(Math.min(milliseconds, remaining));
  remainingTime(startedAt);
}

async function readResponse(response) {
  const ValidationError = response.ok ? NonRetryableReconciliationError : ReconciliationResponseError;
  const text = await response.text();
  if (text.length > 32_768) {
    throw new ValidationError('La respuesta de reconciliación Dux excede el límite permitido.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError(`La reconciliación Dux respondió ${response.status} con un cuerpo inválido.`);
  }
}

function parseResult(value) {
  if (!isRecord(value)) throw new NonRetryableReconciliationError('La reconciliación Dux devolvió un resultado inválido.');
  if (value.status === 'disabled') return { status: 'disabled' };
  if (
    value.status !== 'completed' || !isRecord(value.summary) ||
    !['succeeded', 'partial', 'failed'].includes(value.summary.status) ||
    !isMetric(value.summary.processed) || !isMetric(value.summary.failed)
  ) {
    throw new NonRetryableReconciliationError('La reconciliación Dux devolvió un resultado inválido.');
  }
  const catalog = parseCatalogPublication(value.catalog, value.summary);
  return {
    status: 'completed',
    catalog,
    summary: {
      status: value.summary.status,
      processed: value.summary.processed,
      failed: value.summary.failed,
      mapped: optionalMetric(value.summary.mapped),
      unmapped: optionalMetric(value.summary.unmapped),
      ambiguous: optionalMetric(value.summary.ambiguous),
    },
  };
}

function parseCatalogPublication(value, summary) {
  if (
    !isRecord(value) || value.status !== undefined ||
    typeof summary.runId !== 'string' || !/^dux_sync_[A-Za-z0-9._:-]{1,180}$/u.test(summary.runId) ||
    value.inventoryRunId !== summary.runId ||
    typeof value.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(value.catalogVersion) ||
    value.priceListName !== 'PRECIOS DEL NEGOCIO' || !isMetric(value.itemCount) ||
    !isTimestamp(summary.completedAt) || value.syncedAt !== summary.completedAt
  ) {
    throw new NonRetryableReconciliationError(
      'El inventario respondió, pero no se confirmó una publicación válida del catálogo Dux ' +
      'asociada al mismo ciclo (DUX_CATALOG_PUBLICATION_UNCONFIRMED). No se reintentará Dux.',
    );
  }
  return {
    inventoryRunId: value.inventoryRunId,
    catalogVersion: value.catalogVersion,
    itemCount: value.itemCount,
    syncedAt: value.syncedAt,
  };
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function parseTarget(value) {
  if (typeof value !== 'string') throw new Error('Falta SHEKINAH_RECONCILE_URL.');
  const url = new URL(value);
  if (
    url.origin !== 'https://shekinah.ar' || url.username !== '' || url.password !== '' ||
    url.pathname !== expectedPath || url.search !== '' || url.hash !== ''
  ) {
    throw new Error('SHEKINAH_RECONCILE_URL no es el endpoint HTTPS autorizado.');
  }
  return url;
}

function requireSecret(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 4_096) {
    throw new Error('Falta SHEKINAH_RECONCILE_SECRET.');
  }
  return value;
}

function retryDelayMs(response) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter === null || !/^\d+$/u.test(retryAfter)) return 2_000;
  return Math.min(Number(retryAfter) * 1_000, maximumRetryDelayMs);
}

function errorCode(value) {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string'
    ? value.error.code
    : null;
}

function optionalMetric(value) {
  if (value === undefined) return undefined;
  if (!isMetric(value)) throw new NonRetryableReconciliationError('La reconciliación Dux devolvió una métrica inválida.');
  return value;
}

function isMetric(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
