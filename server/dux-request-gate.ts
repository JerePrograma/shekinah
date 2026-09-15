import { HttpError } from './http';
import type { D1Database } from './platform';

// Ventanas de inicio de un segundo, separadas por al menos cinco segundos.
const REQUEST_INTERVAL_MS = 6000;
const START_WINDOW_MS = 1000;
const MAX_QUEUE_MS = 18000;
export const DUX_COORDINATED_SYNC_MAX_ATTEMPTS = 24;

/** Comparte el límite de Dux entre checkout y sincronización del mismo tenant. */
export function createDuxRequestGate(database: D1Database, options: Readonly<{
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}> = {}): () => Promise<void> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  return async () => {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw unavailable();
    let claimed: Readonly<{ next_request_at_ms: number }> | null;
    try {
      // Una consulta también con concurrencia: reserva el turno sin sondear D1.
      claimed = await database.prepare(`UPDATE dux_api_request_gate
        SET next_request_at_ms = MAX(next_request_at_ms, ?1) + ?2
        WHERE id = 1 AND next_request_at_ms <= ?1 + ?3
        RETURNING next_request_at_ms`).bind(timestamp, REQUEST_INTERVAL_MS, MAX_QUEUE_MS)
        .first<Readonly<{ next_request_at_ms: number }>>();
    } catch { throw unavailable(); }
    if (claimed === null || !Number.isSafeInteger(claimed.next_request_at_ms)) throw unavailable();
    const startsAt = claimed.next_request_at_ms - REQUEST_INTERVAL_MS;
    const delay = startsAt - now();
    if (delay > 0) await sleep(delay);
    const startedAt = now();
    if (!Number.isSafeInteger(startedAt) || startedAt < startsAt || startedAt > startsAt + START_WINDOW_MS) {
      throw new HttpError(503, 'DUX_REQUEST_SLOT_BUSY', 'Dux está procesando otra operación. Tu compra se conserva.');
    }
  };
}

function unavailable(): HttpError {
  return new HttpError(503, 'DUX_REQUEST_GATE_UNAVAILABLE', 'No se pudo coordinar la consulta a Dux.');
}
