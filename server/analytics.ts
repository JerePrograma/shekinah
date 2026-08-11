import {
  ANALYTICS_CONSENT_VERSION,
  ANALYTICS_EVENT_NAMES,
} from '../src/commerce/contracts';
import type {
  AnalyticsDeviceClass,
  AnalyticsEventName,
  AnalyticsSource,
} from '../src/commerce/contracts';
import { hmacSha256Hex } from './crypto';
import { HttpError } from './http';
import type { D1Database } from './platform';
import {
  assertExactKeys,
  assertUuid,
  isRecord,
  readOptionalSafeText,
  readSafeText,
} from './validation';

const allowedEvents = new Set<string>(ANALYTICS_EVENT_NAMES);
const allowedSources = new Set<string>(['direct', 'referral', 'campaign', 'unknown']);
const allowedDevices = new Set<string>(['mobile', 'tablet', 'desktop', 'unknown']);

export type AnalyticsEventInput = Readonly<{
  eventId: string;
  eventName: AnalyticsEventName;
  sessionId: string;
  consentVersion: typeof ANALYTICS_CONSENT_VERSION;
  path: string;
  productId: string | null;
  source: AnalyticsSource;
  deviceClass: AnalyticsDeviceClass;
}>;

export function parseAnalyticsEvent(value: unknown): AnalyticsEventInput {
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'El evento no es válido.');
  }
  assertExactKeys(
    value,
    ['eventId', 'eventName', 'sessionId', 'consentVersion', 'path', 'productId', 'source', 'deviceClass'],
    'INVALID_ANALYTICS_EVENT',
    'El evento contiene campos no permitidos.',
  );
  const eventId = assertUuid(value.eventId, 'eventId');
  const sessionId = assertUuid(value.sessionId, 'sessionId');
  const eventName = readSafeText(value.eventName, 'eventName', 40);
  const consentVersion = readSafeText(value.consentVersion, 'consentVersion', 16);
  const path = readSafeText(value.path, 'path', 300);
  const source = readSafeText(value.source, 'source', 20);
  const deviceClass = readSafeText(value.deviceClass, 'deviceClass', 20);
  const productId = readOptionalSafeText(value.productId, 'productId', 180);

  if (consentVersion !== ANALYTICS_CONSENT_VERSION) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'La versión de consentimiento no está permitida.');
  }
  if (!allowedEvents.has(eventName)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'El tipo de evento no está permitido.');
  }
  if (!allowedSources.has(source) || !allowedDevices.has(deviceClass)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'La clasificación del evento no es válida.');
  }
  if (!/^\/(?:[^\s?#]*)?$/u.test(path)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'La ruta del evento no es válida.');
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'La ruta administrativa no admite analítica.');
  }
  if (productId !== null && !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(productId)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'El producto del evento no es válido.');
  }
  if (eventName === 'manual_payment_click' && (path !== '/carrito' || productId !== null)) {
    throw new HttpError(400, 'INVALID_ANALYTICS_EVENT', 'El evento manual no es válido.');
  }
  return Object.freeze({
    eventId,
    eventName: eventName as AnalyticsEventName,
    sessionId,
    consentVersion: ANALYTICS_CONSENT_VERSION,
    path,
    productId,
    source: source as AnalyticsSource,
    deviceClass: deviceClass as AnalyticsDeviceClass,
  });
}

export async function storeAnalyticsEvent(
  database: D1Database,
  secret: string,
  event: AnalyticsEventInput,
): Promise<'stored' | 'revoked'> {
  const sessionHash = await hmacSha256Hex(secret, `analytics-session:${event.sessionId}`);
  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO analytics_sessions (
          session_hash, consent_version, created_at, updated_at
        )
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM analytics_revocations WHERE session_hash = ?
        )
        ON CONFLICT(session_hash) DO UPDATE SET
          consent_version = excluded.consent_version,
          updated_at = excluded.updated_at`,
      )
      .bind(sessionHash, event.consentVersion, now, now, sessionHash),
    database
      .prepare(
        `INSERT OR IGNORE INTO analytics_events (
          id, session_hash, event_name, path, product_id,
          source, device_class, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM analytics_sessions WHERE session_hash = ?
        )
          AND NOT EXISTS (
            SELECT 1 FROM analytics_revocations WHERE session_hash = ?
          )`,
      )
      .bind(
        event.eventId,
        sessionHash,
        event.eventName,
        event.path,
        event.productId,
        event.source,
        event.deviceClass,
        now,
        sessionHash,
        sessionHash,
      ),
  ]);
  const sessionChanges = results[0]?.meta.changes ?? 0;
  if (sessionChanges === 0) {
    const revoked = await database
      .prepare('SELECT 1 AS revoked FROM analytics_revocations WHERE session_hash = ? LIMIT 1')
      .bind(sessionHash)
      .first<Readonly<{ revoked: number }>>();
    if (revoked !== null) return 'revoked';
  }
  return 'stored';
}

export async function deleteAnalyticsSession(
  database: D1Database,
  secret: string,
  sessionIdValue: unknown,
): Promise<void> {
  const sessionId = assertUuid(sessionIdValue, 'sessionId');
  const sessionHash = await hmacSha256Hex(secret, `analytics-session:${sessionId}`);
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO analytics_revocations (session_hash, revoked_at)
         VALUES (?, ?)
         ON CONFLICT(session_hash) DO UPDATE SET revoked_at = excluded.revoked_at`,
      )
      .bind(sessionHash, now),
    database.prepare('DELETE FROM analytics_sessions WHERE session_hash = ?').bind(sessionHash),
  ]);
}
