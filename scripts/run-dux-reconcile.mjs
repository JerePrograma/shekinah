const expectedPath = '/api/internal/dux/reconcile';
const requestTimeoutMs = 8 * 60 * 1_000;
const maximumRetryDelayMs = 30_000;

class NonRetryableReconciliationError extends Error {}

const target = parseTarget(process.env.SHEKINAH_RECONCILE_URL);
const secret = requireSecret(process.env.SHEKINAH_RECONCILE_SECRET);

const result = await reconcileWithRetry(target, secret);
if (result.status === 'disabled') {
  console.log('Reconciliación omitida: la integración de Dux está deshabilitada.');
} else if (result.status === 'in_progress') {
  console.log('Reconciliación omitida: ya existe un ciclo protegido por el lock D1.');
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
}

async function reconcileWithRetry(url, schedulerSecret) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${schedulerSecret}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const payload = await readResponse(response);
      if (
        (response.status === 409 && errorCode(payload) === 'DUX_SYNC_IN_PROGRESS') ||
        (response.status === 429 && errorCode(payload) === 'DUX_SYNC_COOLDOWN')
      ) {
        return { status: 'in_progress' };
      }
      if (!response.ok) {
        const code = errorCode(payload) ?? `HTTP_${response.status}`;
        const message = `La reconciliación Dux respondió ${response.status} (${code}).`;
        if (response.status < 500 && response.status !== 429) {
          throw new NonRetryableReconciliationError(message);
        }
        const error = new Error(message);
        if (attempt === 2) throw error;
        lastError = error;
        await delay(retryDelayMs(response));
        continue;
      }
      return parseResult(payload);
    } catch (error) {
      if (error instanceof NonRetryableReconciliationError) throw error;
      lastError = error;
      if (attempt === 2) break;
      await delay(2_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('La reconciliación Dux no pudo completarse.');
}

async function readResponse(response) {
  const text = await response.text();
  if (text.length > 32_768) {
    throw new Error('La respuesta de reconciliación Dux excede el límite permitido.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`La reconciliación Dux respondió ${response.status} con un cuerpo inválido.`);
  }
}

function parseResult(value) {
  if (!isRecord(value)) throw new Error('La reconciliación Dux devolvió un resultado inválido.');
  if (value.status === 'disabled') return { status: 'disabled' };
  if (
    value.status !== 'completed' || !isRecord(value.summary) ||
    !['succeeded', 'partial', 'failed'].includes(value.summary.status) ||
    !isMetric(value.summary.processed) || !isMetric(value.summary.failed)
  ) {
    throw new Error('La reconciliación Dux devolvió un resultado inválido.');
  }
  return {
    status: 'completed',
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
  if (!isMetric(value)) throw new Error('La reconciliación Dux devolvió una métrica inválida.');
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
