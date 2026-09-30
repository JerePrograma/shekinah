import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatOrderNumber } from '../commerce/contracts';
import { parseDirectReservationReview } from '../commerce/web-order-contracts';
import type { DirectReservationReview } from '../commerce/web-order-contracts';

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
type State = Readonly<{ state: 'preview'; preview: Preview }> | Readonly<{ state: 'prepared'; prepared: Prepared }>
  | Readonly<{state:'direct_preparing';requestId:string;preparationStatus:string;duxReference:string;errorCode:string|null;
      reservationReview?: DirectReservationReview | null}>;
type LifecycleAction = 'release' | 'finalize';
const PREPARATION_ERROR = 'No pudimos confirmar la preparación del cobro. Actualizá el estado antes de repetirla.';
const VERIFICATION_ERROR = 'No pudimos comprobar el pedido en Dux. Actualizá el estado antes de continuar; no crees otra reserva.';
const LIFECYCLE_ERROR = 'No pudimos confirmar el cambio de la reserva. Actualizá el estado antes de repetirlo.';
class AdminActionError extends Error {}

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
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirming || lifecycleConfirmation !== null) cancelRef.current?.focus();
  }, [confirming, lifecycleConfirmation]);

  function cancelConfirmation(): void {
    if (busyRef.current) return;
    setConfirming(false);
    setLifecycleConfirmation(null);
    window.requestAnimationFrame(() => confirmationTriggerRef.current?.focus());
  }

  function handleConfirmationKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || busyRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    cancelConfirmation();
  }

  async function load(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); onBusyChange(true, 'Consultando pedido y reserva');
    try {
      const response = await fetch(`/api/admin/web-order-requests/${requestId}/prepare`, {
        credentials: 'same-origin', redirect: 'error',
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error('No se pudo consultar la preparación del cobro.');
      const next = parseState(await response.json(), requestId);
      setState(next);
      setConfirming(false);
      setLifecycleConfirmation(null);
      if (next.state === 'preview') {
        setConfirmed(false);
        if (next.preview.deliveryMethod === 'coordinated_pickup') setShippingAmount('0');
      }
    } catch { setError('No pudimos consultar el pedido. Reintentá en unos instantes.'); }
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
      if (!response.ok) throw new AdminActionError(await errorMessage(response, PREPARATION_ERROR));
      const next = await reloadPreparedState();
      setState(next);
      setConfirming(false);
    } catch (failure: unknown) { setConfirming(false); setError(message(failure, PREPARATION_ERROR)); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  async function resumeDirect():Promise<void> {
    if(busyRef.current || state?.state!=='direct_preparing') return;
    busyRef.current=true;setBusy(true);setError('');onBusyChange(true,'Verificando compra directa');
    try {
      const response=await fetch(`/api/admin/web-order-requests/${requestId}/resume`,{method:'POST',credentials:'same-origin',redirect:'error'});
      if(response.status===401){onUnauthorized();return;}
      if(!response.ok) throw new AdminActionError(await errorMessage(response,VERIFICATION_ERROR));
      setState(parseState(await response.json(),requestId));
    } catch(failure:unknown){
      setError(message(failure,VERIFICATION_ERROR));
      try { setState(await reloadPreparedState()); } catch { /* Conservar el último estado si la lectura también falla. */ }
    }
    finally{busyRef.current=false;setBusy(false);onBusyChange(false);}
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
        throw new AdminActionError(await errorMessage(response, LIFECYCLE_ERROR));
      }
      const next = await reloadPreparedState();
      const expected = action === 'release' ? 'released' : 'finalized';
      if (next.state !== 'prepared' || next.prepared.orderId !== state.prepared.orderId || next.prepared.reservationStatus !== expected) {
        throw new Error('La operación fue recibida, pero su estado persistido no pudo volver a verificarse.');
      }
      setState(next);
      setLifecycleConfirmation(null);
    } catch (failure: unknown) { setLifecycleConfirmation(null); setError(message(failure, LIFECYCLE_ERROR)); }
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
    <h4 id={`assisted-checkout-${requestId}`}>Reserva y cobro</h4>
    <p>Consultá la reserva y el total antes de cobrar. Los precios vienen de Dux; el envío por correo requiere una cotización final.</p>
    {state === null ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load()}>
      {busy ? 'Consultando…' : 'Consultar preparación de cobro'}
    </button> : null}
    {error === '' ? null : <p role="alert">{error}</p>}
    {state?.state === 'direct_preparing' ? <>
      <p role="status">{preparationLabel(state.preparationStatus)}</p>
      <p>No crees otro pedido ni otra reserva hasta comprobar el resultado en Dux.</p>
      <details><summary>Datos para revisar el pedido en Dux</summary>
        <p>Referencia: <code>{state.duxReference}</code>.</p>
        {state.errorCode !== null && /^[A-Z][A-Z0-9_]{0,99}$/u.test(state.errorCode) ? <p>Código para soporte: <code>{state.errorCode}</code>.</p> : null}
        {state.reservationReview == null ? null : <>
          <p>Pedido Dux {state.reservationReview.duxOrderNumber} (ID {state.reservationReview.duxOrderId}).
            Producto {state.reservationReview.code}, cantidad solicitada {state.reservationReview.quantity}.</p>
          <div className="admin-table-wrap"><table className="admin-table">
            <caption>Lecturas de stock que requieren revisión</caption>
            <thead><tr><th scope="col">Lectura</th><th scope="col">Real</th><th scope="col">Reservado</th><th scope="col">Disponible</th></tr></thead>
            <tbody>
              <tr><th scope="row">Antes del pedido</th><td>{state.reservationReview.before.realStock}</td><td>{state.reservationReview.before.reservedStock}</td><td>{state.reservationReview.before.availableStock}</td></tr>
              <tr><th scope="row">Al verificar la reserva</th><td>{state.reservationReview.after.realStock}</td><td>{state.reservationReview.after.reservedStock}</td><td>{state.reservationReview.after.availableStock}</td></tr>
            </tbody>
          </table></div>
          <p>Lectura inicial: {formatDate(state.reservationReview.beforeObservedAt)}.
            Verificación: {formatDate(state.reservationReview.afterObservedAt)}.</p>
          {state.reservationReview.before.realStock !== state.reservationReview.after.realStock
            ? <p>El stock real cambió entre ambas lecturas. La cantidad reservada global no acredita por sí sola este pedido.</p>
            : <p>Dux todavía no muestra el aumento reservado y la reducción disponible exigidos para este pedido.</p>}
        </>}
      </details>
      {state.preparationStatus === 'preparing' || state.preparationStatus === 'uncertain' ||
        (state.preparationStatus === 'requires_review' && state.reservationReview != null)
        ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void resumeDirect()}>Continuar verificación Dux</button> : null}
    </> : null}
    {state?.state === 'preview' ? <>
      <p>Precios de Dux consultados el {formatDate(state.preview.catalogObservedAt)}.</p>
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
      <details><summary>Identificador adicional de Dux (opcional)</summary>
      <label htmlFor={`assisted-dux-id-${requestId}`}>ID interno Dux
        <input id={`assisted-dux-id-${requestId}`} value={duxOrderId} disabled={busy} maxLength={120}
          onChange={(event) => setDuxOrderId(event.currentTarget.value)} />
      </label>
      </details>
      <label className="whatsapp-consent" htmlFor={`assisted-confirm-${requestId}`}>
        <input id={`assisted-confirm-${requestId}`} type="checkbox" checked={confirmed} disabled={busy}
          onChange={(event) => setConfirmed(event.currentTarget.checked)} />
        <span>Confirmo que verifiqué en Dux este pedido, las cantidades exactas y la reserva de stock.</span>
      </label>
      {!confirming ? <button ref={confirmationTriggerRef} className="button button-primary" type="button" disabled={busy || !confirmed || duxOrderNumber.trim() === ''}
        onClick={() => { setError(''); setConfirming(true); }}>Preparar cobro</button>
        : <div role="alertdialog" aria-label="Confirmar preparación de cobro"
          aria-describedby={`assisted-confirm-description-${requestId}`} onKeyDown={handleConfirmationKeyDown}>
          <p id={`assisted-confirm-description-${requestId}`}>Se guardará la reserva que verificaste y el total que podrá pagarse por Mercado Pago. Esta acción no crea ni modifica el pedido en Dux.</p>
          <button ref={cancelRef} className="button button-secondary" type="button" disabled={busy} onClick={cancelConfirmation}>Cancelar</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void prepare()}>Confirmar preparación</button>
        </div>}
    </> : null}
    {state?.state === 'prepared' ? <>
      <p role="status"><strong>Pedido preparado:</strong> {formatOrderNumber(state.prepared.orderId)}. Pedido Dux: {state.prepared.duxOrderNumber}.</p>
      <p>Total confirmado: {formatMinor(state.prepared.totalMinor)}. Reserva: {reservationLabel(state.prepared.reservationStatus)}. Pago: {paymentLabel(state.prepared.paymentStatus)}.</p>
      {state.prepared.paymentRequiresReview || state.prepared.reservationStatus === 'requires_review'
        ? <p className="form-error">Revisá el pago en Mercado Pago y la reserva en Dux antes de continuar. No solicites otro pago mientras se revisa el pedido.</p> : null}
      {lifecycleAction !== null && lifecycleConfirmation === null ? <button ref={confirmationTriggerRef} className="button button-secondary" type="button" disabled={busy}
        onClick={() => { setError(''); setLifecycleConfirmation(lifecycleAction); }}>
        {lifecycleAction === 'release' ? 'Confirmar liberación en Dux' : 'Confirmar finalización en Dux'}
      </button> : null}
      {lifecycleConfirmation === null ? null : <div role="alertdialog" aria-label={lifecycleConfirmation === 'release' ? 'Confirmar liberación Dux' : 'Confirmar finalización Dux'}
        aria-describedby={`assisted-lifecycle-description-${requestId}`} onKeyDown={handleConfirmationKeyDown}>
        <p id={`assisted-lifecycle-description-${requestId}`}>{lifecycleConfirmation === 'release'
          ? `Confirmá únicamente si el pedido ${state.prepared.duxOrderNumber} ya fue liberado en Dux y verificaste que la reserva dejó de retener stock.`
          : `Confirmá únicamente si el pedido ${state.prepared.duxOrderNumber} ya fue finalizado en Dux y verificaste el pago acreditado.`}</p>
        <p>Shekinah no ejecutará esta operación en Dux: guardará tu confirmación y volverá a comprobar el estado del pago.</p>
        <button ref={cancelRef} className="button button-secondary" type="button" disabled={busy} onClick={cancelConfirmation}>Cancelar</button>
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void confirmLifecycle()}>
          {lifecycleConfirmation === 'release' ? 'Sí, ya está liberado en Dux' : 'Sí, ya está finalizado en Dux'}
        </button>
      </div>}
    </> : null}
    {state === null ? null : <button className="button button-secondary" type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Esperá un momento…' : 'Actualizar estado'}</button>}
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
  if (isRecord(value) && value.state === 'direct_preparing' && value.requestId === requestId &&
      ['preparing','uncertain','failed','requires_review'].includes(String(value.preparationStatus)) &&
      value.duxReference === `shekinah:web:${requestId}` && (value.errorCode === null || typeof value.errorCode === 'string')) {
    return { state: 'direct_preparing', requestId, preparationStatus: String(value.preparationStatus),
      duxReference: value.duxReference, errorCode: value.errorCode,
      reservationReview: value.reservationReview == null ? null : parseDirectReservationReview(value.reservationReview) };
  }
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
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string') {
      const messages: Readonly<Record<string, string>> = {
        ASSISTED_RELEASE_PAYMENT_BLOCKED: 'El pedido tiene un pago aprobado o pendiente. No liberes la reserva; actualizá el estado y revisá el pago en Mercado Pago.',
        ASSISTED_RELEASE_PAYMENT_WINDOW_ACTIVE: 'El plazo para pagar sigue vigente. Esperá a que termine y comprobá los pagos en Mercado Pago antes de liberar la reserva.',
        ASSISTED_FINALIZE_PAYMENT_REQUIRED: 'Falta confirmar un pago aprobado. Revisá el pago en Mercado Pago antes de finalizar el pedido.',
        ASSISTED_DUX_PAYMENT_REVIEW_REQUIRED: 'El pago requiere revisión. Comprobalo en Mercado Pago antes de cambiar la reserva.',
        PAYMENT_RECONCILIATION_REQUIRED: 'Falta comprobar el estado actual del pago en Mercado Pago. Revisalo antes de confirmar la operación en Dux.',
        PAYMENT_RECONCILIATION_STALE: 'La última comprobación del pago ya no está vigente. Revisá el pago en Mercado Pago antes de confirmar la operación en Dux.',
        ASSISTED_CHECKOUT_CONFLICT: 'La solicitud ya fue preparada o cambió durante la operación. Actualizá el estado para consultar el pedido existente.',
        DUX_ORDER_NUMBER_ALREADY_LINKED: 'Este número de pedido Dux ya se usa en otra solicitud. Revisá el número antes de continuar.',
        DUX_CATALOG_SNAPSHOT_STALE: 'Los precios de Dux necesitan actualizarse. Actualizá el catálogo desde la sección Dux y volvé a consultar este pedido.',
        ASSISTED_SHIPPING_INVALID: 'Revisá la cotización final del envío: debe ser mayor que cero para correo. El retiro no tiene costo de envío.',
        DUX_ASSISTED_PRODUCT_CHANGED: 'Un producto cambió en Dux. Actualizá el catálogo y revisá los productos del pedido antes de cobrar.',
        DUX_ASSISTED_PRICE_UNAVAILABLE: 'Un producto no tiene un precio confirmado en Dux. Revisalo en Dux antes de preparar el cobro.',
        DIRECT_CHECKOUT_IN_PROGRESS: 'La compra ya se está preparando. Esperá unos instantes y actualizá el estado.',
      };
      if (Object.hasOwn(messages, value.error.code)) return messages[value.error.code] ?? fallback;
    }
  }
  catch { /* Usa el fallback. */ }
  return fallback;
}
function formatMinor(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: value % 100 === 0 ? 0 : 2, maximumFractionDigits:2 }).format(value / 100); }
function formatDate(value: string): string { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value)); }
function reservationLabel(value: Prepared['reservationStatus']): string { return ({ confirmed: 'confirmada', released: 'liberada', finalized: 'finalizada', requires_review: 'requiere revisión' })[value]; }
function paymentLabel(value: Prepared['paymentStatus']): string { return ({ none: 'sin pago confirmado', pending: 'pendiente', approved: 'aprobado', rejected: 'rechazado', cancelled: 'cancelado', refunded: 'reintegrado o revertido' })[value]; }
function preparationLabel(value: string): string {
  if (value === 'requires_review') return 'La compra necesita revisión. Comprobá el pedido en Dux antes de continuar; el cobro no está habilitado.';
  if (value === 'failed') return 'No se pudo preparar la compra. El cobro no está habilitado.';
  if (value === 'uncertain') return 'Todavía no pudimos confirmar la reserva. Continuá la verificación para consultar el resultado en Dux.';
  return 'La compra se está preparando. Actualizá el estado para consultar el resultado.';
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function invalid(): Error { return new Error('La respuesta de preparación asistida no es válida.'); }
function message(error: unknown, fallback: string): string { return error instanceof AdminActionError ? error.message : fallback; }
