import { useEffect, useRef, useState } from 'react';
import '../commerce/web-order-requests.css';
import { parseAdminWebRequestDetail, webRequestReference, webRequestStatusLabel } from '../commerce/web-order-contracts';
import type { AdminWebRequestDetail, WebRequestStatus } from '../commerce/web-order-contracts';
import { AssistedCheckoutAdminPanel } from './AssistedCheckoutAdminPanel';

type Row = Readonly<{ id: string; status: WebRequestStatus; name: string }>;

export function WebOrderRequestsPanel({ onUnauthorized, onBusyChange }: Readonly<{
  onUnauthorized: () => void; onBusyChange: (busy: boolean, label?: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<AdminWebRequestDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<'accepted' | 'rejected' | null>(null);
  const busyRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resolveTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (confirmation === null) return undefined;
    cancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault(); setConfirmation(null);
        window.requestAnimationFrame(() => resolveTrigger.current?.focus());
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirmation]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setRows(null); setError(''); setDetail(null); setConfirmation(null);
    void (async () => {
      try {
        const [list, current] = await Promise.all([
          fetch(`/api/admin/web-order-requests?offset=${offset}`, { credentials: 'same-origin', redirect: 'error', signal: controller.signal }),
          selected === null ? null : fetch(`/api/admin/web-order-requests/${selected}`, { credentials: 'same-origin', redirect: 'error', signal: controller.signal }),
        ]);
        if (list.status === 401 || current?.status === 401) { if (!controller.signal.aborted) onUnauthorized(); return; }
        if (!list.ok || (current !== null && !current.ok)) throw new Error('No se pudieron consultar las solicitudes web.');
        const value: unknown = await list.json();
        if (!isRecord(value) || !Array.isArray(value.rows) || value.rows.length > 25 || typeof value.hasMore !== 'boolean') throw invalid();
        const parsed = value.rows.map(parseRow);
        const nextDetail = current === null ? null : parseAdminWebRequestDetail(await current.json());
        if (controller.signal.aborted) return;
        setRows(parsed); setHasMore(value.hasMore); setDetail(nextDetail);
      } catch (failure: unknown) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'La consulta falló.');
      }
    })();
    return () => controller.abort();
  }, [open, offset, revision, selected, onUnauthorized]);

  async function resolveRequest(): Promise<void> {
    if (busyRef.current || confirmation === null || detail === null) return;
    setPanelBusy(true, 'Resolviendo solicitud web'); setError('');
    const target = detail.id; const status = confirmation;
    try {
      const response = await fetch(`/api/admin/web-order-requests/${target}/resolve`, { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error('La resolución no pudo confirmarse. Actualizá el estado antes de repetirla; no se registró un pago ni una reserva.');
      const next = parseAdminWebRequestDetail(await response.json());
      if (next.id !== target || next.status !== status) throw invalid();
      if (mounted.current) { setConfirmation(null); setRevision((value) => value + 1); }
    } catch (failure: unknown) {
      if (mounted.current) { setConfirmation(null); setError(failure instanceof Error ? failure.message : 'La resolución no pudo confirmarse.'); }
    } finally { setPanelBusy(false); }
  }

  function setPanelBusy(active: boolean, label?: string): void {
    busyRef.current = active;
    if (mounted.current) setBusy(active);
    onBusyChange(active, label);
  }

  return <section className="container section web-request-panel" aria-labelledby="web-requests-admin-title" aria-busy={busy}>
    <h2 id="web-requests-admin-title">Solicitudes web</h2>
    <button className="button button-secondary" type="button" disabled={busy} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? 'Ocultar solicitudes web' : 'Consultar solicitudes web'}
    </button>
    {!open ? null : <>
      <p>Son solicitudes previas a la compra: aceptar permite gestionarlas, pero no acredita pago ni reserva. El total y la unidad comercial deben confirmarse antes de cobrar.</p>
      {error !== '' ? <p role="alert">{error}</p> : rows === null ? <p role="status">Consultando solicitudes…</p> : rows.length === 0 ? <p role="status">No hay solicitudes en esta página.</p> : (
        <div className="cart-items">{rows.map((row) => <article className="cart-line" key={row.id}>
          <div className="cart-line-content"><h3>{webRequestReference(row.id)}</h3><p>{row.name} · {webRequestStatusLabel(row.status)}</p>
          <button className="text-button" type="button" disabled={busy} onClick={() => setSelected(row.id)}>Ver solicitud {webRequestReference(row.id)}</button></div>
        </article>)}</div>
      )}
      {detail === null ? null : <article className="fulfillment-form" aria-label="Detalle de solicitud web">
        <h3>{webRequestReference(detail.id)} · {webRequestStatusLabel(detail.status)}</h3>
        <p>Cliente: {detail.snapshot.fulfillment.fullName}. Celular: {detail.snapshot.fulfillment.phone}.</p>
        {detail.snapshot.fulfillment.method === 'correo_argentino' ? <p>Envío a cotizar: {detail.snapshot.fulfillment.address}, {detail.snapshot.fulfillment.locality}, {detail.snapshot.fulfillment.province}, {detail.snapshot.fulfillment.postalCode}.</p> : <p>Retiro o entrega personal coordinada.</p>}
        <p>Observación del catálogo: {detail.snapshot.observedAt}. Total pendiente de confirmación.</p>
        {detail.snapshot.lines.map((line) => <p key={line.productId}>{line.name} · Código Dux: {line.duxCode} · Cantidad solicitada: {line.requestedQuantity}. Presentación y unidad por confirmar.</p>)}
        {detail.status !== 'submitted' ? null : confirmation === null ? <div className="payment-return-actions">
          <button className="button button-primary" type="button" disabled={busy} onClick={(event) => { resolveTrigger.current = event.currentTarget; setConfirmation('accepted'); }}>Aceptar para gestión</button>
          <button className="button button-secondary" type="button" disabled={busy} onClick={(event) => { resolveTrigger.current = event.currentTarget; setConfirmation('rejected'); }}>Rechazar solicitud</button>
        </div> : <div role="alertdialog" aria-label="Confirmar resolución de solicitud">
          <p>{confirmation === 'accepted' ? 'Aceptar para gestión no confirma pago, stock ni total.' : 'Se rechazará la solicitud, sin simular una liberación de stock.'} Esta resolución quedará auditada.</p>
          <button className="button button-secondary" type="button" ref={cancelRef} disabled={busy} onClick={() => { setConfirmation(null); window.requestAnimationFrame(() => resolveTrigger.current?.focus()); }}>Cancelar resolución</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void resolveRequest()}>Confirmar resolución</button>
        </div>}
        {detail.status === 'accepted' ? <AssistedCheckoutAdminPanel requestId={detail.id} onUnauthorized={onUnauthorized} onBusyChange={setPanelBusy} /> : null}
      </article>}
      <div className="payment-return-actions">
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Actualizar solicitudes</button>
        <button className="button button-secondary" type="button" disabled={busy || offset === 0 || rows === null} onClick={() => setOffset((value) => value - 25)}>Solicitudes anteriores</button>
        <button className="button button-secondary" type="button" disabled={busy || !hasMore || rows === null || offset >= 10_000} onClick={() => setOffset((value) => value + 25)}>Solicitudes siguientes</button>
      </div>
    </>}
  </section>;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function invalid(): Error { return new Error('La respuesta administrativa no es válida.'); }
function parseRow(value: unknown): Row {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^req_[A-Za-z0-9_-]{20,128}$/u.test(value.id) ||
      (value.status !== 'submitted' && value.status !== 'accepted' && value.status !== 'rejected') ||
      typeof value.full_name !== 'string' || value.full_name.length > 120) throw invalid();
  return { id: value.id, status: value.status, name: value.full_name };
}
