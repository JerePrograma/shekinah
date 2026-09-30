import { validateFulfillment } from './fulfillment';
import type { CheckoutFulfillment } from './fulfillment';

export type WebRequestStatus = 'submitted' | 'accepted' | 'rejected';
export type WebRequestPaymentStatus = 'not_requested' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
export type WebRequestReservationStatus = 'not_reserved' | 'confirmed' | 'released' | 'finalized' | 'requires_review';
export type WebRequestIdentity = Readonly<{ idempotencyKey: string; ownerSecret: string }>;
export type WebRequestLine = Readonly<{ productId: string; quantity: number; catalogVersion: string }>;
export type WebRequestInput = WebRequestIdentity & Readonly<{
  items: readonly WebRequestLine[]; fulfillment: CheckoutFulfillment;
}>;
export type WebRequestSnapshot = Readonly<{
  schemaVersion: 1;
  catalogVersion: string;
  observedAt: string;
  lines: readonly Readonly<{
    productId: string; duxCode: string; name: string; requestedQuantity: number;
    observedUnitPriceMinor: number | null;
  }>[];
  fulfillment: CheckoutFulfillment;
  totalMinor: null;
  shippingMinor: number | null;
  quantityStatus: 'requires_confirmation';
}>;
export type WebRequestPublic = Readonly<{
  reference: string; status: WebRequestStatus; createdAt: string; updatedAt: string;
  paymentStatus: WebRequestPaymentStatus; paymentRequiresReview: boolean;
  reservationStatus: WebRequestReservationStatus; checkoutAvailable: boolean;
  totalMinor: number | null;
  preparationStatus?: 'preparing' | 'uncertain' | 'prepared' | 'failed' | 'requires_review';
}>;
export type WebRequestReceipt = WebRequestPublic & Readonly<{ publicToken: string }>;

export type DirectReservationReview = Readonly<{
  code: string; quantity: number; duxOrderId: number; duxOrderNumber: number;
  before: Readonly<{ realStock: number; reservedStock: number; availableStock: number }>;
  after: Readonly<{ realStock: number; reservedStock: number; availableStock: number }>;
  beforeObservedAt: string; afterObservedAt: string;
}>;

/** Evidencia de diagnóstico administrativo; nunca acredita una reserva. */
export function parseDirectReservationReview(value: unknown): DirectReservationReview {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  const positiveInteger = (entry: unknown): entry is number => typeof entry === 'number' && Number.isSafeInteger(entry) && entry > 0;
  if (typeof row.code !== 'string' || !row.code.trim() || row.code.length > 300 ||
      [...row.code].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      !positiveInteger(row.quantity) || row.quantity > 99 || !positiveInteger(row.duxOrderId) || !positiveInteger(row.duxOrderNumber) ||
      typeof row.beforeObservedAt !== 'string' || !Number.isFinite(Date.parse(row.beforeObservedAt)) ||
      typeof row.afterObservedAt !== 'string' || !Number.isFinite(Date.parse(row.afterObservedAt))) throw invalid();
  const stock = (entry: unknown): DirectReservationReview['before'] => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw invalid();
    const fields = entry as Record<string, unknown>;
    const finite = (field: unknown): field is number => typeof field === 'number' && Number.isFinite(field);
    if (!finite(fields.realStock) || !finite(fields.reservedStock) || fields.reservedStock < 0 || !finite(fields.availableStock)) throw invalid();
    return Object.freeze({ realStock: fields.realStock, reservedStock: fields.reservedStock, availableStock: fields.availableStock });
  };
  return Object.freeze({ code: row.code, quantity: row.quantity, duxOrderId: row.duxOrderId, duxOrderNumber: row.duxOrderNumber,
    before: stock(row.before), after: stock(row.after), beforeObservedAt: row.beforeObservedAt, afterObservedAt: row.afterObservedAt });
}

export function webRequestReference(id: string): string {
  return `WEB-${id.slice(4)}`;
}

export function webRequestStatusLabel(status: WebRequestStatus): string {
  return { submitted: 'Recibida para revisión', accepted: 'Aceptada para gestión', rejected: 'Rechazada' }[status];
}

export function parseWebRequestReceipt(value: unknown): WebRequestReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  const paymentStatus = readPaymentStatus(row.paymentStatus);
  const reservationStatus = readReservationStatus(row.reservationStatus);
  const preparationStatus = row.preparationStatus;
  if (preparationStatus !== undefined && preparationStatus !== 'preparing' && preparationStatus !== 'uncertain' &&
      preparationStatus !== 'prepared' && preparationStatus !== 'failed' && preparationStatus !== 'requires_review') throw invalid();
  const totalMinor = row.totalMinor === null
    ? null
    : typeof row.totalMinor === 'number' && Number.isSafeInteger(row.totalMinor) && row.totalMinor > 0
      ? row.totalMinor
      : invalidValue();
  if (typeof row.reference !== 'string' || !/^WEB-[A-Za-z0-9_-]{20,128}$/u.test(row.reference) ||
      (row.status !== 'submitted' && row.status !== 'accepted' && row.status !== 'rejected') ||
      typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
      typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)) ||
      typeof row.paymentRequiresReview !== 'boolean' || typeof row.checkoutAvailable !== 'boolean' ||
      typeof row.publicToken !== 'string' || !/^[a-f0-9]{64}$/u.test(row.publicToken)) throw invalid();
  if (
    (paymentStatus !== 'not_requested' && totalMinor === null) ||
    (reservationStatus !== 'not_reserved' && totalMinor === null) ||
    (row.checkoutAvailable && (
      reservationStatus !== 'confirmed' || totalMinor === null ||
      paymentStatus === 'pending' || paymentStatus === 'approved' || paymentStatus === 'refunded'
    ))
  ) throw invalid();
  return Object.freeze({
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    paymentStatus,
    paymentRequiresReview: row.paymentRequiresReview,
    reservationStatus,
    checkoutAvailable: row.checkoutAvailable,
    totalMinor,
    publicToken: row.publicToken,
    ...(preparationStatus === undefined ? {} : { preparationStatus }),
  });
}

function readPaymentStatus(value: unknown): WebRequestPaymentStatus {
  if (value === 'not_requested' || value === 'pending' || value === 'approved' || value === 'rejected' || value === 'cancelled' || value === 'refunded') return value;
  throw invalid();
}
function readReservationStatus(value: unknown): WebRequestReservationStatus {
  if (value === 'not_reserved' || value === 'confirmed' || value === 'released' || value === 'finalized' || value === 'requires_review') return value;
  throw invalid();
}
function invalidValue(): never { throw invalid(); }
function invalid(): Error { return new Error('El servidor devolvió una solicitud web inválida.'); }

export type AdminWebRequestDetail = Readonly<{
  id: string; status: WebRequestStatus; snapshot: WebRequestSnapshot;
}>;

export function parseAdminWebRequestDetail(value: unknown): AdminWebRequestDetail {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !/^req_[A-Za-z0-9_-]{20,128}$/u.test(row.id) ||
      (row.status !== 'submitted' && row.status !== 'accepted' && row.status !== 'rejected') ||
      typeof row.snapshot !== 'object' || row.snapshot === null || Array.isArray(row.snapshot)) throw invalid();
  const snapshot = row.snapshot as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1 || snapshot.totalMinor !== null || snapshot.quantityStatus !== 'requires_confirmation' ||
      typeof snapshot.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(snapshot.catalogVersion) ||
      typeof snapshot.observedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.observedAt)) ||
      !Array.isArray(snapshot.lines) || snapshot.lines.length < 1 || snapshot.lines.length > 50 ||
      (snapshot.shippingMinor !== null && snapshot.shippingMinor !== 0)) throw invalid();
  const fulfillment = validateFulfillment(snapshot.fulfillment);
  if (fulfillment.value === null || snapshot.shippingMinor !== (fulfillment.value.method === 'coordinated_pickup' ? 0 : null)) throw invalid();
  const lines = snapshot.lines.map((value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
    const line = value as Record<string, unknown>;
    if (typeof line.productId !== 'string' || !/^[a-z0-9-]{1,180}$/u.test(line.productId) ||
        typeof line.duxCode !== 'string' || line.duxCode.length < 1 || line.duxCode.length > 300 ||
        typeof line.name !== 'string' || line.name.length < 1 || line.name.length > 500 ||
        typeof line.requestedQuantity !== 'number' || !Number.isSafeInteger(line.requestedQuantity) || line.requestedQuantity < 1 || line.requestedQuantity > 99 ||
        (line.observedUnitPriceMinor !== null && (typeof line.observedUnitPriceMinor !== 'number' || !Number.isSafeInteger(line.observedUnitPriceMinor) || line.observedUnitPriceMinor <= 0))) throw invalid();
    return Object.freeze({ productId: line.productId, duxCode: line.duxCode, name: line.name,
      requestedQuantity: line.requestedQuantity, observedUnitPriceMinor: line.observedUnitPriceMinor });
  });
  return Object.freeze({ id: row.id, status: row.status, snapshot: Object.freeze({
    schemaVersion: 1, catalogVersion: snapshot.catalogVersion, observedAt: snapshot.observedAt,
    lines: Object.freeze(lines), fulfillment: fulfillment.value, totalMinor: null,
    shippingMinor: snapshot.shippingMinor, quantityStatus: 'requires_confirmation',
  }) });
}
