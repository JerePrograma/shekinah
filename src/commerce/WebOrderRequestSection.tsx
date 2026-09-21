import { useCallback, useEffect, useRef, useState } from 'react';
import './web-order-requests.css';
import { trackAnalyticsEvent } from '../analytics/client';
import { getAuthorizedWhatsappNumber } from './env';
import type { CartItem } from '../cart/model';
import type { CheckoutFulfillment } from './fulfillment';
import type { WebRequestIdentity, WebRequestReceipt } from './web-order-contracts';
import { prepareWebRequest, readWebRequest, recoverWebRequest, startWebRequestCheckout, submitWebRequest } from './web-request-api';
import { finishWebRequestIdentity, getOrCreateWebRequestIdentity, readWebRequestIdentity } from './web-request-session';

const MAX_AUTOMATIC_CHECKS = 8;
const PUBLIC_ERROR = 'No pudimos continuar con tu compra. Volvé a consultar o intentá nuevamente.';

export function WebOrderRequestSection({ registrationEnabled, items, fulfillment, disabled, onBusyChange, onActiveChange, onConfirmedTotalChange }: Readonly<{
  registrationEnabled: boolean; items: readonly CartItem[]; fulfillment: CheckoutFulfillment | null; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onActiveChange: (active: boolean) => void;
  onConfirmedTotalChange?: (total: number | null) => void;
}>) {
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const [identity, setIdentity] = useState<WebRequestIdentity | null>(null);
  const [receipt, setReceipt] = useState<WebRequestReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshState, setRefreshState] = useState<'watching' | 'paused' | 'error'>('watching');
  const [linkedToken] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('solicitud');
    return token !== null && /^[a-f0-9]{64}$/u.test(token) ? token : null;
  });
  const busyRef = useRef(false);
  // Sólo el gesto de compra de esta visita autoriza una continuación automática.
  // Recuperar desde IndexedDB o un enlace nunca vuelve a abrir Mercado Pago solo.
  const continueAutomatically = useRef(false);
  const checkoutAttempted = useRef(new Set<string>());
  useEffect(() => { onConfirmedTotalChange?.(receipt?.totalMinor ?? null); }, [receipt?.totalMinor, onConfirmedTotalChange]);
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
    })().catch(() => {
      if (!cancelled && hasAttempt) setError(PUBLIC_ERROR);
    }).finally(() => {
      if (!cancelled) setRecovering(false);
    });
    return () => { cancelled = true; };
  }, [linkedToken, onActiveChange]);

  const publicToken = receipt?.publicToken ?? null;
  const awaitingUpdate = receipt !== null && shouldWatchRequest(receipt);
  const directPreparing = receipt?.preparationStatus === 'preparing' || receipt?.preparationStatus === 'uncertain';
  useEffect(() => {
    if (publicToken === null || !awaitingUpdate) return;
    const controller = new AbortController();
    let checks = 0;
    let timer: number | undefined;
    setRefreshState('watching');
    const schedule = () => {
      if (checks >= (directPreparing ? 120 : MAX_AUTOMATIC_CHECKS)) { setRefreshState('paused'); return; }
      timer = window.setTimeout(() => void refresh(), directPreparing ? 5000 : Math.min(15_000 * 2 ** checks, 60_000));
    };
    const refresh = async () => {
      if (controller.signal.aborted) return;
      if (document.visibilityState === 'hidden' || busyRef.current) {
        timer = window.setTimeout(() => void refresh(), 60_000);
        return;
      }
      checks += 1;
      try {
        const current = directPreparing ? await prepareWebRequest(publicToken, controller.signal) : await readWebRequest(publicToken, controller.signal);
        if (controller.signal.aborted) return;
        setReceipt(current);
        if (shouldWatchRequest(current)) schedule();
      } catch {
        if (!controller.signal.aborted) { setRefreshState('error'); setError(PUBLIC_ERROR); }
      }
    };
    schedule();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [publicToken, awaitingUpdate, refreshVersion, directPreparing]);

  const startCheckout = useCallback(async (): Promise<void> => {
    if (busyRef.current || disabled || receipt === null || !receipt.checkoutAvailable || receipt.totalMinor === null) return;
    checkoutAttempted.current.add(receipt.publicToken);
    busyRef.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      void trackAnalyticsEvent('checkout_start', { path: '/carrito' });
      const checkout = await startWebRequestCheckout(receipt.publicToken, receipt.totalMinor);
      if (!mounted.current) return;
      setCheckoutUrl(checkout.checkoutUrl);
      void trackAnalyticsEvent('checkout_redirect', { path: '/carrito' });
      window.location.assign(checkout.checkoutUrl);
    } catch {
      if (mounted.current) setError('No pudimos abrir Mercado Pago. Podés volver a intentarlo con esta misma compra.');
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }, [disabled, receipt, onBusyChange]);

  useEffect(() => {
    if (!continueAutomatically.current || receipt === null ||
        !receipt.checkoutAvailable || receipt.totalMinor === null || busy || disabled ||
        checkoutAttempted.current.has(receipt.publicToken)) return;
    void startCheckout();
  }, [receipt, busy, disabled, startCheckout]);

  async function operate(action: 'create' | 'recover' | 'new'): Promise<void> {
    if (busyRef.current || disabled || recovering) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError('');
    setRefreshVersion((value) => value + 1);
    try {
      if (action === 'new') {
        if (identity === null) return;
        const current = await recoverWebRequest(identity);
        if (!canPrepareAnother(current)) {
          throw new Error('La compra anterior sigue activa.');
        }
        await finishWebRequestIdentity(identity.idempotencyKey);
        if (mounted.current) {
          continueAutomatically.current = false;
          setIdentity(null); setReceipt(null); setCheckoutUrl(null); onActiveChange(false);
        }
      } else if (action === 'recover') {
        const current = linkedToken !== null ? await readWebRequest(linkedToken)
          : identity !== null ? await recoverWebRequest(identity) : null;
        if (mounted.current && current !== null) { focusReceipt.current = true; setReceipt(current); }
      } else {
        if (!registrationEnabled || items.length === 0 || fulfillment === null || receipt !== null || linkedToken !== null) return;
        const saved = await getOrCreateWebRequestIdentity();
        continueAutomatically.current = true;
        if (mounted.current) { setIdentity(saved); onActiveChange(true); }
        const result = await submitWebRequest(saved, items, fulfillment);
        if (mounted.current) { focusReceipt.current = true; setReceipt(result); }
      }
    } catch { if (mounted.current) setError(PUBLIC_ERROR); }
    finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }
  const preparing = (directPreparing && refreshState === 'watching' && error === '') ||
    (busy && receipt === null && continueAutomatically.current);
  const automaticCheckout = continueAutomatically.current && receipt !== null &&
    receipt.checkoutAvailable && receipt.totalMinor !== null && error === '';
  const simpleProgress = preparing || automaticCheckout;
  const showRecovery = (identity !== null || linkedToken !== null) && !simpleProgress && checkoutUrl === null;
  if (!registrationEnabled && identity === null && linkedToken === null) return null;
  return <section className="fulfillment-form web-request-panel" aria-labelledby="web-request-title" aria-busy={busy}>
    <h2 id="web-request-title">Tu pedido</h2>
    {simpleProgress ? <div className="web-request-progress" role="status" aria-live="polite">
      <span className="web-request-spinner" aria-hidden="true" />
      <h3 ref={receiptTitle} tabIndex={-1}>{checkoutUrl === null ? 'Estamos preparando tu compra…' : 'Te estamos llevando a Mercado Pago…'}</h3>
      <p>Estamos confirmando disponibilidad y total.</p>
    </div> : receipt !== null ? <>
      <h3 ref={receiptTitle} tabIndex={-1}>Tu compra</h3>
      <p role="status">{receiptStatusMessage(receipt)}</p>
      {awaitingUpdate && refreshState !== 'watching' ? <p aria-live="polite">{refreshState === 'error'
        ? 'No pudimos actualizar tu compra. Podés volver a consultarla.'
        : 'La confirmación está tardando más de lo esperado. Podés volver a consultar tu compra.'}</p> : null}
      {receipt.totalMinor === null ? null : <p><strong>Total confirmado:</strong> {formatMinor(receipt.totalMinor)}.</p>}
      {receipt.checkoutAvailable && receipt.totalMinor !== null && checkoutUrl === null ? <button className="button button-primary" type="button" disabled={disabled || busy}
        onClick={() => void startCheckout()}>{busy ? 'Abriendo Mercado Pago…' : 'Ir a Mercado Pago'}</button> : null}
      {whatsappNumber === null ? null : <a className="button button-secondary"
        href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola, quiero consultar mi compra en Shekinah.')}`}
        target="_blank" rel="noopener noreferrer" onClick={() => { void trackAnalyticsEvent('whatsapp_open', { path: '/carrito' }); }}>
        Consultar por WhatsApp (opcional)
      </a>}
    </> : null}
    {checkoutUrl === null ? null : <a className="button button-primary" href={checkoutUrl}>Ir a Mercado Pago</a>}
    {error !== '' ? <p role="alert">{error}</p> : null}
    {receipt === null && linkedToken === null && registrationEnabled && !simpleProgress ? <>
      <p>{fulfillment === null ? 'Completá los datos de entrega del carrito.' : fulfillment.method === 'coordinated_pickup'
        ? 'El retiro no agrega costo. Verificamos los productos para mostrarte el total final antes de pagar.'
        : 'El envío por correo requiere una cotización confirmada. También podés elegir retiro y coordinarlo con el negocio.'}</p>
      <button className="button button-primary" type="button" disabled={disabled || busy || recovering || fulfillment === null || items.length === 0}
        onClick={() => void operate('create')}>{busy ? 'Estamos preparando tu compra…' : fulfillment?.method === 'correo_argentino' ? 'Solicitar cotización de envío' : 'Continuar al pago'}</button>
    </> : null}
    {showRecovery ? <button className="button button-secondary" type="button" disabled={disabled || busy || recovering}
      onClick={() => void operate('recover')}>Consultar mi compra</button> : null}
    {linkedToken === null && receipt !== null && identity !== null && registrationEnabled && canPrepareAnother(receipt) ? <button className="text-button" type="button" disabled={disabled || busy}
      onClick={() => void operate('new')}>Iniciar otra compra</button> : null}
  </section>;
}

function receiptStatusMessage(receipt: WebRequestReceipt): string {
  if (receipt.paymentStatus === 'approved') {
    return receipt.paymentRequiresReview
      ? 'Recibimos tu pago. Tu pedido está en revisión. No vuelvas a pagar. Nos pondremos en contacto si necesitamos algo.'
      : 'Pago recibido y acreditado.';
  }
  if (receipt.paymentStatus === 'refunded') {
    return receipt.paymentRequiresReview
      ? 'Tu pago fue reintegrado. Nos pondremos en contacto para revisar tu pedido.'
      : 'Tu pago fue reintegrado.';
  }
  if (receipt.paymentStatus === 'pending') return 'El pago está pendiente de acreditación. No vuelvas a pagarlo.';
  if (receipt.preparationStatus === 'preparing' || receipt.preparationStatus === 'uncertain') return 'Estamos confirmando disponibilidad y total.';
  if (receipt.preparationStatus === 'failed') return 'No pudimos preparar esta compra. Revisá los productos y cantidades; podés corregir el carrito e iniciar otra.';
  if (receipt.reservationStatus === 'requires_review' || receipt.preparationStatus === 'requires_review') return 'Necesitamos revisar tu pedido antes de continuar al pago. Nos pondremos en contacto.';
  if (receipt.reservationStatus === 'finalized') return 'Tu pedido está finalizado.';
  if (receipt.reservationStatus === 'released') return 'Esta compra ya no está disponible para pagar. Podés iniciar otra compra.';
  if (receipt.reservationStatus === 'confirmed') {
    if (receipt.checkoutAvailable) {
      return receipt.paymentStatus === 'rejected' || receipt.paymentStatus === 'cancelled'
        ? 'El pago anterior no se completó. Podés volver a Mercado Pago con esta misma compra.'
        : 'Tu compra está lista para pagar. Podés continuar a Mercado Pago.';
    }
    return 'El total está confirmado. Te avisaremos cuando puedas continuar al pago.';
  }
  if (receipt.status === 'rejected') return 'No pudimos completar esta compra. No se confirmó ningún cobro. Podés revisar el carrito e iniciar otra.';
  return 'Estamos revisando disponibilidad y entrega. Te avisaremos cuando puedas continuar al pago.';
}

function shouldWatchRequest(receipt: WebRequestReceipt): boolean {
  if (receipt.preparationStatus === 'failed' || receipt.preparationStatus === 'requires_review') return false;
  return !receipt.checkoutAvailable && !receipt.paymentRequiresReview && receipt.status !== 'rejected' &&
    receipt.paymentStatus !== 'approved' && receipt.paymentStatus !== 'refunded' &&
    (receipt.reservationStatus === 'not_reserved' || receipt.reservationStatus === 'confirmed');
}

function canPrepareAnother(receipt: WebRequestReceipt): boolean {
  return (receipt.preparationStatus === 'failed' && receipt.totalMinor === null) || receipt.status === 'rejected' || receipt.reservationStatus === 'released' || receipt.reservationStatus === 'finalized';
}

function formatMinor(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: value % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(value / 100);
}
