import { useRef, useState } from 'react';

type PreviewLine = Readonly<{
  productId: string; duxCode: string; name: string; quantity: number; unitPriceMinor: number; subtotalMinor: number;
}>;
type Preview = Readonly<{
  requestId: string; catalogVersion: string; catalogObservedAt: string; lines: readonly PreviewLine[];
  itemCount: number; productsTotalMinor: number; deliveryMethod: 'coordinated_pickup' | 'correo_argentino';
  shippingMinor: number | null; totalMinor: number | null;
}>;
type Prepared = Readonly<{
  orderId: string; requestId: string; duxOrderNumber: string; duxOrderId: string | null; catalogVersion: string;
  itemCount: number; productsTotalMinor: number; shippingMinor: number; totalMinor: number;
  reservationStatus: 'confirmed' | 'released' | 'finalized' | 'requires_review';
  paymentStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  paymentRequiresReview: boolean;
}>;
type State = Readonly<{ state: 'preview'; preview: Preview }> | Readonly<{ state: 'prepared'; prepared: Prepared }>;
type LifecycleAction = 'release' | 'finalize';

export function AssistedCheckoutAdminPanel({ requestId, onUnauthorized, onBusyChange }: Readonly<{
  requestId: string; onUnauthorized: () => void; onBusyChange: (busy: boolean, label?: string) => void;
}>) {
  const [state, setState] = useState<State | null>(null);
  const [duxOrderNumber, setDuxOrderNumber] = useState('');
  const [duxOrderId, setDuxOrderId] = useState('');
  const [shippingAmount, setShippingAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState<LifecycleAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  async function load(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); onBusyChange(true, 'Consultando preparación Dux');
    try {
      const response = await fetch(`/api/admin/web-order-requests/${requestId}/prepare`, {
        credentials: 'same-origin', redirect: 'error',
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error('No se pudo consultar la preparación del cobro.');
      const next = parseState(await response.json(), requestId);
      setState(next);
      setLifecycleConfirmation(null);
      if (next.state === 'preview') {
        if (next.preview.deliveryMethod === 'coordinated_pickup') setShippingAmount('0');
      }
    } catch (failure: unknown) { setError(message(failure)); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  async function prepare(): Promise<void> {
    if (busyRef.current || state?.state !== 'preview') return;
    const shippingMinor = state.preview.deliveryMethod === 'coordinated_pickup' ? 0 : moneyToMinor(shippingAmount);
    if (duxOrderNumber.trim() === '' || shippingMinor === null || !confirmed) {
      setConfirming(false);
      setError('Completá el número Dux, la cotización de envío si corresponde y la confirmación de reserva.');
      return;
    }
    busyRef.current = true; setBusy(true); setError(''); onBusyChange(true, 'Preparando cobro asistido');
    try {
      const response = await fetch(`/api/admin/web-order-requests/${requestId}/prepare`, {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          duxOrderNumber: duxOrderNumber.trim(),
          duxOrderId: duxOrderId.trim() === '' ? null : duxOrderId.trim(),
          shippingMinor,
          confirmedExactReservation: true,
        }),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await errorMessage(response, 'No se pudo confirmar la preparación del cobro.'));
      const next = await reloadPreparedState();
      setState(next);
      setConfirming(false);
    } catch (failure: unknown) { setConfirming(false); setError(message(failure)); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  async function confirmLifecycle(): Promise<void> {
    if (busyRef.current || state?.state !== 'prepared' || lifecycleConfirmation === null) return;
    const action = lifecycleConfirmation;
    if (lifecycleActionFor(state.prepared) !== action) {
      setLifecycleConfirmation(null);
      setError('El estado del pedido cambió. Actualizá antes de confirmar una operación Dux.');
      return;
    }
    busyRef.current = true; setBusy(true); setError('');
    onBusyChange(true, action === 'release' ? 'Confirmando liberación Dux' : 'Confirmando finalización Dux');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(state.prepared.orderId)}/dux-lifecycle`, {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, confirmedInDux: true }),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) {
        throw new Error(await errorMessage(response, action === 'release'
          ? 'No se pudo confirmar la liberación Dux.'
          : 'No se pudo confirmar la finalización Dux.'));
      }
      const next = await reloadPreparedState();
      const expected = action === 'release' ? 'released' : 'finalized';
      if (next.state !== 'prepared' || next.prepared.orderId !== state.prepared.orderId || next.prepared.reservationStatus !== expected) {
        throw new Error('La operación fue recibida, pero su estado persistido no pudo volver a verificarse.');
      }
      setState(next);
      setLifecycleConfirmation(null);
    } catch (failure: unknown) { setLifecycleConfirmation(null); setError(message(failure)); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  async function reloadPreparedState(): Promise<State> {
    const persisted = await fetch(`/api/admin/web-order-requests/${requestId}/prepare`, {
      credentials: 'same-origin', redirect: 'error',
    });
    if (persisted.status === 401) {
      onUnauthorized();
      throw new Error('La sesión administrativa venció.');
    }
    if (!persisted.ok) throw new Error('No se pudo volver a verificar el estado persistido del pedido.');
    return parseState(await persisted.json(), requestId);
  }

  const lifecycleAction = state?.state === 'prepared' ? lifecycleActionFor(state.prepared) : null;

  return <section className="web-request-panel" aria-labelledby={`assisted-checkout-${requestId}`} aria-busy={busy}>
    <h4 id={`assisted-checkout-${requestId}`}>Reserva Dux y cobro</h4>
    <p>Shekinah toma los precios de Dux. Este formulario sólo registra una reserva verificada y, si hay correo, la cotización final del envío.</p>
    {state === null ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load()}>
      {busy ? 'Consultando…' : 'Consultar preparación de cobro'}
    </button> : null}
    {error === '' ? null : <p role="alert">{error}</p>}
    {state?.state === 'preview' ? <>
      <p>Catálogo Dux observado: {formatDate(state.preview.catalogObservedAt)}.</p>
      <div className="cart-items">{state.preview.lines.map((line) => <article className="cart-line" key={line.productId}>
        <div className="cart-line-content"><h4>{line.name}</h4>
          <p>Código Dux: {line.duxCode} · Cantidad: {line.quantity} · Precio Dux actual: {formatMinor(line.unitPriceMinor)}.</p></div>
        <p className="cart-line-subtotal">{formatMinor(line.subtotalMinor)}</p>
      </article>)}</div>
      <p><strong>Productos:</strong> {formatMinor(state.preview.productsTotalMinor)}.</p>
      {state.preview.deliveryMethod === 'coordinated_pickup'
        ? <p>Retiro coordinado: envío $0.</p>
        : <label htmlFor={`assisted-shipping-${requestId}`}>Cotización final de Correo Argentino (ARS)
          <input id={`assisted-shipping-${requestId}`} type="number" min="0.01" step="0.01" inputMode="decimal"
            value={shippingAmount} disabled={busy} onChange={(event) => setShippingAmount(event.currentTarget.value)} />
        </label>}
      <label htmlFor={`assisted-dux-number-${requestId}`}>Número de pedido Dux
        <input id={`assisted-dux-number-${requestId}`} value={duxOrderNumber} disabled={busy} maxLength={120}
          onChange={(event) => setDuxOrderNumber(event.currentTarget.value)} />
      </label>
      <label htmlFor={`assisted-dux-id-${requestId}`}>ID interno Dux (opcional)
        <input id={`assisted-dux-id-${requestId}`} value={duxOrderId} disabled={busy} maxLength={120}
          onChange={(event) => setDuxOrderId(event.currentTarget.value)} />
      </label>
      <label className="whatsapp-consent" htmlFor={`assisted-confirm-${requestId}`}>
        <input id={`assisted-confirm-${requestId}`} type="checkbox" checked={confirmed} disabled={busy}
          onChange={(event) => setConfirmed(event.currentTarget.checked)} />
        <span>Confirmo que verifiqué en Dux este pedido, las cantidades exactas y la reserva de stock.</span>
      </label>
      {!confirming ? <button className="button button-primary" type="button" disabled={busy || !confirmed || duxOrderNumber.trim() === ''}
        onClick={() => { setError(''); setConfirming(true); }}>Preparar cobro</button>
        : <div role="alertdialog" aria-label="Confirmar preparación de cobro">
          <p>Se registrará la reserva Dux como evidencia administrativa y se fijará el total que luego podrá pagarse por Mercado Pago. Esta acción no crea ni modifica el pedido en Dux.</p>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void prepare()}>Confirmar preparación</button>
        </div>}
    </> : null}
    {state?.state === 'prepared' ? <>
      <p role="status"><strong>Pedido preparado:</strong> {state.prepared.orderId}. Pedido Dux: {state.prepared.duxOrderNumber}.</p>
      <p>Total fijado: {formatMinor(state.prepared.totalMinor)}. Reserva: {reservationLabel(state.prepared.reservationStatus)}. Pago: {paymentLabel(state.prepared.paymentStatus)}.</p>
      {state.prepared.paymentRequiresReview || state.prepared.reservationStatus === 'requires_review'
        ? <p className="form-error">Existe una incidencia que requiere revisión antes de continuar.</p> : null}
      {lifecycleAction !== null && lifecycleConfirmation === null ? <button className="button button-secondary" type="button" disabled={busy}
        onClick={() => { setError(''); setLifecycleConfirmation(lifecycleAction); }}>
        {lifecycleAction === 'release' ? 'Confirmar liberación en Dux' : 'Confirmar finalización en Dux'}
      </button> : null}
      {lifecycleConfirmation === null ? null : <div role="alertdialog" aria-label={lifecycleConfirmation === 'release' ? 'Confirmar liberación Dux' : 'Confirmar finalización Dux'}>
        <p>{lifecycleConfirmation === 'release'
          ? `Confirmá únicamente si el pedido ${state.prepared.duxOrderNumber} ya fue liberado en Dux y verificaste que la reserva dejó de retener stock.`
          : `Confirmá únicamente si el pedido ${state.prepared.duxOrderNumber} ya fue finalizado en Dux y verificaste el pago acreditado.`}</p>
        <p>Shekinah no ejecutará esta operación en Dux: sólo guardará la evidencia administrativa y volverá a validar el estado financiero.</p>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => setLifecycleConfirmation(null)}>Cancelar</button>
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void confirmLifecycle()}>
          {lifecycleConfirmation === 'release' ? 'Sí, ya está liberado en Dux' : 'Sí, ya está finalizado en Dux'}
        </button>
      </div>}
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setState(null); setLifecycleConfirmation(null); void load(); }}>Actualizar estado</button>
    </> : null}
  </section>;
}

function lifecycleActionFor(prepared: Prepared): LifecycleAction | null {
  if (prepared.reservationStatus !== 'confirmed') return null;
  if (prepared.paymentStatus === 'approved') return prepared.paymentRequiresReview ? null : 'finalize';
  if (prepared.paymentStatus === 'pending') return null;
  if (prepared.paymentRequiresReview && prepared.paymentStatus !== 'refunded') return null;
  return 'release';
}
function parseState(value: unknown, requestId: string): State {
  if (!isRecord(value) || (value.state !== 'preview' && value.state !== 'prepared')) throw invalid();
  if (value.state === 'preview') return Object.freeze({ state: 'preview', preview: parsePreview(value.preview, requestId) });
  return Object.freeze({ state: 'prepared', prepared: parsePrepared(value.prepared, requestId) });
}
function parsePreview(value: unknown, requestId: string): Preview {
  if (!isRecord(value) || value.requestId !== requestId || typeof value.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(value.catalogVersion) ||
      typeof value.catalogObservedAt !== 'string' || !Number.isFinite(Date.parse(value.catalogObservedAt)) || !Array.isArray(value.lines) ||
      value.lines.length < 1 || value.lines.length > 50 || !positive(value.itemCount) || !positive(value.productsTotalMinor) ||
      (value.deliveryMethod !== 'coordinated_pickup' && value.deliveryMethod !== 'correo_argentino') ||
      (value.shippingMinor !== null && value.shippingMinor !== 0) || (value.totalMinor !== null && !positive(value.totalMinor))) throw invalid();
  const lines = value.lines.map(parseLine);
  if (lines.reduce((sum, line) => sum + line.quantity, 0) !== value.itemCount ||
      lines.reduce((sum, line) => sum + line.subtotalMinor, 0) !== value.productsTotalMinor ||
      (value.deliveryMethod === 'coordinated_pickup' && (value.shippingMinor !== 0 || value.totalMinor !== value.productsTotalMinor)) ||
      (value.deliveryMethod === 'correo_argentino' && (value.shippingMinor !== null || value.totalMinor !== null))) throw invalid();
  return Object.freeze({ requestId, catalogVersion: value.catalogVersion, catalogObservedAt: value.catalogObservedAt,
    lines: Object.freeze(lines), itemCount: value.itemCount, productsTotalMinor: value.productsTotalMinor,
    deliveryMethod: value.deliveryMethod, shippingMinor: value.shippingMinor, totalMinor: value.totalMinor });
}
function parseLine(value: unknown): PreviewLine {
  if (!isRecord(value) || typeof value.productId !== 'string' || typeof value.duxCode !== 'string' || value.duxCode.trim() === '' ||
      typeof value.name !== 'string' || value.name.trim() === '' || !positive(value.quantity) || !positive(value.unitPriceMinor) ||
      !positive(value.subtotalMinor) || value.subtotalMinor !== value.quantity * value.unitPriceMinor) throw invalid();
  return Object.freeze({ productId: value.productId, duxCode: value.duxCode, name: value.name,
    quantity: value.quantity, unitPriceMinor: value.unitPriceMinor, subtotalMinor: value.subtotalMinor });
}
function parsePrepared(value: unknown, requestId: string): Prepared {
  if (!isRecord(value) || typeof value.orderId !== 'string' || !/^ord_[A-Za-z0-9_-]{20,128}$/u.test(value.orderId) || value.requestId !== requestId ||
      typeof value.duxOrderNumber !== 'string' || value.duxOrderNumber.trim() === '' ||
      (value.duxOrderId !== null && typeof value.duxOrderId !== 'string') || typeof value.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(value.catalogVersion) ||
      !positive(value.itemCount) || !positive(value.productsTotalMinor) || !nonNegative(value.shippingMinor) || !positive(value.totalMinor) ||
      value.totalMinor !== value.productsTotalMinor + value.shippingMinor ||
      !['confirmed', 'released', 'finalized', 'requires_review'].includes(String(value.reservationStatus)) ||
      !['none', 'pending', 'approved', 'rejected', 'cancelled', 'refunded'].includes(String(value.paymentStatus)) ||
      typeof value.paymentRequiresReview !== 'boolean') throw invalid();
  return value as unknown as Prepared;
}
function moneyToMinor(value: string): number | null {
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  return Number.isFinite(amount) && amount > 0 && Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try { const value: unknown = await response.json(); if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim() !== '') return value.error.message; }
  catch { /* Usa el fallback. */ }
  return fallback;
}
function formatMinor(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value / 100); }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)); }
function reservationLabel(value: Prepared['reservationStatus']): string { return ({ confirmed: 'confirmada', released: 'liberada', finalized: 'finalizada', requires_review: 'requiere revisión' })[value]; }
function paymentLabel(value: Prepared['paymentStatus']): string { return ({ none: 'sin pago', pending: 'pendiente', approved: 'aprobado', rejected: 'rechazado', cancelled: 'cancelado', refunded: 'reintegrado' })[value]; }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function invalid(): Error { return new Error('La respuesta de preparación asistida no es válida.'); }
function message(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la preparación.'; }
