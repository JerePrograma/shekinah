import { validateFulfillment } from './fulfillment';
import type { CheckoutFulfillment } from './fulfillment';

export type WebRequestStatus = 'submitted' | 'accepted' | 'rejected';
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
  paymentStatus: 'not_requested'; reservationStatus: 'not_reserved'; totalMinor: null;
}>;
export type WebRequestReceipt = WebRequestPublic & Readonly<{ publicToken: string }>;

export function webRequestReference(id: string): string {
  return `WEB-${id.slice(4)}`;
}

export function webRequestStatusLabel(status: WebRequestStatus): string {
  return { submitted: 'Recibida para revisión', accepted: 'Aceptada para gestión', rejected: 'Rechazada' }[status];
}

export function parseWebRequestReceipt(value: unknown): WebRequestReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.reference !== 'string' || !/^WEB-[A-Za-z0-9_-]{20,128}$/u.test(row.reference) ||
      (row.status !== 'submitted' && row.status !== 'accepted' && row.status !== 'rejected') ||
      typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
      typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)) ||
      row.paymentStatus !== 'not_requested' || row.reservationStatus !== 'not_reserved' || row.totalMinor !== null ||
      typeof row.publicToken !== 'string' || !/^[a-f0-9]{64}$/u.test(row.publicToken)) throw invalid();
  return Object.freeze({ reference: row.reference, status: row.status, createdAt: row.createdAt,
    updatedAt: row.updatedAt, paymentStatus: 'not_requested', reservationStatus: 'not_reserved',
    totalMinor: null, publicToken: row.publicToken });
}

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
