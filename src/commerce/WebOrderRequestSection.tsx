import { useCallback, useEffect, useRef, useState } from 'react';
import './web-order-requests.css';
import { trackAnalyticsEvent } from '../analytics/client';
import { getAuthorizedWhatsappNumber } from './env';
import type { CartItem } from '../cart/model';
import type { CheckoutFulfillment } from './fulfillment';
import type { WebRequestIdentity, WebRequestReceipt } from './web-order-contracts';
import { prepareWebRequest, readWebRequest, recoverWebRequest, startWebRequestCheckout, submitWebRequest, WebRequestApiError } from './web-request-api';
import { finishWebRequestIdentity, getOrCreateWebRequestIdentity, readWebRequestIdentity } from './web-request-session';

const MAX_AUTOMATIC_CHECKS = 8;
const DIRECT_CHECK_INTERVAL_MS = 5000;
const RECOVERY_ERROR = 'No pudimos consultar tu pedido. Tocá «Volver a intentar».';
const SUBMIT_ERROR = 'No pudimos confirmar tu pedido. Tocá «Volver a intentar» para comprobar si se guardó.';
const STORAGE_ERROR = 'No pudimos iniciar la compra en este navegador. Tocá «Volver a intentar».';

export function WebOrderRequestSection({ registrationEnabled, items, fulfillment, disabled, onBusyChange, onActiveChange, onConfirmedTotalChange, onValidateBeforeCreate }: Readonly<{
  registrationEnabled: boolean; items: readonly CartItem[]; fulfillment: CheckoutFulfillment | null; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onActiveChange: (active: boolean) => void;
  onConfirmedTotalChange?: (total: number | null) => void;
  onValidateBeforeCreate?: () => boolean;
}>) {
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const [identity, setIdentity] = useState<WebRequestIdentity | null>(null);
  const [receipt, setReceipt] = useState<WebRequestReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [missingLink, setMissingLink] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshState, setRefreshState] = useState<'watching' | 'paused' | 'error'>('watching');
  const [linkedToken] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('solicitud');
    return token !== null && /^[a-f0-9]{64}$/u.test(token) ? token : null;
  });
  const busyRef = useRef(false);
  const lastDirectRequestStartedAt = useRef<number | null>(null);
  // Sólo el gesto de compra de esta visita autoriza una continuación automática.
  // Recuperar desde IndexedDB o un enlace nunca vuelve a abrir Mercado Pago solo.
  const continueAutomatically = useRef(false);
  const checkoutAttempted = useRef(new Set<string>());
  useEffect(() => { onConfirmedTotalChange?.(receipt?.totalMinor ?? null); }, [receipt?.totalMinor, onConfirmedTotalChange]);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  const focusReceipt = useRef(false);
  useEffect(() => {
    if (focusReceipt.current) {
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
        setNeedsRecovery(true);
        onActiveChange(true);
        const current = await readWebRequest(linkedToken);
        if (!cancelled) setReceipt(current);
        return;
      }
      const saved = await readWebRequestIdentity();
      if (cancelled) return;
      setIdentity(saved);
      if (saved !== null) {
        hasAttempt = true; setNeedsRecovery(true); onActiveChange(true);
        const current = await recoverWebRequest(saved);
        if (!cancelled) setReceipt(current);
      }
    })().catch((failure: unknown) => {
      if (cancelled) return;
      if (requestNotFound(failure)) {
        if (linkedToken !== null) setMissingLink(true);
        else {
          // Un 404 propio permite enviar deliberadamente el carrito con la MISMA
          // identidad. No borrar la clave: otra pestaña puede estar registrándola.
          setNeedsRecovery(false); onActiveChange(false);
        }
      } else setError(hasAttempt ? RECOVERY_ERROR : STORAGE_ERROR);
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
    let inFlight = false;
    let stopped = false;
    let nextCheckAt = directPreparing
      ? (lastDirectRequestStartedAt.current ?? performance.now()) + DIRECT_CHECK_INTERVAL_MS
      : performance.now() + 15_000;
    setRefreshState('watching');
    const schedule = () => {
      window.clearTimeout(timer);
      if (controller.signal.aborted || stopped || inFlight) return;
      if (checks >= (directPreparing ? 120 : MAX_AUTOMATIC_CHECKS)) { stopped = true; setRefreshState('paused'); return; }
      if (document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => void refresh(), Math.max(0, nextCheckAt - performance.now()));
    };
    const refresh = async () => {
      if (controller.signal.aborted || stopped || inFlight || document.visibilityState === 'hidden') return;
      if (busyRef.current) {
        timer = window.setTimeout(() => void refresh(), 1000);
        return;
      }
      checks += 1;
      inFlight = true;
      const startedAt = performance.now();
      if (directPreparing) lastDirectRequestStartedAt.current = startedAt;
      try {
        const current = directPreparing ? await prepareWebRequest(publicToken, controller.signal) : await readWebRequest(publicToken, controller.signal);
        if (controller.signal.aborted) return;
        setReceipt(current);
        if (shouldWatchRequest(current)) {
          // La respuesta ya consume el intervalo. Nunca solapar avances ni añadir
          // otros cinco segundos a una llamada lenta; el servidor conserva su límite Dux.
          nextCheckAt = directPreparing ? startedAt + DIRECT_CHECK_INTERVAL_MS
            : performance.now() + Math.min(15_000 * 2 ** checks, 60_000);
        } else stopped = true;
      } catch {
        stopped = true;
        // El avance puede haber guardado una revisión antes de devolver 409.
        // Recuperar ese estado con un GET no reintenta la reserva ni abre el pago.
        if (directPreparing && !controller.signal.aborted) {
          try {
            const current = await readWebRequest(publicToken, controller.signal);
            if (controller.signal.aborted) return;
            setReceipt(current);
            if (current.preparationStatus === 'requires_review') {
              setRefreshState('paused'); setError(''); return;
            }
          } catch { /* El error visible se conserva si tampoco se puede leer el estado. */ }
        }
        if (!controller.signal.aborted) { setRefreshState('error'); setError(RECOVERY_ERROR); }
      } finally {
        inFlight = false;
        schedule();
      }
    };
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => { controller.abort(); window.clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); };
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
      if (mounted.current) setError('No pudimos abrir Mercado Pago. Tocá «Ir a Mercado Pago» para volver a intentarlo.');
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
    if (action === 'create' && needsRecovery) return;
    if (action === 'create' && onValidateBeforeCreate?.() === false) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError('');
    setRefreshVersion((value) => value + 1);
    let submitted = false;
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
          lastDirectRequestStartedAt.current = null;
          focusReceipt.current = true;
          setIdentity(null); setReceipt(null); setCheckoutUrl(null); setNeedsRecovery(false); onActiveChange(false);
        }
      } else if (action === 'recover') {
        const current = linkedToken !== null ? await readWebRequest(linkedToken)
          : identity !== null ? await recoverWebRequest(identity) : null;
        if (mounted.current && current !== null) { focusReceipt.current = true; setReceipt(current); }
      } else {
        if (!registrationEnabled || items.length === 0 || fulfillment === null || receipt !== null || linkedToken !== null) return;
        const saved = await getOrCreateWebRequestIdentity();
        continueAutomatically.current = true;
        if (mounted.current) { setIdentity(saved); setNeedsRecovery(true); onActiveChange(true); }
        lastDirectRequestStartedAt.current = performance.now();
        submitted = true;
        const result = await submitWebRequest(saved, items, fulfillment);
        if (mounted.current) { focusReceipt.current = true; setReceipt(result); }
      }
    } catch (failure: unknown) {
      if (mounted.current) {
        if (action === 'recover' && requestNotFound(failure)) {
          if (linkedToken !== null) setMissingLink(true);
          else if (receipt === null) { setNeedsRecovery(false); onActiveChange(false); }
          else setError(RECOVERY_ERROR);
        } else setError(action === 'create' ? submitted ? SUBMIT_ERROR : STORAGE_ERROR : action === 'new'
          ? 'No pudimos volver al carrito. Tocá «Iniciar otra compra» para intentarlo de nuevo.' : RECOVERY_ERROR);
      }
    }
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
  const canPay = receipt?.checkoutAvailable === true && receipt.totalMinor !== null;
  const paymentConfirmed = receipt?.paymentStatus === 'approved' && !receipt.paymentRequiresReview;
  const hasFinancialStatus = receipt !== null && ['approved', 'pending', 'refunded'].includes(receipt.paymentStatus);
  const canStartAnother = linkedToken === null && receipt !== null && identity !== null && registrationEnabled && canPrepareAnother(receipt);
  const needsHelp = receipt?.paymentStatus === 'not_requested' &&
    (receipt.preparationStatus === 'requires_review' || receipt.reservationStatus === 'requires_review');
  const showRecovery = needsRecovery && !recovering && !missingLink && !simpleProgress && checkoutUrl === null &&
    !canPay && !canStartAnother;
  const showCreate = receipt === null && linkedToken === null && registrationEnabled && !simpleProgress && !needsRecovery;
  if (!registrationEnabled && identity === null && linkedToken === null) return null;
  return <section className="fulfillment-form web-request-panel" aria-labelledby="web-request-title" aria-busy={busy || recovering}>
    <h2 id="web-request-title" ref={receiptTitle} tabIndex={-1}>{receipt === null ? 'Tu pedido' : 'Tu compra'}</h2>
    {recovering ? <p role="status">Un momento, por favor…</p> : null}
    {simpleProgress ? <div className="web-request-progress" role="status" aria-live="polite">
      <span className="web-request-spinner" aria-hidden="true" />
      <h3>{checkoutUrl === null ? 'Estamos preparando tu compra…' : 'Te estamos llevando a Mercado Pago…'}</h3>
      <p>Esperá un momento. Esta pantalla se actualiza sola.</p>
    </div> : receipt !== null ? <>
      {error === '' || hasFinancialStatus
        ? <p role="status">{awaitingUpdate && refreshState === 'paused' && !hasFinancialStatus
          ? 'Está tardando más de lo esperado. Tocá «Actualizar estado» para continuar.' : receiptStatusMessage(receipt)}</p> : null}
      {receipt.totalMinor === null ? null : <p className="web-request-total"><strong>Total confirmado:</strong> {formatMinor(receipt.totalMinor)}.</p>}
      {receipt.checkoutAvailable && receipt.totalMinor !== null && checkoutUrl === null ? <button className="button button-primary" type="button" disabled={disabled || busy}
        onClick={() => void startCheckout()}>{busy ? 'Abriendo Mercado Pago…' : 'Ir a Mercado Pago'}</button> : null}
      {!paymentConfirmed || whatsappNumber === null ? null : <a className="button button-secondary"
        href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola, ya realicé mi compra en Shekinah. Quisiera coordinar la entrega.')}`}
        target="_blank" rel="noopener noreferrer" onClick={() => { void trackAnalyticsEvent('whatsapp_open', { path: '/carrito' }); }}>
        Enviar mensaje por WhatsApp
      </a>}
    </> : null}
    {checkoutUrl === null ? null : <a className="button button-primary" href={checkoutUrl}>Ir a Mercado Pago</a>}
    {missingLink ? <>
      <p role="status">Este pedido ya no está disponible. Volvé al carrito para continuar.</p>
      <a className="button button-primary" href="/carrito">Volver al carrito</a>
    </> : null}
    {error !== '' ? <p role="alert">{error}</p> : null}
    {showCreate ? <>
      {recovering || error !== '' ? null : <p>{fulfillment === null ? 'Completá tus datos para continuar.' : fulfillment.method === 'coordinated_pickup'
        ? 'Vas a pagar en Mercado Pago.'
        : 'Primero te confirmamos cuánto cuesta el envío.'}</p>}
      <button className="button button-primary" type="button" disabled={disabled || busy || recovering || (fulfillment === null && onValidateBeforeCreate === undefined) || items.length === 0}
        onClick={() => void operate('create')}>{error !== '' ? 'Volver a intentar' : fulfillment === null ? 'Completar mis datos'
          : fulfillment.method === 'correo_argentino' ? 'Consultar costo de envío' : 'Continuar al pago'}</button>
    </> : null}
    {needsHelp && whatsappNumber !== null ? <a className="button button-primary"
      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola, necesito ayuda para continuar con mi pedido en Shekinah.')}`}
      target="_blank" rel="noopener noreferrer" onClick={() => { void trackAnalyticsEvent('whatsapp_open', { path: '/carrito' }); }}>
      Pedir ayuda por WhatsApp
    </a> : null}
    {showRecovery ? <button className={needsHelp && whatsappNumber !== null ? 'text-button' : 'button button-primary'} type="button" disabled={disabled || busy}
      onClick={() => void operate('recover')}>{busy ? 'Un momento…' : error !== '' ? 'Volver a intentar' : 'Actualizar estado'}</button> : null}
    {canStartAnother ? <button className="button button-primary" type="button" disabled={disabled || busy}
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
  if (receipt.reservationStatus === 'requires_review' || receipt.preparationStatus === 'requires_review') return 'Necesitamos revisar tu pedido antes de que puedas pagar. Escribinos para que te ayudemos.';
  if (receipt.reservationStatus === 'finalized') return 'Tu pedido está finalizado.';
  if (receipt.reservationStatus === 'released') return 'Esta compra ya no está disponible para pagar. Podés iniciar otra compra.';
  if (receipt.reservationStatus === 'confirmed') {
    if (receipt.checkoutAvailable) {
      return receipt.paymentStatus === 'rejected' || receipt.paymentStatus === 'cancelled'
        ? 'El pago anterior no se completó. Podés volver a Mercado Pago con esta misma compra.'
        : 'Tu compra está lista para pagar. Podés continuar a Mercado Pago.';
    }
    return 'Tu pedido está guardado. El pago todavía no está disponible.';
  }
  if (receipt.status === 'rejected') return 'No pudimos completar esta compra. No se confirmó ningún cobro. Podés revisar el carrito e iniciar otra.';
  return 'Recibimos tu pedido. Estamos revisando los productos y el costo de entrega.';
}

function requestNotFound(error: unknown): boolean {
  return error instanceof WebRequestApiError && error.status === 404 && error.code === 'WEB_REQUEST_NOT_FOUND';
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
