import { HttpError } from './http';
import type { AdminIdentity, D1Database } from './platform';

export type AdminOrderStatus =
  | 'preference_pending'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type AdminRange = Readonly<{
  from: string;
  to: string;
  limit: number;
  offset: number;
  status: AdminOrderStatus | null;
}>;

const MAX_RANGE_DAYS = 366;
const MAX_ROWS = 1_000;
const ADMIN_ORDER_STATUSES = new Set<AdminOrderStatus>([
  'preference_pending',
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'failed',
]);

export function parseAdminRange(request: Request): AdminRange {
  const url = new URL(request.url);
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const explicitFrom = parseDateOnly(url.searchParams.get('from'));
  const explicitTo = parseDateOnly(url.searchParams.get('to'));
  const fromDate = explicitFrom ?? startOfUtcDay(defaultFrom);
  const toDate = explicitTo === null ? endOfUtcDay(today) : endOfUtcDay(explicitTo);
  if (fromDate.getTime() > toDate.getTime()) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'El rango de fechas no es válido.');
  }
  if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'DATE_RANGE_TOO_LARGE', 'El rango supera el máximo permitido.');
  }
  return Object.freeze({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    limit: parseBoundedInteger(url.searchParams.get('limit'), 100, 1, MAX_ROWS),
    offset: parseBoundedInteger(url.searchParams.get('offset'), 0, 0, 100_000),
    status: parseOrderStatus(url.searchParams.get('status')),
  });
}

export async function getAdminSummary(database: D1Database, range: AdminRange): Promise<unknown> {
  const row = await database
    .prepare(
      `SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN total_minor ELSE 0 END), 0) AS approved_revenue_minor,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_count,
        COALESCE(AVG(CASE WHEN status = 'approved' THEN total_minor END), 0) AS average_ticket_minor
       FROM orders
       WHERE created_at BETWEEN ? AND ?`,
    )
    .bind(range.from, range.to)
    .first<Record<string, unknown>>();
  return row ?? {};
}

export async function listAdminOrders(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT id, status, currency, total_minor, item_count, created_at, updated_at, approved_at
       FROM orders
       WHERE created_at BETWEEN ? AND ?
         AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(range.from, range.to, range.status, range.status, range.limit, range.offset)
    .all<Record<string, unknown>>();
  return Object.freeze({ rows: result.results ?? [], limit: range.limit, offset: range.offset });
}

export async function getAdminOrder(database: D1Database, id: string): Promise<unknown> {
  if (!/^ord_[A-Za-z0-9_-]{20,128}$/u.test(id)) {
    throw new HttpError(400, 'INVALID_ORDER_ID', 'El identificador de pedido no es válido.');
  }
  const order = await database
    .prepare(
      `SELECT id, status, currency, total_minor, item_count, mp_preference_id,
              last_error_code, created_at, updated_at, approved_at
       FROM orders WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (order === null) return null;
  const items = await database
    .prepare(
      `SELECT product_id, name, presentation, sku, quantity, unit_price_minor, subtotal_minor
       FROM order_items WHERE order_id = ? ORDER BY name`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  const payments = await database
    .prepare(
      `SELECT provider_payment_id, mapped_status, provider_status, status_detail,
              amount_minor, currency, approved_at, provider_updated_at, updated_at
       FROM payments WHERE order_id = ? ORDER BY updated_at DESC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  return Object.freeze({ order, items: items.results ?? [], payments: payments.results ?? [] });
}

export async function getAnalyticsFunnel(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT event_name, COUNT(*) AS event_count, COUNT(DISTINCT session_hash) AS session_count
       FROM analytics_events
       WHERE created_at BETWEEN ? AND ?
         AND event_name IN ('page_view', 'product_view', 'cart_add', 'checkout_start', 'checkout_redirect')
       GROUP BY event_name
       ORDER BY CASE event_name
         WHEN 'page_view' THEN 1
         WHEN 'product_view' THEN 2
         WHEN 'cart_add' THEN 3
         WHEN 'checkout_start' THEN 4
         ELSE 5 END`,
    )
    .bind(range.from, range.to)
    .all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function getAnalyticsProducts(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT product_id,
              SUM(CASE WHEN event_name = 'product_view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_name = 'cart_add' THEN 1 ELSE 0 END) AS cart_adds
       FROM analytics_events
       WHERE created_at BETWEEN ? AND ? AND product_id IS NOT NULL
       GROUP BY product_id
       ORDER BY cart_adds DESC, views DESC
       LIMIT ?`,
    )
    .bind(range.from, range.to, range.limit)
    .all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function getAnalyticsSources(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT source, COUNT(*) AS event_count, COUNT(DISTINCT session_hash) AS session_count
       FROM analytics_events WHERE created_at BETWEEN ? AND ?
       GROUP BY source ORDER BY event_count DESC`,
    )
    .bind(range.from, range.to)
    .all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function getAnalyticsDevices(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT device_class, COUNT(*) AS event_count, COUNT(DISTINCT session_hash) AS session_count
       FROM analytics_events WHERE created_at BETWEEN ? AND ?
       GROUP BY device_class ORDER BY event_count DESC`,
    )
    .bind(range.from, range.to)
    .all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function listAudit(database: D1Database, range: AdminRange): Promise<unknown> {
  const result = await database
    .prepare(
      `SELECT id, actor_email, action, target_type, target_id, request_id,
              outcome_status, created_at
       FROM admin_audit
       WHERE created_at BETWEEN ? AND ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(range.from, range.to, range.limit, range.offset)
    .all<Record<string, unknown>>();
  return Object.freeze({ rows: result.results ?? [], limit: range.limit, offset: range.offset });
}

export async function recordAdminAudit(
  database: D1Database,
  identity: AdminIdentity,
  input: Readonly<{
    action: string;
    targetType?: string;
    targetId?: string;
    requestId: string;
    outcomeStatus: number;
  }>,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO admin_audit (
        id, actor_sub, actor_email, action, target_type, target_id,
        request_id, outcome_status, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
    )
    .bind(
      crypto.randomUUID(),
      identity.sub,
      identity.email,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.requestId,
      input.outcomeStatus,
      new Date().toISOString(),
    )
    .run();
}

export async function exportOrdersCsv(database: D1Database, range: AdminRange): Promise<string> {
  const result = await database
    .prepare(
      `SELECT id, status, currency, total_minor, item_count, created_at, updated_at, approved_at
       FROM orders WHERE created_at BETWEEN ? AND ?
         AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(range.from, range.to, range.status, range.status, range.limit)
    .all<Record<string, unknown>>();
  return toCsv(
    ['pedido', 'estado', 'moneda', 'total_minor', 'cantidad', 'creado', 'actualizado', 'aprobado'],
    (result.results ?? []).map((row) => [
      row.id,
      row.status,
      row.currency,
      row.total_minor,
      row.item_count,
      row.created_at,
      row.updated_at,
      row.approved_at,
    ]),
  );
}

export async function exportAnalyticsCsv(database: D1Database, range: AdminRange): Promise<string> {
  const result = await database
    .prepare(
      `SELECT event_name, path, product_id, source, device_class, created_at
       FROM analytics_events WHERE created_at BETWEEN ? AND ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(range.from, range.to, range.limit)
    .all<Record<string, unknown>>();
  return toCsv(
    ['evento', 'ruta', 'producto', 'fuente', 'dispositivo', 'fecha'],
    (result.results ?? []).map((row) => [
      row.event_name,
      row.path,
      row.product_id,
      row.source,
      row.device_class,
      row.created_at,
    ]),
  );
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  let text = csvText(value);
  if (/^[\s\t\r\n]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}


function parseOrderStatus(value: string | null): AdminOrderStatus | null {
  if (value === null || value === '') return null;
  if (!ADMIN_ORDER_STATUSES.has(value as AdminOrderStatus)) {
    throw new HttpError(400, 'INVALID_ORDER_STATUS', 'El estado de pedido no es válido.');
  }
  return value as AdminOrderStatus;
}

function parseDateOnly(value: string | null): Date | null {
  if (value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'La fecha debe usar AAAA-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'La fecha no es válida.');
  }
  return date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function parseBoundedInteger(
  raw: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/u.test(raw)) throw new HttpError(400, 'INVALID_PAGINATION', 'La paginación no es válida.');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(400, 'INVALID_PAGINATION', 'La paginación no es válida.');
  }
  return value;
}
