import { useEffect, useMemo, useRef, useState } from 'react';

import { formatProductPrice } from '../catalog/catalog';
import { useCart } from '../cart/CartContext';
import { getPublicOrderStatus } from '../commerce/api';
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
  const [loading, setLoading] = useState(true);
  const clearedToken = useRef<string | null>(null);
  const publicToken = useMemo(readPublicToken, []);

  useEffect(() => {
    if (publicToken === null) {
      setLoading(false);
      setError('No se pudo identificar el pedido de forma segura.');
      return undefined;
    }
    const controller = new AbortController();
    let pollCount = 0;
    let timeoutId: number | undefined;

    const load = async () => {
      try {
        const next = await getPublicOrderStatus(publicToken, controller.signal);
        setStatus(next);
        setError('');
        setLoading(false);
        if (
          next.status === 'approved' &&
          clearedToken.current !== publicToken &&
          shouldClearCartAfterApproval(items, publicToken)
        ) {
          clearedToken.current = publicToken;
          clear();
          clearRememberedCheckoutOrder();
        }
        if (
          ['preference_pending', 'pending'].includes(next.status) &&
          pollCount < MAX_POLLS
        ) {
          pollCount += 1;
          timeoutId = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
        }
      } catch (loadError: unknown) {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudo consultar el pedido.',
        );
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [clear, items, publicToken]);

  const presentation = statusPresentation(status, expected, loading, error);
  return (
    <section className="payment-return section" aria-labelledby="payment-title">
      <div className="container payment-return-card">
        <p className="eyebrow">Mercado Pago</p>
        <h1 id="payment-title">{presentation.title}</h1>
        <p role={error === '' ? undefined : 'alert'}>{presentation.message}</p>
        {status === null ? null : (
          <dl className="payment-summary">
            <div>
              <dt>Estado verificado</dt>
              <dd>{humanStatus(status.status)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                {formatProductPrice({
                  amount: status.totalMinor / 100,
                  currency: status.currency,
                })}
              </dd>
            </div>
            <div>
              <dt>Unidades</dt>
              <dd>{status.itemCount}</dd>
            </div>
          </dl>
        )}
        <div className="payment-return-actions">
          <AppLink className="button button-primary" navigate={navigate} to={appPaths.cart}>
            Ver carrito
          </AppLink>
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
  expected: 'success' | 'pending' | 'failure',
  loading: boolean,
  error: string,
): Readonly<{ title: string; message: string }> {
  if (loading) {
    return { title: 'Verificando tu pedido…', message: 'Estamos consultando el estado confirmado por el servidor.' };
  }
  if (error !== '') return { title: 'No pudimos verificar el pedido', message: error };
  if (status === null) return { title: 'Estado no disponible', message: 'No hay información verificable del pedido.' };
  switch (status.status) {
    case 'approved':
      return { title: 'Pago aprobado', message: 'Mercado Pago confirmó el pago y el pedido quedó aprobado.' };
    case 'refunded':
      return { title: 'Pago reintegrado', message: 'El servidor confirmó que el pago fue reintegrado.' };
    case 'rejected':
      return { title: 'Pago rechazado', message: 'El pago fue rechazado. Podés volver al carrito e iniciar otro intento.' };
    case 'cancelled':
      return { title: 'Pago cancelado', message: 'El pago fue cancelado y el carrito permanece disponible.' };
    case 'failed':
      return { title: 'No se pudo preparar el pago', message: 'El servidor no pudo confirmar una preferencia de pago segura.' };
    case 'preference_pending':
    case 'pending':
      return {
        title: expected === 'failure' ? 'Pago todavía no confirmado' : 'Pago pendiente',
        message: 'El servidor todavía no recibió una confirmación definitiva. El carrito no se modificó.',
      };
  }
}

function humanStatus(status: PublicOrderStatusResponse['status']): string {
  const labels: Record<PublicOrderStatusResponse['status'], string> = {
    preference_pending: 'Preparando pago',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
    refunded: 'Reintegrado',
    failed: 'Fallido',
  };
  return labels[status];
}
