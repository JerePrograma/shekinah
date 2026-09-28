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
import type { Navigate } from '../routing/routes';

export type AdminSection = 'summary' | 'products' | 'inventory' | 'orders' | 'analytics' | 'audit';
type AdminReportSection = Exclude<AdminSection, 'products' | 'inventory'>;

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
  section: AdminReportSection;
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
  onOpenOrders,
  onOperationStateChange,
  onUnauthorized,
  orderOverview,
  section,
}: Readonly<{
  navigate: Navigate;
  onOpenOrders?: (() => void) | undefined;
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
  orderOverview?: ReactNode;
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
            ? 'Verificando el pago con Mercado Pago'
            : undefined,
    );
    return () => onOperationStateChange?.(false);
  }, [onOperationStateChange, orderAction]);

  useEffect(() => {
    if (section === 'products' || section === 'inventory') return undefined;
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

  if (section === 'products' || section === 'inventory') return null;

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

  function openOrderDetail(id: string, returnFocusTarget: HTMLButtonElement): void {
    if (orderAction !== null) return;
    orderDetailReturnFocusRef.current = returnFocusTarget;
    if (selectedOrderId === id) {
      document.getElementById('order-detail-title')?.focus();
      return;
    }
    setOrderDetail(null);
    setDetailError('');
    setOrderActionError('');
    setOrderActionMessage('');
    setConfirmingReject(false);
    setSelectedOrderId(id);
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
          ? 'Verificación terminada: Mercado Pago no informó pagos para este pedido.'
          : `Verificación terminada: ${checkedPayments.toLocaleString('es-AR')} pago${checkedPayments === 1 ? '' : 's'} verificado${checkedPayments === 1 ? '' : 's'} con Mercado Pago. Revisá su estado en Pagos del pedido.`,
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

  function openOrdersFromSummary(): void {
    setStatus('');
    setSubmittedRange({ ...submittedRange, status: '' });
    onOpenOrders?.();
  }

  return (
    <section className="admin-page" aria-labelledby={`admin-${section}-title`}>
      <div className="container admin-shell">
        <header className="admin-page-header">
          <div>
            <h1 id={`admin-${section}-title`} ref={sectionTitleRef} tabIndex={-1}>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>
          <ExportActions analyticsQuery={analyticsQuery} orderQuery={orderQuery} section={section} />
        </header>

        {section === 'orders' ? orderOverview : null}
        {section !== 'summary' || loading || visibleReport?.data.summary == null ? null : (
          <SummaryAttention pendingOrders={visibleReport.data.summary.preferencePendingCount + visibleReport.data.summary.pendingCount}
            onOpenOrders={onOpenOrders === undefined ? undefined : openOrdersFromSummary} />
        )}

        <form
          className="admin-filters admin-period-toolbar"
          aria-label="Período del informe"
          aria-describedby={rangeError === null ? undefined : 'admin-range-error'}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (rangeError === null) setSubmittedRange({ from, to, status });
          }}
        >
          <span className="admin-period-label">Período</span>
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
                <option value="preference_pending">Preparando pago</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
                <option value="cancelled">Cancelado</option>
                <option value="refunded">Reintegrado</option>
                <option value="failed">Fallido</option>
              </select>
            </label>
          ) : null}
          <button className="button button-secondary" type="submit" disabled={rangeError !== null || loading}>
            Actualizar período
          </button>
        </form>
        {rangeError === null ? null : (
          <p className="form-error" id="admin-range-error" role="alert">{rangeError}</p>
        )}

        {loading ? <p role="status">Cargando {heading.loadingLabel}…</p> : null}
        {visibleReport === null ? null : <PartialDataNotice issues={visibleReport.issues}
          onRetry={() => setReportRefresh(current => current + 1)} />}
        <div className={section === 'orders' ? `admin-orders-workspace${selectedOrderId === null ? '' : ' has-detail'}` : undefined}>
        <div className={section === 'orders' ? 'admin-orders-list' : undefined}>
        {visibleReport === null || loading ? null : (
          <SectionContent
            data={visibleReport.data}
            onOpenOrder={openOrderDetail}
            orderBusy={orderAction !== null}
            productNames={productNames}
            selectedOrderId={selectedOrderId}
            section={section}
          />
        )}
        </div>

        {section === 'orders' && selectedOrderId !== null ? (
          <OrderDetailPanel
            key={selectedOrderId}
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
            onRetry={() => setDetailRefresh((current) => current + 1)}
          />
        ) : null}
        </div>
      </div>
    </section>
  );
}

function SectionContent({
  data,
  onOpenOrder,
  orderBusy,
  productNames,
  selectedOrderId,
  section,
}: Readonly<{
  data: AdminData;
  onOpenOrder: (id: string, returnFocusTarget: HTMLButtonElement) => void;
  orderBusy: boolean;
  productNames: ReadonlyMap<string, string>;
  selectedOrderId: string | null;
  section: AdminReportSection;
}>) {
  switch (section) {
    case 'summary':
      return data.summary === null
        ? <UnavailableState label="el resumen" />
        : <SummaryView summary={data.summary} />;
    case 'orders':
      return data.orders === null
        ? <UnavailableState label="los pedidos" />
        : <OrdersView busy={orderBusy} onOpenOrder={onOpenOrder} orders={data.orders} selectedOrderId={selectedOrderId} />;
    case 'analytics':
      return (
        <AnalyticsView
          data={data}
          productNames={productNames}
        />
      );
    case 'audit':
      return data.audit === null
        ? <UnavailableState label="la actividad" />
        : <AuditView rows={data.audit} />;
  }
}

function SummaryAttention({ onOpenOrders, pendingOrders }: Readonly<{
  onOpenOrders?: (() => void) | undefined;
  pendingOrders: number;
}>) {
  return (
      <section className={`admin-summary-attention${pendingOrders === 0 ? ' is-clear' : ''}`} aria-labelledby="summary-attention-title">
        <div>
          <h2 id="summary-attention-title">{pendingOrders === 0 ? 'Sin pedidos pendientes' : 'Necesita tu atención'}</h2>
          <p>{pendingOrders === 0 ? 'No hay pedidos pendientes en este período.'
            : `${pendingOrders.toLocaleString('es-AR')} pedido${pendingOrders === 1 ? '' : 's'} pendiente${pendingOrders === 1 ? '' : 's'} en este período.`}</p>
        </div>
        {onOpenOrders === undefined ? null : <button className={`button ${pendingOrders === 0 ? 'button-secondary' : 'button-primary'}`} type="button" onClick={onOpenOrders}>
          {pendingOrders === 0 ? 'Ver pedidos' : 'Revisar pedidos'}
        </button>}
      </section>
  );
}

function SummaryView({ summary }: Readonly<{ summary: AdminSummary }>) {
  return (
    <div className="admin-dashboard-stack">
      <section className="admin-metric-group" aria-labelledby="financial-summary-title">
        <div className="admin-subsection-heading">
          <h2 id="financial-summary-title">Pedidos y cobros</h2>
        </div>
        <dl className="admin-summary-grid admin-financial-metrics">
          <Metric label="Pedidos registrados" value={summary.orderCount} />
          <Metric label="Pedidos con pago confirmado" value={summary.approvedCount} />
          <Metric label="Importe de pedidos pagados" value={formatMoney(summary.approvedRevenueMinor)} />
          <Metric label="Promedio por pedido pagado" value={formatMoney(summary.averageTicketMinor)} />
        </dl>
        <p className="admin-context-note">
          Los cobros incluyen sólo pedidos aprobados con un pago confirmado. Aprobar un pedido
          de WhatsApp no confirma que esté pagado.
        </p>
        <details className="admin-report-secondary"><summary>Ver desglose de pedidos y pagos</summary>
          <dl className="admin-summary-grid">
            <Metric label="Pagos aprobados" value={summary.approvedPaymentCount} />
            <Metric label="Pedidos pendientes" value={summary.pendingCount} />
            <Metric label="Pedidos preparando el pago" value={summary.preferencePendingCount} />
            <Metric label="Pedidos rechazados" value={summary.rejectedCount} />
            <Metric label="Pedidos cancelados" value={summary.cancelledCount} />
            <Metric label="Pedidos reintegrados" value={summary.refundedCount} />
            <Metric label="Pedidos con error" value={summary.failedCount} />
          </dl>
          <p>Un pedido puede tener más de un registro de pago. Los pagos y los pedidos se cuentan por separado.</p>
        </details>
      </section>

      <details className="admin-report-secondary"><summary>Ver visitas al sitio</summary>
      <section className="admin-metric-group" aria-labelledby="interaction-summary-title">
        <div className="admin-subsection-heading">
          <h2 id="interaction-summary-title">Visitas al sitio</h2>
          <p>Sólo se cuentan las visitas que aceptaron la medición. Una persona puede visitar el sitio más de una vez.</p>
        </div>
        <dl className="admin-summary-grid admin-summary-grid-interaction">
          <Metric label="Visitas registradas" value={summary.consentedSessionCount} />
          <Metric
            label="Visitas que vieron productos"
            value={summary.productViewSessionCount}
            note={reachLabel(summary.productViewSessionCount, summary.consentedSessionCount)}
          />
          <Metric
            label="Visitas que agregaron al carrito"
            value={summary.cartAddSessionCount}
            note={reachLabel(summary.cartAddSessionCount, summary.consentedSessionCount)}
          />
          <Metric
            label="Visitas que abrieron WhatsApp"
            value={summary.whatsappOpenSessionCount}
            note={`${summary.whatsappOpenCount.toLocaleString('es-AR')} aperturas`}
          />
        </dl>
      </section>

      <p className="admin-context-note">Las visitas, los clics y las aperturas de WhatsApp no confirman pagos.</p>
      </details>

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
  busy,
  onOpenOrder,
  orders,
  selectedOrderId,
}: Readonly<{
  busy: boolean;
  onOpenOrder: (id: string, returnFocusTarget: HTMLButtonElement) => void;
  orders: readonly AdminOrder[];
  selectedOrderId: string | null;
}>) {
  return (
    <AdminTable
      caption="Pedidos del período y pedidos de WhatsApp pendientes"
      className="admin-orders-table"
      rowClassNames={orders.map(order => order.id === selectedOrderId ? 'is-selected' : '')}
      stackOnMobile
      columns={['Pedido y cliente', 'Estado del pedido', 'Entrega', 'Total', 'Acción']}
      rows={orders.map((order) => [
        <div className="admin-order-identity"><strong>{formatOrderNumber(order.id)}</strong>
          <span>{order.fullName}</span><small>{formatDate(order.createdAt)} · {channelLabel(order.channel)}</small></div>,
        <div><StatusBadge status={order.status} label={orderStatusLabel(order.status, order.lastErrorCode)} />
          {order.lastErrorCode === '—' ? null : <p className="admin-order-issue">{orderIssueLabel(order.lastErrorCode)}</p>}</div>,
        <span className="admin-badge admin-badge-neutral">{deliveryLabel(order.deliveryMethod)}</span>,
        formatMoney(order.totalMinor, order.currency),
        <button
          className="button button-tertiary admin-table-action"
          type="button"
          aria-controls={order.id === selectedOrderId ? 'admin-order-detail' : undefined}
          aria-expanded={order.id === selectedOrderId}
          disabled={busy}
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
      {data.summary === null ? null : <section className="admin-metric-group" aria-labelledby="visit-summary-title">
        <h2 id="visit-summary-title">Recorrido de las visitas</h2>
        <dl className="admin-summary-grid">
          <Metric label="Visitas registradas" value={data.summary.consentedSessionCount} />
          <Metric label="Vieron productos" value={data.summary.productViewSessionCount} />
          <Metric label="Agregaron al carrito" value={data.summary.cartAddSessionCount} />
          <Metric label="Abrieron WhatsApp" value={data.summary.whatsappOpenSessionCount} />
        </dl>
      </section>}
      <InteractionNotice />
      {data.funnel === null ? <UnavailableState label="las acciones de las visitas" /> : (
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
      <details><summary>Historial del anterior enlace de pago</summary>
        {data.summary === null ? <UnavailableState label="el historial del enlace de pago" /> : <ManualFlow summary={data.summary} />}
      </details>
    </div>
  );
}

function InteractionNotice() {
  return (
    <p className="admin-semantic-notice">
      Se cuentan visitas con consentimiento, no personas únicas. Los clics para pagar o abrir WhatsApp no confirman pagos.
    </p>
  );
}

function ManualFlow({ summary }: Readonly<{ summary: AdminSummary }>) {
  const stages = [
    ['Visitas registradas', summary.consentedSessionCount],
    ['Ven productos', summary.productViewSessionCount],
    ['Agregan al carrito', summary.cartAddSessionCount],
    ['Histórico: abrieron Link de Pago manual', summary.manualPaymentClickSessionCount],
  ] as const;
  return (
    <section className="admin-flow" aria-labelledby="manual-flow-title">
      <div className="admin-subsection-heading">
        <h2 id="manual-flow-title">Historial del enlace de pago retirado</h2>
        <p>El anterior enlace de pago ya no se ofrece en la tienda. Sus clics se conservan como historial y no confirman pagos.</p>
      </div>
      <ol>
        {stages.map(([label, count]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{count.toLocaleString('es-AR')}</strong>
            <small>{label === 'Visitas registradas' ? 'Base del período' : reachLabel(count, summary.consentedSessionCount)}</small>
          </li>
        ))}
      </ol>
      <div className="admin-assisted-channel">
        <span>Visitas que abrieron WhatsApp</span>
        <strong>{summary.whatsappOpenSessionCount.toLocaleString('es-AR')}</strong>
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
      caption="Qué hacen las visitas"
      columns={['Acción', 'Veces que ocurrió', 'Visitas', 'Qué significa']}
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
      caption="Productos más consultados"
      columns={['Producto', 'Vistas', 'Agregados al carrito', 'Visitas que vieron y agregaron', 'Porcentaje que agregó al carrito']}
      rows={rows.map((row) => {
        const id = readText(row, 'product_id');
        const viewSessions = readNonNegativeInteger(row.view_sessions);
        const convertedSessions = readNonNegativeInteger(row.converted_sessions);
        return [
          productNames.get(id) ?? <div>Producto no disponible<details><summary>Información para soporte</summary>{id}</details></div>,
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
      columns={[title.slice(0, -1), 'Visitas', 'Acciones', 'Porcentaje de acciones']}
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
        <h2 id="analytics-trend-title">Tendencia diaria</h2>
        <p>Visitas registradas y acciones realizadas dentro del período.</p>
      </div>
      {rows.length === 0 ? <p>No hay días para el rango seleccionado.</p> : (
        <ul className="admin-trend-chart" aria-label="Evolución diaria de visitas y acciones">
          {rows.map((row, index) => (
            <li key={row.day}>
              <time dateTime={row.day}>{formatDay(row.day)}</time>
              <label>
                <span>Visitas: {row.sessionCount.toLocaleString('es-AR')}</span>
                <progress max={maxSessions} value={row.sessionCount} />
              </label>
              <label>
                <span>Acciones: {(eventTotals[index] ?? 0).toLocaleString('es-AR')}</span>
                <progress max={maxEvents} value={eventTotals[index] ?? 0} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Ver cifras por día</summary>
        <AdminTable
          caption="Visitas y acciones por día"
          columns={[
            'Día', 'Visitas', 'Páginas', 'Productos', 'Carrito',
            'Enlace de pago anterior', 'WhatsApp', 'Ir a pagar',
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
      caption="Historial de actividad"
      stackOnMobile
      className="admin-activity-table"
      columns={['Actividad', 'Fecha', 'Resultado', 'Detalle']}
      rows={rows.map((row) => {
        const outcome = readNonNegativeInteger(row.outcome_status);
        return [
          <div className="admin-activity-entry"><strong>{auditActionLabel(readText(row, 'action'))}</strong>
            <span>{readText(row, 'actor_email')}</span>
            {readText(row, 'target_type') === 'order' && readText(row, 'target_id').startsWith('ord_')
              ? <small>Pedido {formatOrderNumber(readText(row, 'target_id'))}</small> : null}</div>,
          formatDate(readText(row, 'created_at')),
          <span className={`admin-badge admin-badge-${outcome >= 200 && outcome < 400 ? 'success' : 'warning'}`}>
            {outcome >= 200 && outcome < 400 ? 'Completada' : outcome === 401 || outcome === 403 ? 'Acceso no autorizado' : 'No se completó'}</span>,
          <details><summary>Información para soporte</summary>
            <dl><dt>Acción</dt><dd>{readText(row, 'action')}</dd>
              <dt>Tipo</dt><dd>{readText(row, 'target_type')}</dd>
              <dt>Referencia</dt><dd>{readText(row, 'target_id')}</dd>
              <dt>Resultado</dt><dd>{readNumberText(row, 'outcome_status')}</dd></dl>
          </details>,
        ];
      })}
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
  onRetry,
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
  onRetry: () => void;
  orderId: string;
}>) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const rejectCancelRef = useRef<HTMLButtonElement | null>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }, [orderId]);
  useEffect(() => {
    if (!loading && detail !== null && document.activeElement === titleRef.current) {
      titleRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    }
  }, [detail, loading]);
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
      id="admin-order-detail"
      aria-labelledby="order-detail-title"
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="order-detail-title" ref={titleRef} tabIndex={-1}>Detalle de {formatOrderNumber(orderId)}</h2>
        </div>
        <button className="button button-tertiary" type="button" disabled={action !== null} onClick={onClose}>
          Cerrar detalle
        </button>
      </header>
      {loading ? <p role="status">Cargando detalle del pedido…</p> : null}
      {error === '' ? null : <div className="admin-detail-group">
        <AdminErrorMessage error={error} fallback="No pudimos cargar el detalle del pedido. Volvé a intentarlo." />
        <div><button className="button button-secondary" type="button" disabled={loading || action !== null}
          onClick={() => { titleRef.current?.focus(); onRetry(); }}>Reintentar detalle</button></div>
      </div>}
      {detail === null || loading ? null : <section className="admin-order-summary" aria-label="Resumen del pedido">
        <div><h3>{detail.order.fullName}</h3>
          <p>{channelLabel(detail.order.channel)} · {formatDate(detail.order.createdAt)}</p></div>
        <p className="admin-detail-total"><span>Total del pedido</span><strong>{formatMoney(detail.order.totalMinor, detail.order.currency)}</strong></p>
        <div className="admin-order-statuses">
          <StatusBadge status={detail.order.status} label={`Pedido: ${orderStatusLabel(detail.order.status, detail.order.lastErrorCode)}`} />
          <span className="admin-badge admin-badge-neutral">{deliveryLabel(detail.order.deliveryMethod)}</span>
        </div>
        <p className="admin-context-note">{reservationStateLabel(detail.order.stockReservationState)}</p>
      </section>}
      {detail === null || loading || detail.order.lastErrorCode === '—' || detail.order.lastErrorCode === '' ? null : (
        <p className="admin-partial-warning">{orderIssueLabel(detail.order.lastErrorCode)}</p>
      )}
      {detail === null || loading ? null : <AdminTable
        caption="Pagos del pedido"
        emptyMessage="No hay pagos registrados para este pedido."
        stackOnMobile
        className="admin-order-payments"
        columns={['Estado del pago', 'Importe', 'Proveedor']}
        rows={detail.payments.map((payment) => [
          <StatusBadge status={payment.mappedStatus} label={humanStatus(payment.mappedStatus)} />,
          formatMoney(payment.amountMinor, payment.currency),
          providerLabel(payment.provider),
        ])}
      />}
      {detail?.order.channel === 'whatsapp' && detail.order.status === 'pending' ? (
        <section className="admin-order-actions" aria-labelledby="order-actions-title" aria-busy={action !== null}>
          <div>
            <h3 id="order-actions-title">Resolver pedido pendiente</h3>
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
              <h4 id="reject-order-title">Rechazar {formatOrderNumber(orderId)}</h4>
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
            <h3 id="reconcile-order-title">Consultar el estado del pago</h3>
            <p>
              Consultá el estado confirmado por Mercado Pago. El sistema actualizará el pedido
              y su reserva cuando corresponda, sin duplicar el movimiento de stock.
            </p>
            {detail.order.status === 'refunded' ? (
              <p className="admin-context-note">
                El reintegro no repone stock automáticamente. Cualquier reposición física requiere
                un ajuste en el sistema de inventario.
              </p>
            ) : null}
          </div>
          <div className="admin-inline-actions">
            <button className="button button-primary" type="button" disabled={action !== null} onClick={onReconcile}>
              {action === 'reconcile' ? 'Verificando pago…' : 'Verificar pago'}
            </button>
          </div>
        </section>
      ) : null}
      {actionMessage === '' ? null : <p className="admin-feedback admin-feedback-success" role="status">{actionMessage}</p>}
      {actionError === '' ? null : <AdminErrorMessage error={actionError}
        fallback="No pudimos confirmar el resultado de la operación. Revisá el estado del pedido antes de volver a intentarlo." />}
      {detail === null || loading ? null : <OrderDetailContent detail={detail} />}
    </article>
  );
}

function OrderDetailContent({ detail }: Readonly<{ detail: AdminOrderDetail }>) {
  const { order } = detail;
  return (
    <div className="admin-order-detail-content">
      <AdminTable
        caption={order.channel === 'whatsapp' && order.status === 'pending'
          ? 'Productos y unidades reservadas'
          : 'Productos del pedido'}
        stackOnMobile
        className="admin-order-items"
        columns={['Producto', 'Cantidad', 'Subtotal']}
        rows={detail.items.map((item) => [
          <div className="admin-order-item"><strong>{item.name === '—' ? 'Producto sin nombre disponible' : item.name}</strong>
            {item.presentation === '—' ? null : <small>{item.presentation}</small>}
            <small>{formatMoney(item.unitPriceMinor, order.currency)} por unidad</small></div>,
          item.quantity.toLocaleString('es-AR'),
          formatMoney(item.subtotalMinor, order.currency),
        ])}
      />
      <DetailGroup
        title="Totales"
        entries={[
          ['Productos', formatMoney(order.productsTotalMinor, order.currency)],
          ['Envío', formatMoney(order.shippingMinor, order.currency)],
          ['Unidades', order.itemCount.toLocaleString('es-AR')],
          ['Peso', formatWeight(order.totalWeightGrams)],
        ]}
      />
      <DetailGroup
        title="Contacto y entrega"
        entries={[
          ['Teléfono', order.phone],
          ['Dirección', order.address],
          ['Localidad', order.locality],
          ['Provincia', order.province],
          ['Código postal', order.postalCode],
        ]}
      />
      <details className="admin-report-secondary"><summary>Reserva e inventario</summary>
        <DetailGroup title="Seguimiento de la reserva" entries={[
          ['Reserva creada', formatDate(order.stockReservedAt)],
          ['Vencimiento de reserva', formatDate(order.stockReservationExpiresAt)],
          ['Stock descontado', formatDate(order.stockConsumedAt)],
          ['Política de reintegro', 'No repone stock automáticamente'],
        ]} />
      </details>
      <details className="admin-order-technical">
        <summary>Información para soporte</summary>
        <DetailGroup title="Registro del pedido" entries={[
          ['ID interno', order.id],
          ['Creación', formatDate(order.createdAt)],
          ['Actualización', formatDate(order.updatedAt)],
          ['Aprobación', formatDate(order.approvedAt)],
          ['Resolución', formatDate(order.resolvedAt)],
          ['Resuelto por', order.resolvedBy],
          ['Moneda', order.currency],
          ['Preferencia Mercado Pago', order.preferenceId],
          ['Código de incidencia', order.lastErrorCode],
          ['Estado del pedido', order.status],
          ['Estado de la reserva', order.stockReservationState],
          ['Modalidad', order.deliveryMethod],
          ['Canal', order.channel],
        ]} />
        <AdminTable caption="Referencias de productos" columns={['Producto', 'Código de producto', 'ID', 'Control de stock']}
          rows={detail.items.map(item => [item.name, item.sku, item.productId, item.stockControlled ? 'Sí' : 'No'])} />
        <AdminTable caption="Referencias de pagos" emptyMessage="No hay referencias de pagos para este pedido."
          columns={['Proveedor', 'ID proveedor', 'Estado proveedor', 'Detalle', 'Aprobación', 'Última actualización']}
          rows={detail.payments.map(payment => [providerLabel(payment.provider), payment.providerPaymentId,
            payment.providerStatus, payment.statusDetail, formatDate(payment.approvedAt),
            formatDate(payment.providerUpdatedAt === '—' ? payment.updatedAt : payment.providerUpdatedAt)])} />
      </details>
      <p className="admin-context-note">
        Los importes y datos registrados no se editan desde esta vista. Sólo los pedidos
        de WhatsApp pendientes admiten aprobación o rechazo. Para los pagos en línea, usá
        Verificar pago para consultar Mercado Pago.
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
      <h3>{title}</h3>
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
}: Readonly<{ analyticsQuery: string; orderQuery: string; section: AdminReportSection }>) {
  if (section === 'audit') return null;
  return (
    <div className="admin-export-actions" role="group" aria-label="Exportaciones">
      {section === 'summary' || section === 'orders' ? (
        <a className="button button-tertiary" href={`/api/admin/exports/orders.csv?${orderQuery}`}>
          Descargar pedidos (CSV)
        </a>
      ) : null}
      {section === 'summary' || section === 'analytics' ? (
        <a className="button button-tertiary" href={`/api/admin/exports/analytics.csv?${analyticsQuery}`}>
          Descargar visitas (CSV)
        </a>
      ) : null}
    </div>
  );
}

function PartialDataNotice({ issues, onRetry }: Readonly<{ issues: readonly string[]; onRetry: () => void }>) {
  if (issues.length === 0) return null;
  return (
    <div className="admin-partial-warning" role="alert">
      <p>No pudimos cargar todos los datos. Podés seguir consultando las secciones disponibles.</p>
      <p>Falta cargar: {issues.map(issue => issue.split(':')[0]).join(', ')}.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Volver a cargar</button>
      <details><summary>Información para soporte</summary>
        <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      </details>
    </div>
  );
}

function UnavailableState({ label }: Readonly<{ label: string }>) {
  return <p className="admin-unavailable-state">No se pudo mostrar {label}.</p>;
}

function AdminErrorMessage({ error, fallback }: Readonly<{ error: string; fallback: string }>) {
  const message = adminErrorLabel(error, fallback);
  return <div>
    <p className="form-error" role="alert">{message}</p>
    {message === error ? null : <details><summary>Información para soporte</summary><p>{error}</p></details>}
  </div>;
}

function AdminTable({
  caption,
  className = '',
  columns,
  emptyMessage = 'No hay datos para el período seleccionado.',
  rows,
  rowClassNames,
  stackOnMobile = false,
}: Readonly<{
  caption: string;
  className?: string;
  columns: readonly string[];
  emptyMessage?: string;
  rows: readonly (readonly ReactNode[])[];
  rowClassNames?: readonly string[];
  stackOnMobile?: boolean;
}>) {
  return (
    <div className="admin-table-wrap">
      <table className={`admin-table${stackOnMobile ? ' admin-table-mobile-stack' : ''} ${className}`} role={stackOnMobile ? 'table' : undefined}>
        <caption>{caption}</caption>
        <thead role={stackOnMobile ? 'rowgroup' : undefined}>
          <tr role={stackOnMobile ? 'row' : undefined}>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr>
        </thead>
        <tbody role={stackOnMobile ? 'rowgroup' : undefined}>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={`${caption}-${rowIndex}`} className={rowClassNames?.[rowIndex]} role={stackOnMobile ? 'row' : undefined}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} role={stackOnMobile ? 'cell' : undefined}>
                {stackOnMobile ? <span className="admin-mobile-cell-label" aria-hidden="true">{columns[cellIndex]}</span> : null}{cell}
              </td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadAdminReport(
  section: AdminReportSection,
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
  section: AdminReportSection,
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
    throw new Error(readApiMessage(payload, response.status));
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
    throw new Error(readApiMessage(payload, response.status));
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

function readApiMessage(value: unknown, status: number): string {
  if (!isRecord(value) || !isRecord(value.error)) return `HTTP ${status}`;
  const code = typeof value.error.code === 'string' ? value.error.code : `HTTP ${status}`;
  const message = typeof value.error.message === 'string' ? value.error.message.trim() : '';
  return message === '' ? code : `${code}: ${message}`;
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
  if (value === 'coordinated_pickup') return 'Retiro coordinado';
  if (value === 'correo_argentino') return 'Correo Argentino';
  if (value === '—') return 'Pedido previo';
  return 'Consultar detalle de entrega';
}

function providerLabel(value: string): string {
  return value === 'mercadopago' ? 'Mercado Pago' : 'Otro medio de pago';
}

function reservationStateLabel(value: string): string {
  const labels: Record<string, string> = {
    consumed: 'Stock descontado',
    not_controlled: 'Sin control de cantidades',
    released: 'Unidades liberadas',
    reserved: 'Unidades reservadas',
  };
  return Object.hasOwn(labels, value) ? labels[value]! : 'Requiere revisión';
}

function channelLabel(value: string): string {
  if (value === 'whatsapp') return 'WhatsApp';
  if (value === 'checkout_pro') return 'Pago en línea';
  if (value === '—') return 'Pedido previo';
  return 'Otro canal';
}

function humanStatus(value: string): string {
  const labels: Record<string, string> = {
    preference_pending: 'Preparando pago',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
    refunded: 'Reintegrado',
    failed: 'Con error',
  };
  return Object.hasOwn(labels, value) ? labels[value]! : 'Requiere revisión';
}

function StatusBadge({ status, label }: Readonly<{ status: string; label: string }>) {
  const tone = status === 'approved' ? 'success'
    : status === 'failed' || status === 'rejected' ? 'danger'
      : status === 'refunded' ? 'info'
        : status === 'cancelled' ? 'neutral' : 'warning';
  return <span className={`admin-badge admin-badge-${tone}`}>{label}</span>;
}

function orderStatusLabel(status: string, errorCode: string): string {
  return errorCode === 'WHATSAPP_RESERVATION_EXPIRED' ? 'Vencido' : humanStatus(status);
}

function orderIssueLabel(errorCode: string): string {
  const messages: Record<string, string> = {
    WHATSAPP_RESERVATION_EXPIRED: 'La reserva venció y las unidades fueron liberadas.',
    DUX_ORDER_RECONCILIATION_REQUIRED: 'Revisá la reserva de este pedido en Dux antes de continuar.',
    DUX_ORDER_LIFECYCLE_UNAVAILABLE: 'La reserva en Dux necesita revisión antes de continuar.',
    STOCK_RECONCILIATION_REQUIRED: 'Las cantidades reservadas necesitan revisión antes de continuar.',
  };
  return Object.hasOwn(messages, errorCode) ? messages[errorCode]!
    : 'Este pedido tiene una incidencia. Abrí el detalle para revisar el pago y la reserva.';
}

function adminErrorLabel(error: string, fallback: string): string {
  const code = error.split(':')[0] ?? '';
  const messages: Record<string, string> = {
    ORDER_NOT_FOUND: 'No encontramos el pedido. Volvé al listado y actualizalo.',
    'HTTP 404': 'No encontramos el pedido. Volvé al listado y actualizalo.',
    'HTTP 429': 'Se hicieron muchas consultas seguidas. Esperá un momento y volvé a intentarlo.',
    ORDER_CHANNEL_CONFLICT: 'Este pedido no admite esta acción. Revisá su canal y estado actualizado.',
    PAYMENT_ORDER_MISMATCH: 'El pago informado no coincide con este pedido. Revisá los datos con soporte antes de continuar.',
    PAYMENT_IDENTITY_CONFLICT: 'El pago está asociado a otro pedido. Pedí ayuda a soporte antes de continuar.',
    DUX_ORDER_LIFECYCLE_UNAVAILABLE: 'No pudimos actualizar la reserva en Dux. Revisá el estado del pago y pedí ayuda antes de continuar.',
    DUX_ORDER_RECONCILIATION_REQUIRED: 'Revisá los productos y la reserva de este pedido en Dux antes de cambiar su estado.',
    STOCK_RECONCILIATION_REQUIRED: 'Las cantidades reservadas necesitan revisión antes de continuar.',
    WHATSAPP_RESERVATION_EXPIRED: 'La reserva venció. Revisá el estado actualizado del pedido.',
    ORDER_STATE_CONFLICT: 'El pedido cambió. Revisá su estado actualizado antes de continuar.',
    ADMIN_AUDIT_UNAVAILABLE: 'No pudimos registrar la operación. Revisá el pedido y pedí ayuda antes de volver a intentarlo.',
  };
  if (error === 'La sesión administrativa venció.') return 'Tu sesión venció. Ingresá nuevamente.';
  return Object.hasOwn(messages, code) ? messages[code]! : fallback;
}

function auditActionLabel(value: string): string {
  const labels: Record<string, string> = {
    'admin.summary.read': 'Consulta del resumen',
    'admin.orders.list': 'Consulta de pedidos',
    'admin.order.read': 'Consulta de un pedido',
    'admin.order.approve': 'Aprobación de pedido',
    'admin.order.reject': 'Rechazo de pedido',
    'admin.order.reconcile': 'Verificación de pago',
    'admin.order.assisted_dux_lifecycle': 'Gestión de reserva en Dux',
    'admin.web_requests.list': 'Consulta de compras web',
    'admin.web_requests.detail': 'Consulta de una compra web',
    'admin.web_requests.resolve': 'Respuesta a una solicitud de compra',
    'admin.web_requests.direct_checkout_resume': 'Reintento de preparación de compra',
    'admin.web_requests.assisted_checkout_state': 'Consulta de preparación de compra',
    'admin.web_requests.assisted_checkout_prepare': 'Preparación de compra con asistencia',
    'admin.commerce.attention': 'Consulta de pedidos que necesitan revisión',
    'admin.commerce.readiness': 'Consulta del estado de la tienda',
    'admin.dux.status': 'Consulta de la conexión con Dux',
    'admin.dux.sync': 'Actualización de datos desde Dux',
    'admin.audit.list': 'Consulta del historial de actividad',
    'admin.orders.export': 'Descarga de pedidos',
    'admin.analytics.export': 'Descarga de visitas',
    'admin.mercadolibre.authorize': 'Conexión con Mercado Libre',
    'admin.mercadolibre.status': 'Consulta de la conexión con Mercado Libre',
    'admin.mercadolibre.sync': 'Actualización de datos desde Mercado Libre',
    'admin.mercadolibre.editorial.status': 'Consulta de publicaciones de Mercado Libre',
    'admin.mercadolibre.editorial.sync': 'Consulta de publicaciones para actualizar textos y fotos',
    'admin.mercadolibre.editorial.review.read': 'Consulta de textos y fotos pendientes de revisión',
    'admin.mercadolibre.editorial.review.decide': 'Revisión de textos y fotos de Mercado Libre',
  };
  if (value.startsWith('admin.analytics.')) return 'Consulta de visitas de la tienda';
  return Object.hasOwn(labels, value) ? labels[value]! : 'Otra actividad registrada';
}

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format((numerator / denominator) * 100)} %`;
}

function reachLabel(value: number, total: number): string {
  const formatted = percentage(value, total);
  return formatted === '—' ? 'Sin visitas registradas' : `${formatted} de las visitas registradas`;
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
    manual_payment_click: 'Historial: clic en el anterior enlace de pago',
    whatsapp_open: 'Apertura de WhatsApp',
    checkout_start: 'Inicio de compra en línea',
    checkout_redirect: 'Ir a Mercado Pago',
  };
  return Object.hasOwn(labels, value) ? labels[value]! : 'Otra acción';
}

function eventMeaning(value: string): string {
  if (value === 'manual_payment_click') return 'Enlace anterior, ya retirado; no confirma pago.';
  if (value === 'whatsapp_open') return 'Abrió WhatsApp; no confirma pago.';
  if (value === 'checkout_start' || value === 'checkout_redirect') {
    return 'Avanzó hacia el pago; no confirma que haya pagado.';
  }
  return 'Acción registrada con consentimiento.';
}

function dimensionLabel(dimension: 'source' | 'device_class', value: string): string {
  const labels: Record<string, string> = dimension === 'source'
    ? { direct: 'Directa', referral: 'Referencia', campaign: 'Campaña', unknown: 'Desconocida' }
    : { mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio', unknown: 'Desconocido' };
  return Object.hasOwn(labels, value) ? labels[value]! : 'Otro';
}

function sectionHeading(section: AdminReportSection) {
  switch (section) {
    case 'summary':
      return {
        title: 'Inicio',
        description: 'Lo que necesita atención en tu tienda.',
        loadingLabel: 'el resumen',
      } as const;
    case 'orders':
      return {
        title: 'Pedidos',
        description: 'Gestioná las compras de tus clientes.',
        loadingLabel: 'los pedidos',
      } as const;
    case 'analytics':
      return {
        title: 'Visitas',
        description: 'Conocé cómo llegan y qué consultan en tu tienda.',
        loadingLabel: 'las visitas',
      } as const;
    case 'audit':
      return {
        title: 'Actividad',
        description: 'El historial de acciones de tu negocio.',
        loadingLabel: 'la actividad',
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
