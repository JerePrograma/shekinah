import { useEffect, useMemo, useRef, useState } from 'react';

import { trackAnalyticsEvent } from '../analytics/client';
import { getAuthorizedWhatsappNumber } from '../commerce/env';
import { useCart } from '../cart/CartContext';
import { getPublicOrderStatus } from '../commerce/api';
import { parseOrderPaymentState } from '../commerce/payment-state';
import {
  clearRememberedCheckoutOrder,
  readRememberedCheckoutOrder,
  shouldClearCartAfterApproval,
} from '../commerce/checkout-session';
import type { PublicOrderStatusResponse } from '../commerce/contracts';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 6;

type VerificationPhase = 'checking' | 'polling' | 'settled' | 'exhausted' | 'error';

export function PaymentReturnPage({
  expected,
  navigate,
}: Readonly<{
  expected: 'success' | 'pending' | 'failure';
  navigate: Navigate;
}>) {
  const { clear, items } = useCart();
  const [status, setStatus] = useState<PublicOrderStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<VerificationPhase>('checking');
  const [retryVersion, setRetryVersion] = useState(0);
  const clearedToken = useRef<string | null>(null);
  const itemsRef = useRef(items);
  const publicToken = useMemo(readPublicToken, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (publicToken === null) {
      setError('No se pudo identificar el pedido de forma segura.');
      setPhase('error');
      return undefined;
    }
    const controller = new AbortController();
    let pollCount = 0;
    let timeoutId: number | undefined;

    setError('');
    setPhase('checking');

    const load = async () => {
      try {
        const next = await getPublicOrderStatus(publicToken, controller.signal);
        if (controller.signal.aborted) return;
        if (next.payment !== undefined) parseOrderPaymentState(next.payment);
        setStatus(next);
        setError('');
        if (
          (next.payment?.status ?? next.status) === 'approved' &&
          clearedToken.current !== publicToken &&
          shouldClearCartAfterApproval(itemsRef.current, publicToken)
        ) {
          clearedToken.current = publicToken;
          clear();
          clearRememberedCheckoutOrder();
        }
        if (next.payment === undefined ? isPendingStatus(next.status) :
          next.payment.status === 'pending' || (next.payment.status === 'none' && isPendingStatus(next.status))) {
          if (pollCount < MAX_POLLS) {
            pollCount += 1;
            setPhase('polling');
            timeoutId = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
          } else {
            setPhase('exhausted');
          }
        } else {
          setPhase('settled');
        }
      } catch {
        if (controller.signal.aborted) return;
        setError('No pudimos consultar tu compra. Intentá nuevamente en unos momentos.');
        setPhase('error');
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [clear, publicToken, retryVersion]);

  const presentation = statusPresentation(status, phase, error);
  const busy = phase === 'checking' || phase === 'polling';
  const canRetry = publicToken !== null && (phase === 'error' || phase === 'exhausted' || (!busy && status?.payment?.requiresReview === true));
  const confirmed = !busy && phase !== 'error' && status !== null &&
    (status.payment?.status ?? status.status) === 'approved' && status.payment?.requiresReview !== true;
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const whatsappUrl = confirmed && whatsappNumber !== null
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, realicé la compra ${status.orderNumber} en Shekinah. Quedo a la espera para coordinar la entrega.`)}`
    : null;
  const canResume = !busy && phase !== 'error' && status !== null &&
    ['rejected', 'cancelled', 'failed'].includes(status.payment?.status === 'none' ? status.status : status.payment?.status ?? status.status);
  return (
    <section
      className="payment-return section"
      aria-labelledby="payment-title"
      aria-busy={busy}
    >
      <div className="container payment-return-card">
        <p className="eyebrow">Mercado Pago</p>
        <h1 id="payment-title">{presentation.title}</h1>
        <p
          role={phase === 'error' ? 'alert' : 'status'}
          aria-live={phase === 'error' ? undefined : 'polite'}
          aria-atomic="true"
        >
          {presentation.message}
        </p>
        {confirmed ? <p>Pronto nos pondremos en contacto para coordinar la entrega.</p> : null}
        <div className="payment-return-actions">
          {whatsappUrl === null ? null : <a className="button button-primary" href={whatsappUrl}
            target="_blank" rel="noopener noreferrer"
            onClick={() => void trackAnalyticsEvent('whatsapp_open', { path: expected === 'success'
              ? appPaths.paymentSuccess : expected === 'pending' ? appPaths.paymentPending : appPaths.paymentError })}>
            Enviar mensaje por WhatsApp
          </a>}
          {canRetry ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setRetryVersion((current) => current + 1)}
            >
              Reintentar verificación
            </button>
          ) : null}
          {canResume ? <AppLink
            className={`button ${canRetry ? 'button-secondary' : 'button-primary'}`}
            navigate={navigate}
            to={appPaths.cart}
          >
            Retomar mi compra
          </AppLink> : null}
          <AppLink className="button button-secondary" navigate={navigate} to={appPaths.catalog}>
            Volver al catálogo
          </AppLink>
        </div>
      </div>
    </section>
  );
}

function readPublicToken(): string | null {
  const queryValue = new URLSearchParams(window.location.search).get('order');
  if (queryValue !== null && /^[a-f0-9]{64}$/iu.test(queryValue)) {
    return queryValue.toLocaleLowerCase('en');
  }
  return readRememberedCheckoutOrder()?.publicToken ?? null;
}

function statusPresentation(
  status: PublicOrderStatusResponse | null,
  phase: VerificationPhase,
  error: string,
): Readonly<{ title: string; message: string }> {
  if (phase === 'checking') {
    return {
      title: 'Estamos confirmando tu pago',
      message: 'Estamos consultando la confirmación de Mercado Pago. No vuelvas a pagar.',
    };
  }
  if (phase === 'error' || error !== '') {
    if (status?.payment?.status === 'approved' || status?.payment?.status === 'refunded') {
      const recorded = paymentPresentation(status);
      return { title: recorded.title, message: `${recorded.message} No pudimos actualizar la consulta: ${error}` };
    }
    return { title: 'No pudimos verificar el pedido', message: error };
  }
  if (status === null) return { title: 'Estado no disponible', message: 'No hay información verificable del pedido.' };
  const recorded = paymentPresentation(status);
  return phase === 'exhausted'
    ? { ...recorded, message: `${recorded.message} Podés volver a consultar en unos momentos.` }
    : recorded;
}

function paymentPresentation(status: PublicOrderStatusResponse): Readonly<{ title: string; message: string }> {
  switch (status.payment?.status ?? status.status) {
    case 'approved':
      return status.payment?.requiresReview === true
        ? { title: 'Recibimos tu pago', message: 'Tu pedido está en revisión. No vuelvas a pagar. Nos pondremos en contacto si necesitamos algo.' }
        : { title: '¡Compra confirmada!', message: `Tu pedido es ${status.orderNumber}.` };
    case 'refunded':
      return { title: 'Pago reintegrado o revertido', message: status.payment?.requiresReview === true
        ? 'Se registró el reintegro o la reversión de tu pago. Tu pedido está en revisión; nos pondremos en contacto si necesitamos algo.'
        : 'Se registró el reintegro o la reversión de tu pago. Si necesitás coordinar una devolución, contactanos.' };
    case 'rejected':
      return { title: 'El pago no se completó', message: 'Podés retomar tu compra para consultar las opciones de pago disponibles.' };
    case 'cancelled':
      return { title: 'El pago fue cancelado', message: 'Podés retomar tu compra cuando quieras continuar.' };
    case 'failed':
      return { title: 'No pudimos iniciar el pago', message: 'Podés retomar tu compra para consultar las opciones disponibles.' };
    case 'none':
      return { title: 'Pago no confirmado', message: 'Todavía no recibimos la confirmación de tu pago. Si ya pagaste, no vuelvas a hacerlo mientras lo verificamos.' };
    case 'preference_pending':
    case 'pending':
      return {
        title: 'Estamos confirmando tu pago',
        message: 'Tu pedido está registrado. No vuelvas a pagar mientras verificamos la acreditación.',
      };
  }
}

function isPendingStatus(status: PublicOrderStatusResponse['status']): boolean {
  return status === 'preference_pending' || status === 'pending';
}
