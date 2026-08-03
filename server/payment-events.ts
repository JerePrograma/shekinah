import { randomToken } from './crypto';
import { HttpError } from './http';
import type { D1Database } from './platform';

export type PaymentEventClaim = Readonly<{
  claimed: boolean;
  owner: string | null;
}>;

const LEASE_DURATION_MS = 5 * 60 * 1000;

export async function registerPaymentEvent({
  action,
  database,
  eventKey,
  eventType,
  requestId,
  resourceId,
  signatureTimestamp,
}: Readonly<{
  action: string | null;
  database: D1Database;
  eventKey: string;
  eventType: string;
  requestId: string | null;
  resourceId: string;
  signatureTimestamp: string;
}>): Promise<PaymentEventClaim> {
  const owner = randomToken(18);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseCutoff = new Date(now.getTime() - LEASE_DURATION_MS).toISOString();
  await database
    .prepare(
      `INSERT INTO payment_events (
        provider, provider_event_key, request_id, event_type, action,
        resource_id, signature_ts, status, processing_owner,
        processing_started_at, attempt_count, received_at
      ) VALUES ('mercadopago', ?, ?, ?, ?, ?, ?, 'processing', ?, ?, 1, ?)
      ON CONFLICT(provider_event_key) DO UPDATE SET
        status = 'processing',
        processing_owner = excluded.processing_owner,
        processing_started_at = excluded.processing_started_at,
        attempt_count = payment_events.attempt_count + 1,
        request_id = COALESCE(excluded.request_id, payment_events.request_id),
        error_code = NULL,
        response_code = NULL
      WHERE payment_events.status = 'failed'
         OR (
           payment_events.status = 'processing'
           AND payment_events.processing_started_at < ?
         )`,
    )
    .bind(
      eventKey,
      requestId,
      eventType,
      action,
      resourceId,
      signatureTimestamp,
      owner,
      nowIso,
      nowIso,
      leaseCutoff,
    )
    .run();
  const row = await database
    .prepare(
      `SELECT status, processing_owner
       FROM payment_events
       WHERE provider_event_key = ?
       LIMIT 1`,
    )
    .bind(eventKey)
    .first<Readonly<{ status: string; processing_owner: string | null }>>();
  return Object.freeze({
    claimed: row?.status === 'processing' && row.processing_owner === owner,
    owner: row?.status === 'processing' && row.processing_owner === owner ? owner : null,
  });
}

export async function finishPaymentEvent(
  database: D1Database,
  eventKey: string,
  owner: string,
  result: Readonly<{
    status: 'processed' | 'ignored' | 'failed';
    responseCode: number;
    errorCode?: string;
  }>,
): Promise<void> {
  const response = await database
    .prepare(
      `UPDATE payment_events
       SET status = ?, response_code = ?, error_code = ?,
           processed_at = ?, processing_owner = NULL
       WHERE provider_event_key = ?
         AND status = 'processing'
         AND processing_owner = ?`,
    )
    .bind(
      result.status,
      result.responseCode,
      result.errorCode ?? null,
      new Date().toISOString(),
      eventKey,
      owner,
    )
    .run();
  if ((response.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, 'WEBHOOK_LEASE_LOST', 'El procesamiento del webhook perdió su exclusión.');
  }
}
