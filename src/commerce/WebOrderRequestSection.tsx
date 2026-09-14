import { useEffect, useRef, useState } from 'react';
import './web-order-requests.css';
import { trackAnalyticsEvent } from '../analytics/client';
import { getAuthorizedWhatsappNumber } from './env';
import type { CartItem } from '../cart/model';
import type { CheckoutFulfillment } from './fulfillment';
import type { WebRequestIdentity, WebRequestReceipt } from './web-order-contracts';
import { webRequestStatusLabel } from './web-order-contracts';
import { readWebRequest, recoverWebRequest, startWebRequestCheckout, submitWebRequest } from './web-request-api';
import { finishWebRequestIdentity, getOrCreateWebRequestIdentity, readWebRequestIdentity } from './web-request-session';

const MAX_AUTOMATIC_CHECKS = 8;

export function WebOrderRequestSection({ registrationEnabled, items, fulfillment, disabled, onBusyChange, onActiveChange }: Readonly<{
  registrationEnabled: boolean; items: readonly CartItem[]; fulfillment: CheckoutFulfillment | null; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onActiveChange: (active: boolean) => void;
}>) {
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const [identity, setIdentity] = useState<WebRequestIdentity | null>(null);
  const [receipt, setReceipt] = useState<WebRequestReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshState, setRefreshState] = useState<'watching' | 'paused' | 'error'>('watching');
  const [linkedToken] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('solicitud');
    return token !== null && /^[a-f0-9]{64}$/u.test(token) ? token : null;
  });
  const busyRef = useRef(false);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  const focusReceipt = useRef(false);
  useEffect(() => {
    if (receipt !== null && focusReceipt.current) {
      focusReceipt.current = false; receiptTitle.current?.focus();
    }
  }, [receipt]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    let hasAttempt = linkedToken !== null;
    void (async () => {
      if (linkedToken !== null) {
        onActiveChange(true);
        const current = await readWebRequest(linkedToken);
        if (!cancelled) setReceipt(current);
        return;
      }
      const saved = await readWebRequestIdentity();
      if (cancelled) return;
      setIdentity(saved);
      if (saved !== null) {
        hasAttempt = true; onActiveChange(true);
        const current = await recoverWebRequest(saved);
        if (!cancelled) setReceipt(current);
      }
    })().catch((failure: unknown) => {
      if (!cancelled && hasAttempt) setError(message(failure));
    });
    return () => { cancelled = true; };
  }, [linkedToken, onActiveChange]);

  const publicToken = receipt?.publicToken ?? null;
  const awaitingUpdate = receipt !== null && shouldWatchRequest(receipt);
  useEffect(() => {
    if (publicToken === null || !awaitingUpdate) return;
    const controller = new AbortController();
    let checks = 0;
    let timer: number | undefined;
    setRefreshState('watching');
    const schedule = () => {
      if (checks >= MAX_AUTOMATIC_CHECKS) { setRefreshState('paused'); return; }
      timer = window.setTimeout(() => void refresh(), Math.min(15_000 * 2 ** checks, 60_000));
    };
    const refresh = async () => {
      if (controller.signal.aborted) return;
      if (document.visibilityState === 'hidden' || busyRef.current) {
        timer = window.setTimeout(() => void refresh(), 60_000);
        return;
      }
      checks += 1;
      try {
        const current = await readWebRequest(publicToken, controller.signal);
        if (controller.signal.aborted) return;
        setReceipt(current);
        if (shouldWatchRequest(current)) schedule();
      } catch {
        if (!controller.signal.aborted) setRefreshState('error');
      }
    };
    schedule();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [publicToken, awaitingUpdate, refreshVersion]);

  async function operate(action: 'create' | 'recover' | 'new' | 'checkout'): Promise<void> {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError('');
    setRefreshVersion((value) => value + 1);
    try {
      if (action === 'new') {
        if (identity === null) return;
        const current = await recoverWebRequest(identity);
        if (!canPrepareAnother(current)) {
          throw new Error('La solicitud anterior todavía tiene una gestión activa. No se iniciará otra automáticamente.');
        }
        await finishWebRequestIdentity(identity.idempotencyKey);
        if (mounted.current) { setIdentity(null); setReceipt(null); onActiveChange(false); }
      } else if (action === 'recover') {
        const current = linkedToken !== null ? await readWebRequest(linkedToken)
          : identity !== null ? await recoverWebRequest(identity) : null;
        if (mounted.current && current !== null) { focusReceipt.current = true; setReceipt(current); }
      } else if (action === 'checkout') {
        if (receipt === null || !receipt.checkoutAvailable || receipt.totalMinor === null) return;
        void trackAnalyticsEvent('checkout_start', { path: '/carrito' });
        const checkout = await startWebRequestCheckout(receipt.publicToken, receipt.totalMinor);
        void trackAnalyticsEvent('checkout_redirect', { path: '/carrito' });
        window.location.assign(checkout.checkoutUrl);
      } else {
        if (!registrationEnabled || items.length === 0 || fulfillment === null || receipt !== null || linkedToken !== null) return;
        const saved = await getOrCreateWebRequestIdentity();
        if (mounted.current) { setIdentity(saved); onActiveChange(true); }
        const result = await submitWebRequest(saved, items, fulfillment);
        if (mounted.current) { focusReceipt.current = true; setReceipt(result); }
      }
    } catch (failure: unknown) { if (mounted.current) setError(message(failure)); }
    finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }
  if (!registrationEnabled && identity === null && linkedToken === null) return null;
  return <section className="fulfillment-form web-request-panel" aria-labelledby="web-request-title" aria-busy={busy}>
    <h2 id="web-request-title">Tu pedido</h2>
    <p>Completá tus datos una sola vez. El comercio confirmará stock y total antes de habilitar Mercado Pago en esta página. No necesitás abrir WhatsApp.</p>
    {receipt !== null ? <>
      <h3 ref={receiptTitle} tabIndex={-1}>Solicitud registrada</h3>
      <p>Esta referencia corresponde al intento ya enviado. Editar el carrito no cambia esa solicitud.</p>
      <p role="status">{receipt.reference}: {webRequestStatusLabel(receipt.status)}. {receiptStatusMessage(receipt)}</p>
      {awaitingUpdate ? <p aria-live="polite">{refreshState === 'watching'
        ? 'El estado se actualiza automáticamente mientras esta página está visible. No necesitás volver a cargar tus datos.'
        : refreshState === 'error'
          ? 'No pudimos actualizar el estado. Tu solicitud sigue guardada; podés consultar su estado nuevamente.'
          : 'Tu solicitud sigue guardada. La actualización automática terminó por ahora; podés consultar su estado más tarde.'}</p> : null}
      {receipt.totalMinor === null ? null : <p><strong>Total confirmado:</strong> {formatMinor(receipt.totalMinor)}.</p>}
      {receipt.checkoutAvailable ? <button className="button button-primary" type="button" disabled={disabled || busy}
        onClick={() => void operate('checkout')}>{busy ? 'Preparando pago…' : 'Pagar con Mercado Pago'}</button> : null}
      <a className="text-button" href={`/carrito#solicitud=${receipt.publicToken}`}>Enlace protegido de esta solicitud</a>
      {whatsappNumber === null ? null : <a className="button button-secondary"
        href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, consulto por la solicitud ${receipt.reference} registrada en Shekinah.`)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => { void trackAnalyticsEvent('whatsapp_open', { path: '/carrito' }); }}>
        Consultar por WhatsApp (opcional)
      </a>}
    </> : null}
    {error !== '' ? <p role="alert">{error}</p> : null}
    {receipt === null && linkedToken === null && registrationEnabled ? <>
      <p>{fulfillment === null ? 'Completá los datos de entrega del carrito.' : 'El envío por correo y el total quedan sujetos a confirmación; no se presuponen gratuitos.'}</p>
      <button className="button button-primary" type="button" disabled={disabled || busy || fulfillment === null || items.length === 0}
        onClick={() => void operate('create')}>{busy ? 'Guardando tus datos…' : identity === null ? 'Confirmar mis datos' : 'Reenviar el mismo intento'}</button>
    </> : null}
    {identity !== null || linkedToken !== null ? <button className="button button-secondary" type="button" disabled={disabled || busy}
      onClick={() => void operate('recover')}>Consultar estado de la solicitud</button> : null}
    {linkedToken === null && receipt !== null && identity !== null && registrationEnabled && canPrepareAnother(receipt) ? <button className="text-button" type="button" disabled={disabled || busy}
      onClick={() => void operate('new')}>Preparar otra solicitud</button> : null}
  </section>;
}

function receiptStatusMessage(receipt: WebRequestReceipt): string {
  if (receipt.paymentStatus === 'approved') {
    return receipt.paymentRequiresReview
      ? 'Pago recibido. No vuelvas a pagar: la gestión de la reserva requiere revisión administrativa.'
      : 'Pago recibido y acreditado.';
  }
  if (receipt.paymentStatus === 'refunded') {
    return receipt.paymentRequiresReview
      ? 'Pago reintegrado. La devolución física y la reserva requieren revisión administrativa.'
      : 'Pago reintegrado. El reintegro no repone inventario por sí solo.';
  }
  if (receipt.paymentStatus === 'pending') return 'El pago está pendiente de acreditación. No vuelvas a pagarlo.';
  if (receipt.reservationStatus === 'requires_review') return 'La gestión de la reserva requiere revisión. El pago permanece bloqueado.';
  if (receipt.reservationStatus === 'finalized') return 'La gestión del pedido está finalizada.';
  if (receipt.reservationStatus === 'released') return 'La reserva de este pedido fue liberada.';
  if (receipt.reservationStatus === 'confirmed') {
    if (receipt.checkoutAvailable) {
      return receipt.paymentStatus === 'rejected' || receipt.paymentStatus === 'cancelled'
        ? 'La reserva sigue confirmada y el intento anterior no se acreditó. Podés volver a iniciar Mercado Pago.'
        : 'Tu stock está reservado y el total está confirmado. Podés pagar con Mercado Pago.';
    }
    return 'Tu stock está reservado y el total está confirmado. El pago todavía no está disponible.';
  }
  if (receipt.status === 'rejected') return 'No hay cobro ni reserva acreditados para esta solicitud.';
  if (receipt.status === 'accepted') return 'El comercio está preparando tu pedido. El pago se habilitará cuando confirme la reserva y el total.';
  return 'Sin cobro ni reserva acreditados por este registro.';
}

function shouldWatchRequest(receipt: WebRequestReceipt): boolean {
  return !receipt.checkoutAvailable && !receipt.paymentRequiresReview && receipt.status !== 'rejected' &&
    receipt.paymentStatus !== 'approved' && receipt.paymentStatus !== 'refunded' &&
    (receipt.reservationStatus === 'not_reserved' || receipt.reservationStatus === 'confirmed');
}

function canPrepareAnother(receipt: WebRequestReceipt): boolean {
  return receipt.status === 'rejected' || receipt.reservationStatus === 'released' || receipt.reservationStatus === 'finalized';
}

function formatMinor(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value / 100);
}

function message(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la solicitud.'; }
