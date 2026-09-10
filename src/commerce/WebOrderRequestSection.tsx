import { useEffect, useRef, useState } from 'react';
import './web-order-requests.css';
import { trackAnalyticsEvent } from '../analytics/client';
import { getAuthorizedWhatsappNumber } from './env';
import type { CartItem } from '../cart/model';
import type { CheckoutFulfillment } from './fulfillment';
import type { WebRequestIdentity, WebRequestReceipt } from './web-order-contracts';
import { webRequestStatusLabel } from './web-order-contracts';
import { readWebRequest, recoverWebRequest, submitWebRequest } from './web-request-api';
import { finishWebRequestIdentity, getOrCreateWebRequestIdentity, readWebRequestIdentity } from './web-request-session';

export function WebOrderRequestSection({ registrationEnabled, items, fulfillment, disabled, onBusyChange, onActiveChange }: Readonly<{
  registrationEnabled: boolean; items: readonly CartItem[]; fulfillment: CheckoutFulfillment | null; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onActiveChange: (active: boolean) => void;
}>) {
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const [identity, setIdentity] = useState<WebRequestIdentity | null>(null);
  const [receipt, setReceipt] = useState<WebRequestReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  async function operate(action: 'create' | 'recover' | 'new'): Promise<void> {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      if (action === 'new') {
        if (identity === null) return;
        const current = await recoverWebRequest(identity);
        if (current.status === 'submitted') throw new Error('La solicitud anterior todavía está en revisión. No se iniciará otra automáticamente.');
        await finishWebRequestIdentity(identity.idempotencyKey);
        if (mounted.current) { setIdentity(null); setReceipt(null); onActiveChange(false); }
      } else if (action === 'recover') {
        const current = linkedToken !== null ? await readWebRequest(linkedToken)
          : identity !== null ? await recoverWebRequest(identity) : null;
        if (mounted.current && current !== null) { focusReceipt.current = true; setReceipt(current); }
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
    <h2 id="web-request-title">Solicitud desde la página</h2>
    <p>El comercio revisará presentación, cantidad, disponibilidad y total antes de confirmar la compra. Registrar esta solicitud no reserva stock ni inicia un cobro. No necesitás abrir WhatsApp.</p>
    {receipt !== null ? <>
      <h3 ref={receiptTitle} tabIndex={-1}>Solicitud registrada</h3>
      <p>Esta referencia corresponde al intento ya enviado. Editar el carrito no cambia esa solicitud.</p>
      <p role="status">{receipt.reference}: {webRequestStatusLabel(receipt.status)}. Sin cobro ni reserva acreditados por este registro.</p>
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
        onClick={() => void operate('create')}>{busy ? 'Registrando solicitud…' : identity === null ? 'Registrar solicitud web' : 'Reenviar el mismo intento'}</button>
    </> : null}
    {identity !== null || linkedToken !== null ? <button className="button button-secondary" type="button" disabled={disabled || busy}
      onClick={() => void operate('recover')}>Consultar estado de la solicitud</button> : null}
    {linkedToken === null && receipt !== null && receipt.status !== 'submitted' && identity !== null && registrationEnabled ? <button className="text-button" type="button" disabled={disabled || busy}
      onClick={() => void operate('new')}>Preparar otra solicitud</button> : null}
  </section>;
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la solicitud.'; }
