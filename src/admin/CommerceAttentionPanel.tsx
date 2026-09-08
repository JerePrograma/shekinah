import { useEffect, useState } from 'react';
import { formatOrderNumber } from '../commerce/contracts';
import { parseOrderPaymentState, paymentStateLabel } from '../commerce/payment-state';
import type { PaymentState } from '../commerce/payment-state';

type AttentionAction = 'duplicate_payment' | 'payment_review' | 'reconcile' | 'release_review' | 'finalize' | 'reservation_review';
type AttentionRow = Readonly<{
  id: string; payment: PaymentState; reservation: string; reference: string; action: AttentionAction;
}>;
const ACTIONS: Record<AttentionAction, string> = {
  duplicate_payment: 'Revisar cobros múltiples. No generar otro cobro ni un reintegro automático.',
  payment_review: 'Conciliar el pago registrado con el pedido. No solicitar otro pago.',
  reconcile: 'Buscar la referencia exacta en Dux y comprobar el resultado antes de repetir una operación.',
  release_review: 'Revisar pagos pendientes y la vigencia de la preferencia antes de tramitar la liberación en Dux.',
  finalize: 'Finalizar o facturar en Dux y verificar el alcance completo; un comprobante parcial no completa el pedido.',
  reservation_review: 'Verificar unidad, depósito y compromiso real de stock en Dux antes de ofrecer el cobro.',
};
const RESERVATIONS: Record<string, string> = {
  not_attempted: 'Sin reserva acreditada', pending: 'Operación pendiente', confirmed: 'Reserva confirmada',
  uncertain: 'Resultado incierto', compensation_pending: 'Compensación pendiente', released: 'Liberada',
  finalized: 'Finalizada', blocked: 'Requiere revisión', none: 'Sin vínculo Dux',
};

export function CommerceAttentionPanel({ onUnauthorized }: Readonly<{ onUnauthorized?: (() => void) | undefined }>) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<readonly AttentionRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setRows(null);
    setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/admin/commerce-attention?offset=${offset}`, {
          credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        });
        if (response.status === 401) {
          if (!controller.signal.aborted) onUnauthorized?.();
          throw new Error('La sesión administrativa venció.');
        }
        if (!response.ok) throw new Error('No se pudieron consultar los pendientes comerciales.');
        const value: unknown = await response.json();
        if (!isRecord(value) || !Array.isArray(value.rows) || value.rows.length > 25 || typeof value.hasMore !== 'boolean') {
          throw new Error('La respuesta de pendientes no es válida.');
        }
        const parsed = value.rows.map(parseRow);
        if (controller.signal.aborted) return;
        setRows(parsed);
        setHasMore(value.hasMore);
      } catch (loadError: unknown) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'No se pudieron consultar los pendientes.');
      }
    })();
    return () => controller.abort();
  }, [open, offset, revision, onUnauthorized]);
  return (
    <section className="container section" aria-labelledby="commerce-attention-title" aria-busy={open && rows === null && error === ''}>
      <h2 id="commerce-attention-title">Pendientes comerciales</h2>
      <button className="button button-secondary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Ocultar pendientes comerciales' : 'Consultar pendientes comerciales'}
      </button>
      {!open ? null : <>
      <p>Pagos y tareas Dux, incluidos pedidos anteriores al período del informe. Esta vista no confirma ni modifica inventario.</p>
      {error !== '' ? <p role="alert">{error}</p> : rows === null ? <p role="status">Consultando pendientes…</p> : rows.length === 0 ? <p role="status">No hay pendientes en esta página.</p> : (
        <div className="cart-items">
          {rows.map((row) => (
            <article className="cart-line" key={row.id}>
              <div className="cart-line-content">
                <h3>{formatOrderNumber(row.id)}</h3>
                <p>Pago: {paymentStateLabel(row.payment)}. Dux: {RESERVATIONS[row.reservation]}.</p>
                {row.reference === '' ? null : <p>Referencia Dux: {row.reference}</p>}
                <p>{ACTIONS[row.action]}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="payment-return-actions">
        <button className="button button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}>Actualizar pendientes</button>
        <button className="button button-secondary" type="button" disabled={offset === 0 || rows === null} onClick={() => setOffset((value) => Math.max(0, value - 25))}>Pendientes anteriores</button>
        <button className="button button-secondary" type="button" disabled={!hasMore || rows === null || offset >= 10_000} onClick={() => setOffset((value) => value + 25)}>Pendientes siguientes</button>
      </div>
      </>}
    </section>
  );
}

function parseRow(value: unknown): AttentionRow {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^ord_[A-Za-z0-9_-]{20,128}$/u.test(value.id) ||
      typeof value.next_action !== 'string' || !Object.hasOwn(ACTIONS, value.next_action) ||
      (value.dux_reference !== null && (typeof value.dux_reference !== 'string' || value.dux_reference.length > 200)) ||
      (value.reservation_state !== null && (typeof value.reservation_state !== 'string' || !Object.hasOwn(RESERVATIONS, value.reservation_state)))) {
    throw new Error('La respuesta de pendientes no es válida.');
  }
  const payment = parseOrderPaymentState({ status: value.payment_status, requiresReview: false, updatedAt: null });
  return Object.freeze({ id: value.id, payment: payment.status, reservation: value.reservation_state ?? 'none',
    reference: value.dux_reference ?? '', action: value.next_action as AttentionAction });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
