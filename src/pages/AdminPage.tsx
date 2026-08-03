import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { formatProductPrice } from '../catalog/catalog';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type UnknownRow = Readonly<Record<string, unknown>>;
type OrderStatusFilter =
  | ''
  | 'preference_pending'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'failed';
type AdminFilter = Readonly<{ from: string; to: string; status: OrderStatusFilter }>;
type AdminSummary = Readonly<{
  orderCount: number;
  approvedRevenueMinor: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  cancelledCount: number;
  refundedCount: number;
  averageTicketMinor: number;
}>;
type AdminOrder = Readonly<{
  id: string;
  status: string;
  totalMinor: number;
  itemCount: number;
  createdAt: string;
}>;
type AdminData = Readonly<{
  summary: AdminSummary;
  orders: readonly AdminOrder[];
  funnel: readonly UnknownRow[];
  products: readonly UnknownRow[];
  sources: readonly UnknownRow[];
  devices: readonly UnknownRow[];
  audit: readonly UnknownRow[];
}>;

const EMPTY_SUMMARY: AdminSummary = Object.freeze({
  orderCount: 0,
  approvedRevenueMinor: 0,
  approvedCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
  cancelledCount: 0,
  refundedCount: 0,
  averageTicketMinor: 0,
});

export function AdminPage({ navigate }: Readonly<{ navigate: Navigate }>) {
  const initialRange = useMemo(defaultDateRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [status, setStatus] = useState<OrderStatusFilter>(initialRange.status);
  const [submittedRange, setSubmittedRange] = useState<AdminFilter>(initialRange);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void loadAdminData(submittedRange, controller.signal)
      .then((result) => setData(result))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudo cargar el backoffice.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [submittedRange]);

  const analyticsQuery = new URLSearchParams({
    from: submittedRange.from,
    to: submittedRange.to,
    limit: '1000',
  }).toString();
  const orderQueryParams = new URLSearchParams({
    from: submittedRange.from,
    to: submittedRange.to,
    limit: '1000',
  });
  if (submittedRange.status !== '') orderQueryParams.set('status', submittedRange.status);
  const orderQuery = orderQueryParams.toString();

  return (
    <section className="admin-page section" aria-labelledby="admin-title">
      <div className="container admin-shell">
        <div className="section-heading">
          <p className="eyebrow">Administración</p>
          <h1 id="admin-title">Backoffice de sólo lectura.</h1>
          <p>
            Esta superficie requiere una identidad validada por Cloudflare Access y no permite modificar pedidos.
          </p>
        </div>

        <form
          className="admin-filters"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (from <= to) setSubmittedRange({ from, to, status });
          }}
        >
          <label>
            <span>Desde</span>
            <input
              type="date"
              required
              value={from}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setFrom(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="date"
              required
              value={to}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setTo(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Estado de pedidos</span>
            <select
              value={status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setStatus(event.currentTarget.value as OrderStatusFilter);
              }}
            >
              <option value="">Todos</option>
              <option value="preference_pending">Preparando preferencia</option>
              <option value="pending">Pendiente</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
              <option value="cancelled">Cancelado</option>
              <option value="refunded">Reintegrado</option>
              <option value="failed">Fallido</option>
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={from > to || loading}>
            Actualizar
          </button>
        </form>
        {from > to ? <p className="form-error" role="alert">La fecha inicial no puede superar a la final.</p> : null}

        <div className="admin-export-actions" aria-label="Exportaciones">
          <a className="button button-secondary" href={`/api/admin/exports/orders.csv?${orderQuery}`}>
            Exportar pedidos CSV
          </a>
          <a className="button button-secondary" href={`/api/admin/exports/analytics.csv?${analyticsQuery}`}>
            Exportar analítica CSV
          </a>
        </div>

        {loading ? <p role="status">Cargando información administrativa…</p> : null}
        {error === '' ? null : <p className="form-error" role="alert">{error}</p>}
        {data === null || loading ? null : (
          <>
            <SummaryCards summary={data.summary} />
            <AdminTable
              caption="Pedidos recientes"
              columns={['Pedido', 'Estado', 'Total', 'Unidades', 'Fecha']}
              rows={data.orders.map((order) => [
                order.id,
                humanStatus(order.status),
                formatMinor(order.totalMinor),
                String(order.itemCount),
                formatDate(order.createdAt),
              ])}
            />
            <AdminTable
              caption="Embudo analítico"
              columns={['Evento', 'Eventos', 'Sesiones']}
              rows={data.funnel.map((row) => [
                readText(row, 'event_name'),
                readNumberText(row, 'event_count'),
                readNumberText(row, 'session_count'),
              ])}
            />
            <AdminTable
              caption="Productos"
              columns={['Producto', 'Vistas', 'Agregados']}
              rows={data.products.map((row) => [
                readText(row, 'product_id'),
                readNumberText(row, 'views'),
                readNumberText(row, 'cart_adds'),
              ])}
            />
            <div className="admin-two-column">
              <AdminTable
                caption="Fuentes"
                columns={['Fuente', 'Eventos', 'Sesiones']}
                rows={data.sources.map((row) => [
                  readText(row, 'source'),
                  readNumberText(row, 'event_count'),
                  readNumberText(row, 'session_count'),
                ])}
              />
              <AdminTable
                caption="Dispositivos"
                columns={['Dispositivo', 'Eventos', 'Sesiones']}
                rows={data.devices.map((row) => [
                  readText(row, 'device_class'),
                  readNumberText(row, 'event_count'),
                  readNumberText(row, 'session_count'),
                ])}
              />
            </div>
            <AdminTable
              caption="Auditoría administrativa"
              columns={['Actor', 'Acción', 'Destino', 'Resultado', 'Fecha']}
              rows={data.audit.map((row) => [
                readText(row, 'actor_email'),
                readText(row, 'action'),
                [readText(row, 'target_type'), readText(row, 'target_id')]
                  .filter((value) => value !== '—')
                  .join(': ') || '—',
                readNumberText(row, 'outcome_status'),
                formatDate(readText(row, 'created_at')),
              ])}
            />
          </>
        )}

        <AppLink className="button button-secondary page-back-link" navigate={navigate} to={appPaths.home}>
          Volver al sitio
        </AppLink>
      </div>
    </section>
  );
}

function SummaryCards({ summary }: Readonly<{ summary: AdminSummary }>) {
  const cards = [
    ['Pedidos', String(summary.orderCount)],
    ['Facturación aprobada', formatMinor(summary.approvedRevenueMinor)],
    ['Ticket promedio', formatMinor(summary.averageTicketMinor)],
    ['Aprobados', String(summary.approvedCount)],
    ['Pendientes', String(summary.pendingCount)],
    ['Rechazados', String(summary.rejectedCount)],
    ['Cancelados', String(summary.cancelledCount)],
    ['Reintegrados', String(summary.refundedCount)],
  ] as const;
  return (
    <section aria-labelledby="admin-summary-title">
      <h2 id="admin-summary-title">Resumen comercial</h2>
      <dl className="admin-summary-grid">
        {cards.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AdminTable({
  caption,
  columns,
  rows,
}: Readonly<{
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}>) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption>{caption}</caption>
        <thead>
          <tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>No hay datos para el rango seleccionado.</td></tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={`${caption}-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadAdminData(
  range: AdminFilter,
  signal: AbortSignal,
): Promise<AdminData> {
  const baseQuery = new URLSearchParams({ from: range.from, to: range.to, limit: '100' }).toString();
  const orderQueryParams = new URLSearchParams({ from: range.from, to: range.to, limit: '100' });
  if (range.status !== '') orderQueryParams.set('status', range.status);
  const orderQuery = orderQueryParams.toString();
  const [summary, orders, funnel, products, sources, devices, audit] = await Promise.all([
    getJson(`/api/admin/summary?${baseQuery}`, signal),
    getJson(`/api/admin/orders?${orderQuery}`, signal),
    getJson(`/api/admin/analytics/funnel?${baseQuery}`, signal),
    getJson(`/api/admin/analytics/products?${baseQuery}`, signal),
    getJson(`/api/admin/analytics/sources?${baseQuery}`, signal),
    getJson(`/api/admin/analytics/devices?${baseQuery}`, signal),
    getJson(`/api/admin/audit?${baseQuery}`, signal),
  ]);
  return Object.freeze({
    summary: parseSummary(summary),
    orders: parseOrders(orders),
    funnel: parseRows(funnel),
    products: parseRows(products),
    sources: parseRows(sources),
    devices: parseRows(devices),
    audit: parseRowsEnvelope(audit),
  });
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { credentials: 'same-origin', signal });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // La validación siguiente produce un mensaje estable.
  }
  if (!response.ok) {
    throw new Error(readApiMessage(payload) ?? 'No se pudo consultar la información administrativa.');
  }
  return payload;
}

function parseSummary(value: unknown): AdminSummary {
  if (!isRecord(value)) return EMPTY_SUMMARY;
  return Object.freeze({
    orderCount: readNonNegativeInteger(value.order_count),
    approvedRevenueMinor: readNonNegativeInteger(value.approved_revenue_minor),
    approvedCount: readNonNegativeInteger(value.approved_count),
    pendingCount: readNonNegativeInteger(value.pending_count),
    rejectedCount: readNonNegativeInteger(value.rejected_count),
    cancelledCount: readNonNegativeInteger(value.cancelled_count),
    refundedCount: readNonNegativeInteger(value.refunded_count),
    averageTicketMinor: readNonNegativeInteger(value.average_ticket_minor),
  });
}

function parseOrders(value: unknown): readonly AdminOrder[] {
  if (!isRecord(value) || !Array.isArray(value.rows)) return [];
  return value.rows.flatMap((candidate): readonly AdminOrder[] => {
    if (!isRecord(candidate)) return [];
    const id = typeof candidate.id === 'string' ? candidate.id : null;
    const status = typeof candidate.status === 'string' ? candidate.status : null;
    const createdAt = typeof candidate.created_at === 'string' ? candidate.created_at : null;
    if (id === null || status === null || createdAt === null) return [];
    return [Object.freeze({
      id,
      status,
      totalMinor: readNonNegativeInteger(candidate.total_minor),
      itemCount: readNonNegativeInteger(candidate.item_count),
      createdAt,
    })];
  });
}

function parseRows(value: unknown): readonly UnknownRow[] {
  return Array.isArray(value) ? value.filter(isRecord).map((row) => Object.freeze(row)) : [];
}

function parseRowsEnvelope(value: unknown): readonly UnknownRow[] {
  return isRecord(value) && Array.isArray(value.rows)
    ? value.rows.filter(isRecord).map((row) => Object.freeze(row))
    : [];
}

function readApiMessage(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') return null;
  return value.error.message.trim() || null;
}

function readText(row: UnknownRow, key: string): string {
  const value = row[key];
  return typeof value === 'string' && value.trim() !== '' ? value : '—';
}

function readNumberText(row: UnknownRow, key: string): string {
  return String(readNonNegativeInteger(row[key]));
}

function readNonNegativeInteger(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMinor(value: number): string {
  return formatProductPrice({ amount: value / 100, currency: 'ARS' }) ?? '$ 0';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function humanStatus(value: string): string {
  const labels: Record<string, string> = {
    preference_pending: 'Preparando preferencia',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
    refunded: 'Reintegrado',
    failed: 'Fallido',
  };
  return labels[value] ?? value;
}

function defaultDateRange(): AdminFilter {
  const today = new Date();
  const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  return Object.freeze({ from: toDateInput(from), to: toDateInput(today), status: '' });
}

function toDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
