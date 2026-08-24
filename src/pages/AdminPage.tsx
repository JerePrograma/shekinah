import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
} from 'react';

import { formatOrderNumber } from '../commerce/contracts';
import {
  refreshRuntimeCatalog,
  useRuntimeCatalogProducts,
} from '../data/runtime-catalog';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

export type AdminSection = 'summary' | 'products' | 'orders' | 'analytics' | 'audit';

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
type OrderAction = 'approve' | 'reject' | 'reconcile';
type AdminFilter = Readonly<{ from: string; to: string; status: OrderStatusFilter }>;
type AdminSummary = Readonly<{
  orderCount: number;
  approvedRevenueMinor: number;
  approvedCount: number;
  approvedPaymentCount: number;
  preferencePendingCount: number;
  pendingCount: number;
  rejectedCount: number;
  cancelledCount: number;
  refundedCount: number;
  failedCount: number;
  averageTicketMinor: number;
  consentedSessionCount: number;
  pageViewCount: number;
  pageViewSessionCount: number;
  productViewSessionCount: number;
  cartAddSessionCount: number;
  manualPaymentClickCount: number;
  manualPaymentClickSessionCount: number;
  whatsappOpenCount: number;
  whatsappOpenSessionCount: number;
}>;
type AdminOrder = Readonly<{
  id: string;
  channel: string;
  status: string;
  currency: string;
  totalMinor: number;
  itemCount: number;
  deliveryMethod: string;
  fullName: string;
  lastErrorCode: string;
  createdAt: string;
}>;
type AnalyticsTrendRow = Readonly<{
  day: string;
  sessionCount: number;
  pageViewCount: number;
  productViewCount: number;
  cartAddCount: number;
  manualPaymentClickCount: number;
  whatsappOpenCount: number;
  checkoutRedirectCount: number;
}>;
type AdminOrderDetail = Readonly<{
  order: Readonly<{
    id: string;
    channel: string;
    status: string;
    currency: string;
    totalMinor: number;
    productsTotalMinor: number;
    shippingMinor: number;
    itemCount: number;
    createdAt: string;
    updatedAt: string;
    approvedAt: string;
    resolvedAt: string;
    resolvedBy: string;
    lastErrorCode: string;
    preferenceId: string;
    stockReservedAt: string;
    stockReservationExpiresAt: string;
    stockConsumedAt: string;
    stockReservationState: string;
    deliveryMethod: string;
    fullName: string;
    phone: string;
    address: string;
    locality: string;
    province: string;
    postalCode: string;
    totalWeightGrams: number | null;
  }>;
  items: readonly Readonly<{
    productId: string;
    name: string;
    presentation: string;
    sku: string;
    quantity: number;
    unitPriceMinor: number;
    subtotalMinor: number;
    stockControlled: boolean;
  }>[];
  payments: readonly Readonly<{
    provider: string;
    providerPaymentId: string;
    mappedStatus: string;
    providerStatus: string;
    statusDetail: string;
    amountMinor: number;
    currency: string;
    approvedAt: string;
    providerUpdatedAt: string;
    updatedAt: string;
  }>[];
}>;
type AdminData = Readonly<{
  summary: AdminSummary | null;
  orders: readonly AdminOrder[] | null;
  funnel: readonly UnknownRow[] | null;
  products: readonly UnknownRow[] | null;
  sources: readonly UnknownRow[] | null;
  devices: readonly UnknownRow[] | null;
  trend: readonly AnalyticsTrendRow[] | null;
  audit: readonly UnknownRow[] | null;
}>;
type AdminReport = Readonly<{
  section: Exclude<AdminSection, 'products'>;
  data: AdminData;
  issues: readonly string[];
}>;

const EMPTY_DATA: AdminData = Object.freeze({
  summary: null,
  orders: null,
  funnel: null,
  products: null,
  sources: null,
  devices: null,
  trend: null,
  audit: null,
});

export function AdminPage({
  navigate,
  onOperationStateChange,
  onUnauthorized,
  section,
}: Readonly<{
  navigate: Navigate;
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
  section: AdminSection;
}>) {
  const initialRange = useMemo(defaultDateRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [status, setStatus] = useState<OrderStatusFilter>(initialRange.status);
  const [submittedRange, setSubmittedRange] = useState<AdminFilter>(initialRange);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<AdminOrderDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderAction, setOrderAction] = useState<OrderAction | null>(null);
  const [orderActionError, setOrderActionError] = useState('');
  const [orderActionMessage, setOrderActionMessage] = useState('');
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [reportRefresh, setReportRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const orderDetailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const sectionTitleRef = useRef<HTMLHeadingElement | null>(null);
  const products = useRuntimeCatalogProducts();
  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );
  const rangeError = validateDateRange(from, to);

  useEffect(() => {
    onOperationStateChange?.(
      orderAction !== null,
      orderAction === 'approve'
        ? 'Aprobando pedido'
        : orderAction === 'reject'
          ? 'Rechazando pedido'
          : orderAction === 'reconcile'
            ? 'Conciliando pedido con Mercado Pago'
            : undefined,
    );
    return () => onOperationStateChange?.(false);
  }, [onOperationStateChange, orderAction]);

  useEffect(() => {
    if (section === 'products') return undefined;
    const controller = new AbortController();
    setLoading(true);
    setReport(null);
    void loadAdminReport(section, submittedRange, controller.signal, onUnauthorized)
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onUnauthorized, reportRefresh, section, submittedRange]);

  useEffect(() => {
    if (section === 'orders') return;
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError('');
    setOrderActionError('');
    setOrderActionMessage('');
    setConfirmingReject(false);
  }, [section]);

  useEffect(() => {
    if (section !== 'orders' || selectedOrderId === null) return undefined;
    const controller = new AbortController();
    setDetailLoading(true);
    setOrderDetail(null);
    setDetailError('');
    void getJson(
      `/api/admin/orders/${encodeURIComponent(selectedOrderId)}`,
      controller.signal,
      onUnauthorized,
    )
      .then(parseOrderDetail)
      .then((detail) => {
        if (!controller.signal.aborted) setOrderDetail(detail);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDetailError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [detailRefresh, onUnauthorized, section, selectedOrderId]);

  if (section === 'products') return null;

  const visibleReport = report?.section === section ? report : null;
  const orderQuery = exportQuery(submittedRange, true);
  const analyticsQuery = exportQuery(submittedRange, false);
  const heading = sectionHeading(section);

  function closeOrderDetail(): void {
    if (orderAction !== null) return;
    setSelectedOrderId(null);
    window.requestAnimationFrame(() => {
      const returnTarget = orderDetailReturnFocusRef.current;
      if (returnTarget?.isConnected === true) returnTarget.focus();
      else sectionTitleRef.current?.focus();
    });
  }

  async function transitionOrder(action: 'approve' | 'reject'): Promise<void> {
    if (
      selectedOrderId === null ||
      orderAction !== null ||
      orderDetail?.order.channel !== 'whatsapp' ||
      orderDetail.order.status !== 'pending'
    ) return;
    setOrderAction(action);
    setOrderActionError('');
    setOrderActionMessage('');
    try {
      const payload = await postAdminAction(
        `/api/admin/orders/${encodeURIComponent(selectedOrderId)}/${action}`,
        onUnauthorized,
      );
      const detail = parseOrderDetail(payload);
      setOrderDetail(detail);
      setConfirmingReject(false);
      setOrderActionMessage(
        action === 'approve'
          ? 'Pedido aprobado. La reserva se convirtió en venta y el stock físico quedó actualizado.'
          : 'Pedido rechazado. Las unidades reservadas volvieron a quedar disponibles.',
      );
      setReportRefresh((current) => current + 1);
      await refreshRuntimeCatalog().catch(() => undefined);
      window.dispatchEvent(new Event('shekinah:admin-products-refresh'));
    } catch (error: unknown) {
      setOrderActionError(errorMessage(error));
      setDetailRefresh((current) => current + 1);
    } finally {
      setOrderAction(null);
    }
  }

  async function reconcileOrder(): Promise<void> {
    if (
      selectedOrderId === null ||
      orderAction !== null ||
      orderDetail?.order.channel !== 'checkout_pro'
    ) return;
    setOrderAction('reconcile');
    setOrderActionError('');
    setOrderActionMessage('');
    try {
      const payload = await postAdminAction(
        `/api/admin/orders/${encodeURIComponent(selectedOrderId)}/reconcile`,
        onUnauthorized,
      );
      const checkedPayments = parseReconciliationCount(payload);
      setOrderDetail(parseOrderDetail(payload));
      setOrderActionMessage(
        checkedPayments === 0
          ? 'Conciliación completada: Mercado Pago no informó pagos para este pedido.'
          : `Conciliación completada: ${checkedPayments.toLocaleString('es-AR')} pago${checkedPayments === 1 ? '' : 's'} verificado${checkedPayments === 1 ? '' : 's'} contra Mercado Pago.`,
      );
      setReportRefresh((current) => current + 1);
      await refreshRuntimeCatalog().catch(() => undefined);
      window.dispatchEvent(new Event('shekinah:admin-products-refresh'));
    } catch (error: unknown) {
      setOrderActionError(errorMessage(error));
      setDetailRefresh((current) => current + 1);
    } finally {
      setOrderAction(null);
    }
  }

  return (
    <section className="admin-page section" aria-labelledby={`admin-${section}-title`}>
      <div className="container admin-shell">
        <div className="section-heading admin-report-heading">
          <p className="eyebrow">Administración</p>
          <h2 id={`admin-${section}-title`} ref={sectionTitleRef} tabIndex={-1}>
            {heading.title}
          </h2>
          <p>{heading.description}</p>
        </div>

        <form
          className="admin-filters"
          aria-describedby={rangeError === null ? undefined : 'admin-range-error'}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (rangeError === null) setSubmittedRange({ from, to, status });
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
          {section === 'orders' ? (
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
          ) : null}
          <button className="button button-primary" type="submit" disabled={rangeError !== null || loading}>
            Actualizar período
          </button>
        </form>
        {rangeError === null ? null : (
          <p className="form-error" id="admin-range-error" role="alert">{rangeError}</p>
        )}

        <ExportActions
          analyticsQuery={analyticsQuery}
          orderQuery={orderQuery}
          section={section}
        />

        {loading ? <p role="status">Cargando {heading.loadingLabel}…</p> : null}
        {visibleReport === null ? null : <PartialDataNotice issues={visibleReport.issues} />}
        {visibleReport === null || loading ? null : (
          <SectionContent
            data={visibleReport.data}
            onOpenOrder={(id, returnFocusTarget) => {
              orderDetailReturnFocusRef.current = returnFocusTarget;
              setSelectedOrderId(id);
            }}
            productNames={productNames}
            section={section}
          />
        )}

        {section === 'orders' && selectedOrderId !== null ? (
          <OrderDetailPanel
            detail={orderDetail}
            error={detailError}
            loading={detailLoading}
            action={orderAction}
            actionError={orderActionError}
            actionMessage={orderActionMessage}
            confirmingReject={confirmingReject}
            orderId={selectedOrderId}
            onClose={closeOrderDetail}
            onApprove={() => void transitionOrder('approve')}
            onCancelReject={() => setConfirmingReject(false)}
            onConfirmReject={() => void transitionOrder('reject')}
            onReconcile={() => void reconcileOrder()}
            onRequestReject={() => setConfirmingReject(true)}
          />
        ) : null}

        <AppLink className="button button-secondary page-back-link" navigate={navigate} to={appPaths.home}>
          Volver al sitio
        </AppLink>
      </div>
    </section>
  );
}

function SectionContent({
  data,
  onOpenOrder,
  productNames,
  section,
}: Readonly<{
  data: AdminData;
  onOpenOrder: (id: string, returnFocusTarget: HTMLButtonElement) => void;
  productNames: ReadonlyMap<string, string>;
  section: Exclude<AdminSection, 'products'>;
}>) {
  switch (section) {
    case 'summary':
      return data.summary === null
        ? <UnavailableState label="el resumen" />
        : <SummaryView summary={data.summary} />;
    case 'orders':
      return data.orders === null
        ? <UnavailableState label="los pedidos" />
        : <OrdersView onOpenOrder={onOpenOrder} orders={data.orders} />;
    case 'analytics':
      return (
        <AnalyticsView
          data={data}
          productNames={productNames}
        />
      );
    case 'audit':
      return data.audit === null
        ? <UnavailableState label="la auditoría" />
        : <AuditView rows={data.audit} />;
  }
}

function SummaryView({ summary }: Readonly<{ summary: AdminSummary }>) {
  return (
    <div className="admin-dashboard-stack">
      <section className="admin-metric-group" aria-labelledby="interaction-summary-title">
        <div className="admin-subsection-heading">
          <h3 id="interaction-summary-title">Métricas de interacción</h3>
          <p>Actividad first-party consentida dentro del período.</p>
        </div>
        <dl className="admin-summary-grid admin-summary-grid-interaction">
          <Metric label="Sesiones consentidas" value={summary.consentedSessionCount} />
          <Metric
            label="Vistas de página"
            value={summary.pageViewCount}
            note={`${summary.pageViewSessionCount.toLocaleString('es-AR')} sesiones`}
          />
          <Metric
            label="Sesiones que vieron productos"
            value={summary.productViewSessionCount}
            note={reachLabel(summary.productViewSessionCount, summary.consentedSessionCount)}
          />
          <Metric
            label="Sesiones que agregaron al carrito"
            value={summary.cartAddSessionCount}
            note={reachLabel(summary.cartAddSessionCount, summary.consentedSessionCount)}
          />
          <Metric
            label="Sesiones con clic en Mercado Pago"
            value={summary.manualPaymentClickSessionCount}
            note={`${summary.manualPaymentClickCount.toLocaleString('es-AR')} clics válidos`}
          />
          <Metric
            label="Sesiones que abrieron WhatsApp"
            value={summary.whatsappOpenSessionCount}
            note={`${summary.whatsappOpenCount.toLocaleString('es-AR')} aperturas`}
          />
        </dl>
      </section>

      <InteractionNotice />

      <section className="admin-metric-group" aria-labelledby="financial-summary-title">
        <div className="admin-subsection-heading">
          <h3 id="financial-summary-title">Métricas financieras confirmadas</h3>
          <p>Pedidos persistidos y, por separado, pagos aprobados confirmados en D1.</p>
        </div>
        <dl className="admin-summary-grid">
          <Metric label="Pedidos persistidos" value={summary.orderCount} />
          <Metric label="Pedidos con pago aprobado confirmado" value={summary.approvedCount} />
          <Metric label="Pagos aprobados" value={summary.approvedPaymentCount} />
          <Metric
            label="Pedidos pendientes"
            value={summary.preferencePendingCount + summary.pendingCount}
          />
          <Metric label="Facturación aprobada" value={formatMoney(summary.approvedRevenueMinor)} />
          <Metric label="Ticket promedio aprobado" value={formatMoney(summary.averageTicketMinor)} />
        </dl>
        <p className="admin-context-note">
          Checkout Pro integrado continúa deshabilitado. Los pedidos de WhatsApp pueden aparecer
          aquí, pero su aprobación manual no se convierte en facturación sin un pago compatible
          persistido y verificado.
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  note,
  value,
}: Readonly<{ label: string; note?: string | undefined; value: number | string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</dd>
      {note === undefined ? null : <small>{note}</small>}
    </div>
  );
}

function OrdersView({
  onOpenOrder,
  orders,
}: Readonly<{
  onOpenOrder: (id: string, returnFocusTarget: HTMLButtonElement) => void;
  orders: readonly AdminOrder[];
}>) {
  return (
    <AdminTable
      caption="Pedidos del período y pedidos de WhatsApp pendientes"
      columns={['Pedido', 'Canal', 'Estado', 'Fecha', 'Cliente', 'Modalidad', 'Total', 'Acción']}
      rows={orders.map((order) => [
        formatOrderNumber(order.id),
        channelLabel(order.channel),
        orderStatusLabel(order.status, order.lastErrorCode),
        formatDate(order.createdAt),
        order.fullName,
        deliveryLabel(order.deliveryMethod),
        formatMoney(order.totalMinor, order.currency),
        <button
          className="button button-secondary admin-table-action"
          type="button"
          onClick={(event) => onOpenOrder(order.id, event.currentTarget)}
        >
          Ver detalle
        </button>,
      ])}
    />
  );
}

function AnalyticsView({
  data,
  productNames,
}: Readonly<{ data: AdminData; productNames: ReadonlyMap<string, string> }>) {
  return (
    <div className="admin-dashboard-stack">
      <InteractionNotice />
      {data.summary === null ? <UnavailableState label="el flujo manual" /> : (
        <ManualFlow summary={data.summary} />
      )}
      {data.funnel === null ? <UnavailableState label="el embudo de eventos" /> : (
        <FunnelTable rows={data.funnel} />
      )}
      {data.products === null ? <UnavailableState label="el ranking de productos" /> : (
        <ProductAnalytics rows={data.products} productNames={productNames} />
      )}
      <div className="admin-two-column">
        {data.sources === null ? <UnavailableState label="las fuentes" /> : (
          <ParticipationTable dimension="source" rows={data.sources} title="Fuentes" />
        )}
        {data.devices === null ? <UnavailableState label="los dispositivos" /> : (
          <ParticipationTable dimension="device_class" rows={data.devices} title="Dispositivos" />
        )}
      </div>
      {data.trend === null ? <UnavailableState label="la tendencia diaria" /> : (
        <TrendView rows={data.trend} />
      )}
    </div>
  );
}

function InteractionNotice() {
  return (
    <p className="admin-semantic-notice">
      Los clics en Mercado Pago y las aperturas de WhatsApp son interacciones, no pagos
      confirmados. El Link de Pago manual no crea una preferencia integrada ni alimenta la
      facturación aprobada.
    </p>
  );
}

function ManualFlow({ summary }: Readonly<{ summary: AdminSummary }>) {
  const stages = [
    ['Sesiones consentidas', summary.consentedSessionCount],
    ['Ven productos', summary.productViewSessionCount],
    ['Agregan al carrito', summary.cartAddSessionCount],
    ['Abren Link de Pago manual', summary.manualPaymentClickSessionCount],
  ] as const;
  return (
    <section className="admin-flow" aria-labelledby="manual-flow-title">
      <div className="admin-subsection-heading">
        <h3 id="manual-flow-title">Flujo de compra manual</h3>
        <p>Cada etapa usa sesiones únicas; el porcentaje indica alcance sobre sesiones consentidas.</p>
      </div>
      <ol>
        {stages.map(([label, count]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{count.toLocaleString('es-AR')}</strong>
            <small>{label === 'Sesiones consentidas' ? 'Base del período' : reachLabel(count, summary.consentedSessionCount)}</small>
          </li>
        ))}
      </ol>
      <div className="admin-assisted-channel">
        <span>Canal asistido: aperturas de WhatsApp</span>
        <strong>{summary.whatsappOpenSessionCount.toLocaleString('es-AR')} sesiones</strong>
      </div>
    </section>
  );
}

function FunnelTable({ rows }: Readonly<{ rows: readonly UnknownRow[] }>) {
  const names = [
    'page_view',
    'product_view',
    'cart_add',
    'manual_payment_click',
    'whatsapp_open',
    'checkout_start',
    'checkout_redirect',
  ] as const;
  return (
    <AdminTable
      caption="Eventos y sesiones por acción"
      columns={['Acción', 'Eventos', 'Sesiones', 'Semántica']}
      rows={names.map((name) => {
        const row = rows.find((candidate) => readText(candidate, 'event_name') === name);
        return [
          eventLabel(name),
          row === undefined ? '0' : readNumberText(row, 'event_count'),
          row === undefined ? '0' : readNumberText(row, 'session_count'),
          eventMeaning(name),
        ];
      })}
    />
  );
}

function ProductAnalytics({
  productNames,
  rows,
}: Readonly<{ productNames: ReadonlyMap<string, string>; rows: readonly UnknownRow[] }>) {
  return (
    <AdminTable
      caption="Ranking de productos por interacción"
      columns={['Producto', 'Vistas', 'Agregados', 'Sesiones vista → carrito', 'Tasa vista → carrito']}
      rows={rows.map((row) => {
        const id = readText(row, 'product_id');
        const viewSessions = readNonNegativeInteger(row.view_sessions);
        const convertedSessions = readNonNegativeInteger(row.converted_sessions);
        return [
          productNames.get(id) ?? id,
          readNumberText(row, 'views'),
          readNumberText(row, 'cart_adds'),
          convertedSessions.toLocaleString('es-AR'),
          percentage(convertedSessions, viewSessions),
        ];
      })}
    />
  );
}

function ParticipationTable({
  dimension,
  rows,
  title,
}: Readonly<{
  dimension: 'source' | 'device_class';
  rows: readonly UnknownRow[];
  title: string;
}>) {
  const totalEvents = rows.reduce((total, row) => total + readNonNegativeInteger(row.event_count), 0);
  return (
    <AdminTable
      caption={title}
      columns={[title.slice(0, -1), 'Sesiones', 'Eventos', 'Participación de eventos']}
      rows={rows.map((row) => [
        dimensionLabel(dimension, readText(row, dimension)),
        readNumberText(row, 'session_count'),
        readNumberText(row, 'event_count'),
        percentage(readNonNegativeInteger(row.event_count), totalEvents),
      ])}
    />
  );
}

function TrendView({ rows }: Readonly<{ rows: readonly AnalyticsTrendRow[] }>) {
  const eventTotals = rows.map(relevantEventTotal);
  const maxSessions = Math.max(1, ...rows.map((row) => row.sessionCount));
  const maxEvents = Math.max(1, ...eventTotals);
  return (
    <section className="admin-trend" aria-labelledby="analytics-trend-title">
      <div className="admin-subsection-heading">
        <h3 id="analytics-trend-title">Tendencia diaria</h3>
        <p>Sesiones consentidas y eventos relevantes dentro del período.</p>
      </div>
      {rows.length === 0 ? <p>No hay días para el rango seleccionado.</p> : (
        <ul className="admin-trend-chart" aria-label="Evolución diaria de sesiones y eventos">
          {rows.map((row, index) => (
            <li key={row.day}>
              <time dateTime={row.day}>{formatDay(row.day)}</time>
              <label>
                <span>Sesiones: {row.sessionCount.toLocaleString('es-AR')}</span>
                <progress max={maxSessions} value={row.sessionCount} />
              </label>
              <label>
                <span>Eventos: {(eventTotals[index] ?? 0).toLocaleString('es-AR')}</span>
                <progress max={maxEvents} value={eventTotals[index] ?? 0} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Ver tabla diaria accesible</summary>
        <AdminTable
          caption="Detalle diario de analítica"
          columns={[
            'Día', 'Sesiones', 'Páginas', 'Productos', 'Carrito',
            'Mercado Pago manual', 'WhatsApp', 'Checkout integrado',
          ]}
          rows={rows.map((row) => [
            formatDay(row.day),
            row.sessionCount.toLocaleString('es-AR'),
            row.pageViewCount.toLocaleString('es-AR'),
            row.productViewCount.toLocaleString('es-AR'),
            row.cartAddCount.toLocaleString('es-AR'),
            row.manualPaymentClickCount.toLocaleString('es-AR'),
            row.whatsappOpenCount.toLocaleString('es-AR'),
            row.checkoutRedirectCount.toLocaleString('es-AR'),
          ])}
        />
      </details>
    </section>
  );
}

function AuditView({ rows }: Readonly<{ rows: readonly UnknownRow[] }>) {
  return (
    <AdminTable
      caption="Auditoría administrativa de sólo lectura"
      columns={['Actor', 'Acción', 'Destino', 'Resultado', 'Fecha']}
      rows={rows.map((row) => [
        readText(row, 'actor_email'),
        readText(row, 'action'),
        [readText(row, 'target_type'), readText(row, 'target_id')]
          .filter((value) => value !== '—')
          .join(': ') || '—',
        readNumberText(row, 'outcome_status'),
        formatDate(readText(row, 'created_at')),
      ])}
    />
  );
}

function OrderDetailPanel({
  action,
  actionError,
  actionMessage,
  confirmingReject,
  detail,
  error,
  loading,
  onClose,
  onApprove,
  onCancelReject,
  onConfirmReject,
  onReconcile,
  onRequestReject,
  orderId,
}: Readonly<{
  action: OrderAction | null;
  actionError: string;
  actionMessage: string;
  confirmingReject: boolean;
  detail: AdminOrderDetail | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onApprove: () => void;
  onCancelReject: () => void;
  onConfirmReject: () => void;
  onReconcile: () => void;
  onRequestReject: () => void;
  orderId: string;
}>) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const rejectCancelRef = useRef<HTMLButtonElement | null>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [orderId]);
  useEffect(() => {
    if (confirmingReject) rejectCancelRef.current?.focus();
  }, [confirmingReject]);
  function cancelReject(): void {
    onCancelReject();
    window.requestAnimationFrame(() => rejectTriggerRef.current?.focus());
  }
  return (
    <article
      className="admin-order-detail"
      aria-labelledby="order-detail-title"
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Gestión de pedido</p>
          <h3 id="order-detail-title" ref={titleRef} tabIndex={-1}>Detalle de {formatOrderNumber(orderId)}</h3>
        </div>
        <button className="button button-secondary" type="button" disabled={action !== null} onClick={onClose}>
          Cerrar detalle
        </button>
      </header>
      {loading ? <p role="status">Cargando detalle del pedido…</p> : null}
      {error === '' ? null : <p className="form-error" role="alert">{error}</p>}
      {detail === null || loading ? null : <OrderDetailContent detail={detail} />}
      {detail?.order.channel === 'whatsapp' && detail.order.status === 'pending' ? (
        <section className="admin-order-actions" aria-labelledby="order-actions-title" aria-busy={action !== null}>
          <div>
            <h4 id="order-actions-title">Resolver pedido pendiente</h4>
            <p>
              Aprobar consume la reserva y descuenta el stock físico. Rechazar libera las
              unidades sin registrar una venta.
            </p>
          </div>
          {confirmingReject ? (
            <div
              className="admin-inline-confirmation"
              role="alertdialog"
              aria-labelledby="reject-order-title"
              aria-describedby="reject-order-description"
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Escape' || action !== null) return;
                event.preventDefault();
                event.stopPropagation();
                cancelReject();
              }}
            >
              <h5 id="reject-order-title">Rechazar {formatOrderNumber(orderId)}</h5>
              <p id="reject-order-description">
                El pedido quedará rechazado y todas sus unidades reservadas volverán a estar disponibles.
              </p>
              <div className="admin-inline-actions">
                <button ref={rejectCancelRef} className="button button-secondary" type="button" disabled={action !== null} onClick={cancelReject}>
                  Cancelar
                </button>
                <button className="button button-danger" type="button" disabled={action !== null} onClick={onConfirmReject}>
                  {action === 'reject' ? 'Rechazando…' : 'Rechazar pedido'}
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-inline-actions">
              <button ref={rejectTriggerRef} className="button button-danger" type="button" disabled={action !== null} onClick={onRequestReject}>
                Rechazar
              </button>
              <button className="button button-primary" type="button" disabled={action !== null} onClick={onApprove}>
                {action === 'approve' ? 'Aprobando…' : 'Aprobar'}
              </button>
            </div>
          )}
        </section>
      ) : null}
      {detail?.order.channel === 'checkout_pro' ? (
        <section className="admin-order-actions" aria-labelledby="reconcile-order-title" aria-busy={action !== null}>
          <div>
            <h4 id="reconcile-order-title">Conciliar pago y stock</h4>
            <p>
              Consulta Mercado Pago con la credencial del entorno. Si encuentra un pago autoritativo,
              actualiza el pedido y consume la reserva exactamente una vez cuando corresponda.
            </p>
            {detail.order.status === 'refunded' ? (
              <p className="admin-context-note">
                El reintegro no repone stock automáticamente. Cualquier reposición física requiere
                una decisión y un ajuste manual trazable.
              </p>
            ) : null}
          </div>
          <div className="admin-inline-actions">
            <button className="button button-primary" type="button" disabled={action !== null} onClick={onReconcile}>
              {action === 'reconcile' ? 'Conciliando…' : 'Conciliar con Mercado Pago'}
            </button>
          </div>
        </section>
      ) : null}
      {actionMessage === '' ? null : <p className="admin-feedback admin-feedback-success" role="status">{actionMessage}</p>}
      {actionError === '' ? null : <p className="form-error" role="alert">{actionError}</p>}
    </article>
  );
}

function OrderDetailContent({ detail }: Readonly<{ detail: AdminOrderDetail }>) {
  const { order } = detail;
  return (
    <div className="admin-order-detail-content">
      <DetailGroup
        title="Datos generales"
        entries={[
          ['Número de pedido', formatOrderNumber(order.id)],
          ['ID interno', order.id],
          ['Canal', channelLabel(order.channel)],
          ['Estado', humanStatus(order.status)],
          ['Creación', formatDate(order.createdAt)],
          ['Actualización', formatDate(order.updatedAt)],
          ['Aprobación', formatDate(order.approvedAt)],
          ['Resolución', formatDate(order.resolvedAt)],
          ['Resuelto por', order.resolvedBy],
          ['Moneda', order.currency],
          ['Preferencia Mercado Pago', order.preferenceId],
          ['Incidencia conocida', orderIssueLabel(order.lastErrorCode)],
        ]}
      />
      <DetailGroup
        title="Reserva e inventario"
        entries={[
          ['Estado de stock', reservationStateLabel(order.stockReservationState)],
          ['Reserva creada', formatDate(order.stockReservedAt)],
          ['Vencimiento de reserva', formatDate(order.stockReservationExpiresAt)],
          ['Consumo de stock', formatDate(order.stockConsumedAt)],
          ['Política de reintegro', 'No repone stock automáticamente'],
        ]}
      />
      <DetailGroup
        title="Totales"
        entries={[
          ['Productos', formatMoney(order.productsTotalMinor, order.currency)],
          ['Envío', formatMoney(order.shippingMinor, order.currency)],
          ['Total', formatMoney(order.totalMinor, order.currency)],
          ['Unidades', order.itemCount.toLocaleString('es-AR')],
          ['Peso', formatWeight(order.totalWeightGrams)],
        ]}
      />
      <DetailGroup
        title="Fulfillment"
        entries={[
          ['Modalidad', deliveryLabel(order.deliveryMethod)],
          ['Cliente', order.fullName],
          ['Teléfono', order.phone],
          ['Dirección', order.address],
          ['Localidad', order.locality],
          ['Provincia', order.province],
          ['Código postal', order.postalCode],
        ]}
      />
      <AdminTable
        caption={order.channel === 'whatsapp' && order.status === 'pending'
          ? 'Productos y unidades reservadas'
          : 'Items del pedido'}
        columns={['Producto', 'Presentación', 'SKU', 'Stock', 'Cantidad', 'Precio unitario', 'Subtotal']}
        rows={detail.items.map((item) => [
          item.name === '—' ? item.productId : item.name,
          item.presentation,
          item.sku,
          item.stockControlled ? 'Controlado' : 'Sin control numérico',
          item.quantity.toLocaleString('es-AR'),
          formatMoney(item.unitPriceMinor, order.currency),
          formatMoney(item.subtotalMinor, order.currency),
        ])}
      />
      <AdminTable
        caption="Pagos reportados por el proveedor"
        columns={[
          'Proveedor', 'ID proveedor', 'Estado mapeado', 'Estado proveedor',
          'Detalle', 'Importe', 'Aprobación', 'Última actualización',
        ]}
        rows={detail.payments.map((payment) => [
          providerLabel(payment.provider),
          payment.providerPaymentId,
          humanStatus(payment.mappedStatus),
          payment.providerStatus,
          payment.statusDetail,
          formatMoney(payment.amountMinor, payment.currency),
          formatDate(payment.approvedAt),
          formatDate(payment.providerUpdatedAt === '—' ? payment.updatedAt : payment.providerUpdatedAt),
        ])}
      />
      <p className="admin-context-note">
        Los importes y snapshots son históricos y no se editan desde esta vista. Sólo los pedidos
        de WhatsApp pendientes admiten aprobación o rechazo; Checkout Pro sólo admite una
        conciliación contra el estado autoritativo de Mercado Pago.
      </p>
    </div>
  );
}

function DetailGroup({
  entries,
  title,
}: Readonly<{ entries: readonly (readonly [string, string])[]; title: string }>) {
  return (
    <section className="admin-detail-group">
      <h4>{title}</h4>
      <dl>
        {entries.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function ExportActions({
  analyticsQuery,
  orderQuery,
  section,
}: Readonly<{ analyticsQuery: string; orderQuery: string; section: Exclude<AdminSection, 'products'> }>) {
  if (section === 'audit') return null;
  return (
    <div className="admin-export-actions" aria-label="Exportaciones">
      {section === 'summary' || section === 'orders' ? (
        <a className="button button-secondary" href={`/api/admin/exports/orders.csv?${orderQuery}`}>
          Exportar pedidos CSV
        </a>
      ) : null}
      {section === 'summary' || section === 'analytics' ? (
        <a className="button button-secondary" href={`/api/admin/exports/analytics.csv?${analyticsQuery}`}>
          Exportar analítica CSV
        </a>
      ) : null}
    </div>
  );
}

function PartialDataNotice({ issues }: Readonly<{ issues: readonly string[] }>) {
  if (issues.length === 0) return null;
  return (
    <div className="admin-partial-warning" role="alert">
      <p>Algunos datos no pudieron cargarse. Las secciones disponibles siguen siendo válidas.</p>
      <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
    </div>
  );
}

function UnavailableState({ label }: Readonly<{ label: string }>) {
  return <p className="admin-unavailable-state">No se pudo mostrar {label}.</p>;
}

function AdminTable({
  caption,
  columns,
  rows,
}: Readonly<{
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
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
            <tr><td colSpan={columns.length}>No hay datos para el período seleccionado.</td></tr>
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

async function loadAdminReport(
  section: Exclude<AdminSection, 'products'>,
  range: AdminFilter,
  signal: AbortSignal,
  onUnauthorized?: () => void,
): Promise<AdminReport> {
  const baseQuery = new URLSearchParams({ from: range.from, to: range.to, limit: '100' }).toString();
  const orderQueryParams = new URLSearchParams({ from: range.from, to: range.to, limit: '100' });
  if (range.status !== '') orderQueryParams.set('status', range.status);
  const orderQuery = orderQueryParams.toString();

  if (section === 'summary') {
    const summary = await loadPart(
      'Resumen',
      getJson(`/api/admin/summary?${baseQuery}`, signal, onUnauthorized).then(parseSummary),
    );
    return reportFor(section, { ...EMPTY_DATA, summary: summary.value }, summary.issue);
  }
  if (section === 'orders') {
    const orders = await loadPart(
      'Pedidos',
      getJson(`/api/admin/orders?${orderQuery}`, signal, onUnauthorized).then(parseOrders),
    );
    return reportFor(section, { ...EMPTY_DATA, orders: orders.value }, orders.issue);
  }
  if (section === 'audit') {
    const audit = await loadPart(
      'Auditoría',
      getJson(`/api/admin/audit?${baseQuery}`, signal, onUnauthorized).then(parseRowsEnvelope),
    );
    return reportFor(section, { ...EMPTY_DATA, audit: audit.value }, audit.issue);
  }

  const [summary, funnel, products, sources, devices, trend] = await Promise.all([
    loadPart('Resumen analítico', getJson(`/api/admin/summary?${baseQuery}`, signal, onUnauthorized).then(parseSummary)),
    loadPart('Embudo', getJson(`/api/admin/analytics/funnel?${baseQuery}`, signal, onUnauthorized).then(parseRows)),
    loadPart('Productos', getJson(`/api/admin/analytics/products?${baseQuery}`, signal, onUnauthorized).then(parseRows)),
    loadPart('Fuentes', getJson(`/api/admin/analytics/sources?${baseQuery}`, signal, onUnauthorized).then(parseRows)),
    loadPart('Dispositivos', getJson(`/api/admin/analytics/devices?${baseQuery}`, signal, onUnauthorized).then(parseRows)),
    loadPart('Tendencia', getJson(`/api/admin/analytics/trend?${baseQuery}`, signal, onUnauthorized).then(parseTrend)),
  ]);
  return reportFor(section, {
    ...EMPTY_DATA,
    summary: summary.value,
    funnel: funnel.value,
    products: products.value,
    sources: sources.value,
    devices: devices.value,
    trend: trend.value,
  }, summary.issue, funnel.issue, products.issue, sources.issue, devices.issue, trend.issue);
}

async function loadPart<T>(label: string, request: Promise<T>): Promise<Readonly<{ value: T | null; issue: string | null }>> {
  try {
    return Object.freeze({ value: await request, issue: null });
  } catch (error: unknown) {
    return Object.freeze({ value: null, issue: `${label}: ${errorMessage(error)}` });
  }
}

function reportFor(
  section: Exclude<AdminSection, 'products'>,
  data: AdminData,
  ...issues: readonly (string | null)[]
): AdminReport {
  return Object.freeze({
    section,
    data: Object.freeze(data),
    issues: Object.freeze(issues.filter((issue): issue is string => issue !== null)),
  });
}

async function getJson(
  path: string,
  signal: AbortSignal,
  onUnauthorized?: () => void,
): Promise<unknown> {
  const response = await fetch(path, { credentials: 'same-origin', signal });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('La sesión administrativa venció.');
  }
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

async function postAdminAction(
  path: string,
  onUnauthorized?: () => void,
): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('La sesión administrativa venció.');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // La validación siguiente produce un mensaje estable.
  }
  if (!response.ok) {
    throw new Error(readApiMessage(payload) ?? 'No se pudo actualizar el pedido.');
  }
  return payload;
}

function parseSummary(value: unknown): AdminSummary {
  if (!isRecord(value)) throw new Error('El resumen administrativo no tiene un formato válido.');
  return Object.freeze({
    orderCount: readRequiredMetric(value, 'order_count'),
    approvedRevenueMinor: readRequiredMetric(value, 'approved_revenue_minor'),
    approvedCount: readRequiredMetric(value, 'approved_count'),
    approvedPaymentCount: readRequiredMetric(value, 'approved_payment_count'),
    preferencePendingCount: readRequiredMetric(value, 'preference_pending_count'),
    pendingCount: readRequiredMetric(value, 'pending_count'),
    rejectedCount: readRequiredMetric(value, 'rejected_count'),
    cancelledCount: readRequiredMetric(value, 'cancelled_count'),
    refundedCount: readRequiredMetric(value, 'refunded_count'),
    failedCount: readRequiredMetric(value, 'failed_count'),
    averageTicketMinor: readRequiredMetric(value, 'average_ticket_minor'),
    consentedSessionCount: readRequiredMetric(value, 'consented_session_count'),
    pageViewCount: readRequiredMetric(value, 'page_view_count'),
    pageViewSessionCount: readRequiredMetric(value, 'page_view_session_count'),
    productViewSessionCount: readRequiredMetric(value, 'product_view_session_count'),
    cartAddSessionCount: readRequiredMetric(value, 'cart_add_session_count'),
    manualPaymentClickCount: readRequiredMetric(value, 'manual_payment_click_count'),
    manualPaymentClickSessionCount: readRequiredMetric(value, 'manual_payment_click_session_count'),
    whatsappOpenCount: readRequiredMetric(value, 'whatsapp_open_count'),
    whatsappOpenSessionCount: readRequiredMetric(value, 'whatsapp_open_session_count'),
  });
}

function parseOrders(value: unknown): readonly AdminOrder[] {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    throw new Error('La lista de pedidos no tiene un formato válido.');
  }
  return Object.freeze(value.rows.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('La lista de pedidos no tiene un formato válido.');
    return Object.freeze({
      id: readRequiredText(candidate, 'id'),
      channel: readNullableText(candidate.channel),
      status: readRequiredText(candidate, 'status'),
      currency: readRequiredText(candidate, 'currency'),
      totalMinor: readRequiredMetric(candidate, 'total_minor'),
      itemCount: readRequiredMetric(candidate, 'item_count'),
      deliveryMethod: readNullableText(candidate.delivery_method),
      fullName: readNullableText(candidate.full_name),
      lastErrorCode: readNullableText(candidate.last_error_code),
      createdAt: readRequiredText(candidate, 'created_at'),
    });
  }));
}

function parseOrderDetail(value: unknown): AdminOrderDetail {
  if (!isRecord(value) || !isRecord(value.order) || !Array.isArray(value.items) || !Array.isArray(value.payments)) {
    throw new Error('El detalle del pedido no tiene un formato válido.');
  }
  const order = value.order;
  return Object.freeze({
    order: Object.freeze({
      id: readRequiredText(order, 'id'),
      channel: readNullableText(order.channel),
      status: readRequiredText(order, 'status'),
      currency: readRequiredText(order, 'currency'),
      totalMinor: readRequiredMetric(order, 'total_minor'),
      productsTotalMinor: readRequiredMetric(order, 'products_total_minor'),
      shippingMinor: readRequiredMetric(order, 'shipping_minor'),
      itemCount: readRequiredMetric(order, 'item_count'),
      createdAt: readRequiredText(order, 'created_at'),
      updatedAt: readRequiredText(order, 'updated_at'),
      approvedAt: readNullableText(order.approved_at),
      resolvedAt: readNullableText(order.resolved_at),
      resolvedBy: readNullableText(order.resolved_by),
      lastErrorCode: readNullableText(order.last_error_code),
      preferenceId: readNullableText(order.mp_preference_id),
      stockReservedAt: readNullableText(order.stock_reserved_at),
      stockReservationExpiresAt: readNullableText(order.stock_reservation_expires_at),
      stockConsumedAt: readNullableText(order.stock_consumed_at),
      stockReservationState: readRequiredText(order, 'stock_reservation_state'),
      deliveryMethod: readNullableText(order.delivery_method),
      fullName: readNullableText(order.full_name),
      phone: readNullableText(order.phone),
      address: readNullableText(order.address),
      locality: readNullableText(order.locality),
      province: readNullableText(order.province),
      postalCode: readNullableText(order.postal_code),
      totalWeightGrams: readNullableInteger(order.total_weight_grams),
    }),
    items: Object.freeze(value.items.map((candidate) => parseOrderItem(candidate))),
    payments: Object.freeze(value.payments.map((candidate) => parsePayment(candidate))),
  });
}

function parseOrderItem(value: unknown): AdminOrderDetail['items'][number] {
  if (!isRecord(value)) throw new Error('Los items del pedido no tienen un formato válido.');
  return Object.freeze({
    productId: readRequiredText(value, 'product_id'),
    name: readNullableText(value.name),
    presentation: readNullableText(value.presentation),
    sku: readNullableText(value.sku),
    quantity: readRequiredMetric(value, 'quantity'),
    unitPriceMinor: readRequiredMetric(value, 'unit_price_minor'),
    subtotalMinor: readRequiredMetric(value, 'subtotal_minor'),
    stockControlled: readRequiredFlag(value, 'stock_controlled'),
  });
}

function parsePayment(value: unknown): AdminOrderDetail['payments'][number] {
  if (!isRecord(value)) throw new Error('Los pagos del pedido no tienen un formato válido.');
  return Object.freeze({
    provider: readRequiredText(value, 'provider'),
    providerPaymentId: readRequiredText(value, 'provider_payment_id'),
    mappedStatus: readRequiredText(value, 'mapped_status'),
    providerStatus: readRequiredText(value, 'provider_status'),
    statusDetail: readNullableText(value.status_detail),
    amountMinor: readRequiredMetric(value, 'amount_minor'),
    currency: readRequiredText(value, 'currency'),
    approvedAt: readNullableText(value.approved_at),
    providerUpdatedAt: readNullableText(value.provider_updated_at),
    updatedAt: readRequiredText(value, 'updated_at'),
  });
}

function parseReconciliationCount(value: unknown): number {
  if (!isRecord(value) || !isRecord(value.reconciliation)) {
    throw new Error('La conciliación no tiene un formato válido.');
  }
  return readRequiredMetric(value.reconciliation, 'checkedPayments');
}

function parseRows(value: unknown): readonly UnknownRow[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('La respuesta analítica no tiene un formato válido.');
  }
  return Object.freeze(value.map((row) => Object.freeze(row)));
}

function parseRowsEnvelope(value: unknown): readonly UnknownRow[] {
  if (!isRecord(value) || !Array.isArray(value.rows) || !value.rows.every(isRecord)) {
    throw new Error('La auditoría no tiene un formato válido.');
  }
  return Object.freeze(value.rows.map((row) => Object.freeze(row)));
}

function parseTrend(value: unknown): readonly AnalyticsTrendRow[] {
  if (!Array.isArray(value)) throw new Error('La tendencia no tiene un formato válido.');
  return Object.freeze(value.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('La tendencia no tiene un formato válido.');
    return Object.freeze({
      day: readRequiredText(candidate, 'day'),
      sessionCount: readRequiredMetric(candidate, 'session_count'),
      pageViewCount: readRequiredMetric(candidate, 'page_view_count'),
      productViewCount: readRequiredMetric(candidate, 'product_view_count'),
      cartAddCount: readRequiredMetric(candidate, 'cart_add_count'),
      manualPaymentClickCount: readRequiredMetric(candidate, 'manual_payment_click_count'),
      whatsappOpenCount: readRequiredMetric(candidate, 'whatsapp_open_count'),
      checkoutRedirectCount: readRequiredMetric(candidate, 'checkout_redirect_count'),
    });
  }));
}

function readApiMessage(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') return null;
  return value.error.message.trim() || null;
}

function readText(row: UnknownRow, key: string): string {
  return readNullableText(row[key]);
}

function readRequiredText(row: UnknownRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('La respuesta administrativa no tiene un formato válido.');
  }
  return value;
}

function readNullableText(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value : '—';
}

function readNumberText(row: UnknownRow, key: string): string {
  return readNonNegativeInteger(row[key]).toLocaleString('es-AR');
}

function readRequiredMetric(row: UnknownRow, key: string): number {
  if (!(key in row) || row[key] === null || row[key] === undefined) {
    throw new Error('La respuesta administrativa no tiene un formato válido.');
  }
  const value = Number(row[key]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('La respuesta administrativa no tiene un formato válido.');
  }
  return Math.round(value);
}

function readRequiredFlag(row: UnknownRow, key: string): boolean {
  if (row[key] !== 0 && row[key] !== 1 && row[key] !== false && row[key] !== true) {
    throw new Error('La respuesta administrativa no tiene un formato válido.');
  }
  return row[key] === 1 || row[key] === true;
}

function readNonNegativeInteger(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
}

function readNullableInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return value === null || value === undefined || !Number.isSafeInteger(numeric) || numeric <= 0
    ? null
    : numeric;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMoney(value: number, currency = 'ARS'): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toLocaleString('es-AR')}`;
  }
}

function formatDate(value: string): string {
  if (value === '—') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date);
}

function formatWeight(value: number | null): string {
  if (value === null) return '—';
  return value >= 1_000
    ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value / 1_000)} kg`
    : `${value.toLocaleString('es-AR')} g`;
}

function deliveryLabel(value: string): string {
  if (value === 'coordinated_pickup') return 'Coordinada';
  if (value === 'correo_argentino') return 'Correo Argentino';
  if (value === '—') return 'Pedido previo';
  return value;
}

function providerLabel(value: string): string {
  return value === 'mercadopago' ? 'Mercado Pago' : value;
}

function reservationStateLabel(value: string): string {
  const labels: Record<string, string> = {
    consumed: 'Consumido',
    not_controlled: 'Sin control numérico',
    released: 'Liberado',
    reserved: 'Reservado',
  };
  return labels[value] ?? value;
}

function channelLabel(value: string): string {
  if (value === 'whatsapp') return 'WhatsApp';
  if (value === 'checkout_pro') return 'Checkout Pro';
  if (value === '—') return 'Pedido previo';
  return value;
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

function orderStatusLabel(status: string, errorCode: string): string {
  return errorCode === 'WHATSAPP_RESERVATION_EXPIRED' ? 'Vencido' : humanStatus(status);
}

function orderIssueLabel(errorCode: string): string {
  return errorCode === 'WHATSAPP_RESERVATION_EXPIRED'
    ? 'La reserva venció y las unidades fueron liberadas.'
    : errorCode;
}

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format((numerator / denominator) * 100)} %`;
}

function reachLabel(value: number, total: number): string {
  const formatted = percentage(value, total);
  return formatted === '—' ? 'Sin base consentida' : `${formatted} de sesiones consentidas`;
}

function relevantEventTotal(row: AnalyticsTrendRow): number {
  return row.pageViewCount + row.productViewCount + row.cartAddCount +
    row.manualPaymentClickCount + row.whatsappOpenCount + row.checkoutRedirectCount;
}

function eventLabel(value: string): string {
  const labels: Record<string, string> = {
    page_view: 'Vista de página',
    product_view: 'Vista de producto',
    cart_add: 'Agregado al carrito',
    manual_payment_click: 'Clic en Link de Pago manual',
    whatsapp_open: 'Apertura de WhatsApp',
    checkout_start: 'Inicio de Checkout Pro integrado',
    checkout_redirect: 'Redirección de Checkout Pro integrado',
  };
  return labels[value] ?? value;
}

function eventMeaning(value: string): string {
  if (value === 'manual_payment_click') return 'Interacción manual; no confirma pago.';
  if (value === 'whatsapp_open') return 'Canal asistido; no confirma pago.';
  if (value === 'checkout_start' || value === 'checkout_redirect') {
    return 'Flujo integrado, actualmente deshabilitado.';
  }
  return 'Interacción consentida.';
}

function dimensionLabel(dimension: 'source' | 'device_class', value: string): string {
  const labels: Record<string, string> = dimension === 'source'
    ? { direct: 'Directa', referral: 'Referencia', campaign: 'Campaña', unknown: 'Desconocida' }
    : { mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio', unknown: 'Desconocido' };
  return labels[value] ?? value;
}

function sectionHeading(section: Exclude<AdminSection, 'products'>) {
  switch (section) {
    case 'summary':
      return {
        title: 'Resumen operativo',
        description: 'Interacciones consentidas y comercio confirmado, separados por su evidencia real.',
        loadingLabel: 'el resumen',
      } as const;
    case 'orders':
      return {
        title: 'Pedidos',
        description: 'Revisá pedidos, reservas y transiciones administrativas de WhatsApp.',
        loadingLabel: 'los pedidos',
      } as const;
    case 'analytics':
      return {
        title: 'Analítica first-party',
        description: 'Flujo manual, productos, fuentes, dispositivos y tendencia diaria con consentimiento.',
        loadingLabel: 'la analítica',
      } as const;
    case 'audit':
      return {
        title: 'Auditoría administrativa',
        description: 'Trazabilidad de accesos y acciones administrativas de sólo lectura.',
        loadingLabel: 'la auditoría',
      } as const;
  }
}

function exportQuery(range: AdminFilter, includeStatus: boolean): string {
  const params = new URLSearchParams({ from: range.from, to: range.to, limit: '1000' });
  if (includeStatus && range.status !== '') params.set('status', range.status);
  return params.toString();
}

function validateDateRange(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)) {
    return 'Completá un período válido.';
  }
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    return 'La fecha inicial no puede superar a la final.';
  }
  if (toTime - fromTime > 366 * 24 * 60 * 60 * 1000) {
    return 'El período no puede superar 366 días.';
  }
  return null;
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

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'La consulta fue cancelada.';
  return error instanceof Error ? error.message : 'No se pudo completar la consulta.';
}
