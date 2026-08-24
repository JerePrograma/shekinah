const expectedPath = '/api/internal/mercadolibre/reconcile';
const target = parseTarget(process.env.SHEKINAH_RECONCILE_URL);
const secret = requireSecret(process.env.SHEKINAH_RECONCILE_SECRET);

const result = await reconcileWithRetry(target, secret);
if (result.status === 'disabled') {
  console.log('Reconciliación omitida: el catálogo de Mercado Libre está deshabilitado.');
} else if (result.status === 'in_progress') {
  console.log('Reconciliación omitida: ya existe un ciclo protegido por el lock D1.');
} else {
  console.log(
    `Reconciliación completada: estado=${result.summary.status} ` +
    `procesadas=${result.summary.processed} fallidas=${result.summary.failed} ` +
    `reservas_liberadas=${result.reservations.released} ` +
    `reservas_fallidas=${result.reservations.failed}.`,
  );
  if (
    result.summary.status !== 'succeeded' ||
    result.summary.failed > 0 ||
    result.reservations.failed > 0
  ) throw new Error('La reconciliación requiere atención operativa.');
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
        signal: AbortSignal.timeout(8 * 60 * 1_000),
      });
      const payload = await readResponse(response);
      if (response.status === 409 && errorCode(payload) === 'MERCADO_LIBRE_SYNC_IN_PROGRESS') {
        return { status: 'in_progress' };
      }
      if (!response.ok) {
        const code = errorCode(payload) ?? `HTTP_${response.status}`;
        const message = `La reconciliación respondió ${response.status} (${code}).`;
        if (response.status < 500) throw new NonRetryableReconciliationError(message);
        const error = new Error(message);
        if (attempt === 2) throw error;
        lastError = error;
      } else {
        return parseResult(payload);
      }
    } catch (error) {
      if (error instanceof NonRetryableReconciliationError) throw error;
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw lastError instanceof Error ? lastError : new Error('La reconciliación no pudo completarse.');
}

async function readResponse(response) {
  const text = await response.text();
  if (text.length > 32_768) throw new Error('La respuesta de reconciliación excede el límite permitido.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`La reconciliación respondió ${response.status} con un cuerpo inválido.`);
  }
}

function parseResult(value) {
  if (!isRecord(value)) throw new Error('La reconciliación devolvió un resultado inválido.');
  if (value.status === 'disabled') return { status: 'disabled' };
  if (
    value.status !== 'completed' || !isRecord(value.summary) || !isRecord(value.reservations) ||
    !['succeeded', 'partial', 'failed'].includes(value.summary.status) ||
    !isMetric(value.summary.processed) || !isMetric(value.summary.failed) ||
    !isMetric(value.reservations.released) || !isMetric(value.reservations.failed)
  ) {
    throw new Error('La reconciliación devolvió un resultado inválido.');
  }
  return {
    status: 'completed',
    summary: {
      status: value.summary.status,
      processed: value.summary.processed,
      failed: value.summary.failed,
    },
    reservations: {
      released: value.reservations.released,
      failed: value.reservations.failed,
    },
  };
}

function parseTarget(value) {
  if (typeof value !== 'string') throw new Error('Falta SHEKINAH_RECONCILE_URL.');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' || url.username !== '' || url.password !== '' ||
    url.pathname !== expectedPath || url.search !== '' || url.hash !== ''
  ) throw new Error('SHEKINAH_RECONCILE_URL no es un endpoint HTTPS válido.');
  return url;
}

function requireSecret(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 4_096) {
    throw new Error('Falta SHEKINAH_RECONCILE_SECRET.');
  }
  return value;
}

function errorCode(value) {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string'
    ? value.error.code
    : null;
}

function isMetric(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class NonRetryableReconciliationError extends Error {}
