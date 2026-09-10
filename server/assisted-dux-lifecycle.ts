import { CHECKOUT_IDEMPOTENCY_WINDOW_MS } from '../src/commerce/contracts';
import { randomToken } from './crypto';
import { HttpError } from './http';
import { getOrderPaymentState } from './order-payment-state';
import type { D1Database } from './platform';
import { readSafeText } from './validation';

export type AssistedDuxLifecycleAction = 'release' | 'finalize';

export type AssistedDuxLifecycleInspection = Readonly<{
  orderId: string;
  action: AssistedDuxLifecycleAction;
  duxOrderNumber: string;
  completed: boolean;
  requiresPaymentReconciliation: boolean;
}>;

export type AssistedDuxLifecycleResult = AssistedDuxLifecycleInspection & Readonly<{
  changed: boolean;
  reservationStatus: 'released' | 'finalized';
  paymentStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
}>;

type LifecycleRow = Readonly<{
  id: string;
  mp_preference_id: string | null;
  mp_checkout_url: string | null;
  mp_preference_attempted_at: string | null;
  dux_order_number: string | null;
  verification_method: string | null;
  reservation_state: string | null;
  reserve_count: number;
  release_count: number;
  finalize_count: number;
}>;

export async function inspectAssistedDuxLifecycle(
  database: D1Database,
  orderId: string,
  action: AssistedDuxLifecycleAction,
  nowMilliseconds = Date.now(),
): Promise<AssistedDuxLifecycleInspection> {
  validateOrderId(orderId);
  if (action !== 'release' && action !== 'finalize') {
    throw new HttpError(400, 'INVALID_ASSISTED_DUX_ACTION', 'La acción Dux no es válida.');
  }
  const row = await readLifecycleRow(database, orderId);
  if (row === null) throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  if (row.verification_method !== 'assisted_admin' || row.dux_order_number === null || row.dux_order_number.trim() === '') {
    throw new HttpError(409, 'ASSISTED_DUX_ORDER_REQUIRED', 'El pedido no pertenece al circuito Dux asistido.');
  }
  if (row.reserve_count !== 1) {
    throw new HttpError(409, 'ASSISTED_DUX_RESERVATION_EVIDENCE_REQUIRED', 'La reserva Dux no tiene evidencia única y confirmada.');
  }
  const target = action === 'release' ? 'released' : 'finalized';
  const ownCount = action === 'release' ? row.release_count : row.finalize_count;
  const oppositeCount = action === 'release' ? row.finalize_count : row.release_count;
  if (row.reservation_state === target) {
    if (ownCount !== 1 || oppositeCount !== 0) throw lifecycleReview();
    return Object.freeze({ orderId, action, duxOrderNumber: row.dux_order_number, completed: true, requiresPaymentReconciliation: false });
  }
  if (row.reservation_state !== 'confirmed' || ownCount !== 0 || oppositeCount !== 0) throw lifecycleReview();

  const attemptedAt = readAttemptedAt(row.mp_preference_attempted_at);
  if (action === 'release' && attemptedAt !== null) {
    if (!Number.isFinite(nowMilliseconds) || nowMilliseconds < attemptedAt) throw lifecycleReview();
    if (nowMilliseconds - attemptedAt < CHECKOUT_IDEMPOTENCY_WINDOW_MS) {
      throw new HttpError(
        409,
        'ASSISTED_RELEASE_PAYMENT_WINDOW_ACTIVE',
        'La ventana de pago todavía está activa. Esperá su vencimiento y conciliá Mercado Pago antes de liberar en Dux.',
      );
    }
  }
  if (action === 'finalize' && (
    attemptedAt === null || row.mp_preference_id === null || row.mp_checkout_url === null
  )) {
    throw new HttpError(409, 'ASSISTED_FINALIZE_PAYMENT_REQUIRED', 'No existe una preferencia de pago verificable para finalizar el pedido.');
  }
  return Object.freeze({
    orderId,
    action,
    duxOrderNumber: row.dux_order_number,
    completed: false,
    requiresPaymentReconciliation: attemptedAt !== null,
  });
}

export async function confirmAssistedDuxLifecycle(
  database: D1Database,
  orderId: string,
  action: AssistedDuxLifecycleAction,
  actor: string,
  paymentReconciledAt: Date | null,
  now = new Date(),
): Promise<AssistedDuxLifecycleResult> {
  const inspection = await inspectAssistedDuxLifecycle(database, orderId, action, now.getTime());
  const target = action === 'release' ? 'released' : 'finalized';
  if (inspection.completed) {
    const payment = await getOrderPaymentState(database, orderId);
    return Object.freeze({ ...inspection, changed: false, reservationStatus: target, paymentStatus: payment.status });
  }

  const payment = await getOrderPaymentState(database, orderId);
  if (payment.requiresReview) {
    throw new HttpError(409, 'ASSISTED_DUX_PAYMENT_REVIEW_REQUIRED', 'El estado financiero requiere revisión antes de confirmar la operación Dux.');
  }
  if (action === 'release' && (payment.status === 'approved' || payment.status === 'pending')) {
    throw new HttpError(409, 'ASSISTED_RELEASE_PAYMENT_BLOCKED', 'No se puede liberar la reserva con un pago aprobado o pendiente.');
  }
  if (action === 'finalize' && payment.status !== 'approved') {
    throw new HttpError(409, 'ASSISTED_FINALIZE_PAYMENT_REQUIRED', 'El pedido sólo puede finalizarse con un pago aprobado y verificado.');
  }

  const reconciledAt = inspection.requiresPaymentReconciliation
    ? validateRecentReconciliation(paymentReconciledAt, now)
    : null;
  const safeActor = readSafeText(actor, 'actor', 512);
  const timestamp = now.toISOString();
  const operationId = `duxop_${randomToken(18)}`;
  const requestJson = JSON.stringify({
    method: 'assisted_admin',
    orderId,
    action,
    ...(reconciledAt === null ? {} : { paymentReconciledAt: reconciledAt.toISOString() }),
  });
  const responseJson = JSON.stringify({
    verification: 'manual',
    confirmedInDux: true,
    verifiedBy: safeActor,
  });
  const operationKey = `assisted-${action}:${orderId}`;
  const lifecycleColumn = action === 'release' ? 'released_at' : 'finalized_at';
  try {
    await database.batch([
      database.prepare(`INSERT INTO dux_order_operations (
        id, idempotency_key, order_id, action, status, request_json, response_json,
        provider_operation_id, error_code, attempted_at, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, NULL, ?, ?, ?, ?)`)
        .bind(operationId, operationKey, orderId, action, requestJson, responseJson,
          inspection.duxOrderNumber, timestamp, timestamp, timestamp, timestamp),
      database.prepare(`UPDATE dux_order_links SET reservation_state = ?, ${lifecycleColumn} = ?,
        last_error_code = NULL, updated_at = ?
        WHERE order_id = ? AND verification_method = 'assisted_admin' AND reservation_state = 'confirmed'`)
        .bind(target, timestamp, timestamp, orderId),
    ]);
  } catch (error: unknown) {
    const raced = await inspectAssistedDuxLifecycle(database, orderId, action, now.getTime()).catch(() => null);
    if (raced?.completed === true) {
      const currentPayment = await getOrderPaymentState(database, orderId);
      return Object.freeze({ ...raced, changed: false, reservationStatus: target, paymentStatus: currentPayment.status });
    }
    throw lifecycleStorageError(error);
  }
  const persisted = await inspectAssistedDuxLifecycle(database, orderId, action, now.getTime());
  if (!persisted.completed) throw lifecycleReview();
  return Object.freeze({ ...persisted, changed: true, reservationStatus: target, paymentStatus: payment.status });
}

async function readLifecycleRow(database: D1Database, orderId: string): Promise<LifecycleRow | null> {
  try {
    return await database.prepare(`SELECT o.id, o.mp_preference_id, o.mp_checkout_url, o.mp_preference_attempted_at,
      link.dux_order_number, link.verification_method, link.reservation_state,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'reserve'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-reserve:' || o.id) AS reserve_count,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'release'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-release:' || o.id) AS release_count,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'finalize'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-finalize:' || o.id) AS finalize_count
      FROM orders o INNER JOIN dux_order_links link ON link.order_id = o.id
      WHERE o.id = ? LIMIT 1`).bind(orderId).first<LifecycleRow>();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (/no such (?:table|column):/iu.test(message)) {
      throw new HttpError(503, 'ASSISTED_CHECKOUT_MIGRATION_REQUIRED', 'Faltan migraciones del checkout asistido.');
    }
    throw new HttpError(503, 'ASSISTED_DUX_LIFECYCLE_UNAVAILABLE', 'No se pudo verificar el estado Dux asistido.', false);
  }
}

function validateRecentReconciliation(value: Date | null, now: Date): Date {
  if (value === null || !Number.isFinite(value.getTime()) || !Number.isFinite(now.getTime())) {
    throw new HttpError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Conciliá Mercado Pago antes de confirmar la operación Dux.');
  }
  const age = now.getTime() - value.getTime();
  if (age < 0 || age > 120_000) {
    throw new HttpError(409, 'PAYMENT_RECONCILIATION_STALE', 'La conciliación de Mercado Pago debe ser inmediata a la confirmación Dux.');
  }
  return value;
}

function readAttemptedAt(value: string | null): number | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw lifecycleReview();
  return timestamp;
}
function validateOrderId(value: string): void {
  if (!/^ord_[A-Za-z0-9_-]{20,128}$/u.test(value)) {
    throw new HttpError(400, 'INVALID_ORDER_ID', 'El identificador de pedido no es válido.');
  }
}
function lifecycleReview(): HttpError {
  return new HttpError(409, 'ASSISTED_DUX_LIFECYCLE_REVIEW_REQUIRED', 'El estado Dux asistido requiere revisión antes de continuar.');
}
function lifecycleStorageError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('DUX_ASSISTED_RELEASE_FINANCIAL_GUARD')) {
    return new HttpError(409, 'ASSISTED_RELEASE_PAYMENT_BLOCKED', 'El estado financiero cambió y ya no permite liberar la reserva.');
  }
  if (message.includes('DUX_ASSISTED_FINALIZE_FINANCIAL_GUARD')) {
    return new HttpError(409, 'ASSISTED_FINALIZE_PAYMENT_REQUIRED', 'El estado financiero cambió y ya no permite finalizar el pedido.');
  }
  if (message.includes('UNIQUE constraint failed') || message.includes('DUX_ASSISTED_')) return lifecycleReview();
  return new HttpError(503, 'ASSISTED_DUX_LIFECYCLE_UNAVAILABLE', 'No se pudo confirmar la operación Dux asistida.', false);
}
