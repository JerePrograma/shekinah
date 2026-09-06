import { useCallback, useEffect, useRef, useState } from 'react';

type Control = Readonly<{
  migrationApplied: boolean;
  snapshotCollectionEnabled: boolean;
  publicCatalogEnabled: boolean;
  publicCutoverEnabled: boolean;
}>;
type Snapshot = Readonly<{
  itemCount: number;
  syncedAt: string;
  stale: boolean;
  priceCounts: Readonly<Record<'usable' | 'placeholder' | 'missing_or_zero' | 'invalid', number>>;
}>;
type State = Readonly<{ control: Control; snapshot: Snapshot | null; snapshotError: string | null }>;

export function DuxCatalogControls({ onUnauthorized, onOperationStateChange, disabled = false }: Readonly<{
  onUnauthorized?: (() => void) | undefined;
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  disabled?: boolean;
}>) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const enableRef = useRef<HTMLButtonElement>(null);
  const operationRef = useRef(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const response = await fetch('/api/admin/dux/catalog-control', { credentials: 'same-origin' });
      if (response.status === 401) {
        if (requestRef.current === requestId) onUnauthorized?.();
        return;
      }
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      const nextState = parseState(body);
      if (requestRef.current === requestId) {
        setState(nextState);
        setError('');
      }
    } catch (caught: unknown) {
      if (requestRef.current === requestId) {
        setError(caught instanceof Error ? caught.message : 'No se pudo consultar el catálogo Dux.');
      }
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
    const listener = () => { void refresh(); };
    window.addEventListener('shekinah:admin-products-refresh', listener);
    return () => {
      requestRef.current += 1;
      window.removeEventListener('shekinah:admin-products-refresh', listener);
    };
  }, [refresh]);
  useEffect(() => { if (confirming) cancelRef.current?.focus(); }, [confirming]);

  function cancel(): void { setConfirming(false); enableRef.current?.focus(); }

  async function change(body: Readonly<Record<string, unknown>>): Promise<void> {
    if (operationRef.current || disabled) return;
    operationRef.current = true;
    requestRef.current += 1;
    setBusy(true);
    setError('');
    setMessage('');
    onOperationStateChange?.(true, 'Actualizando catálogo Dux');
    try {
      const response = await fetch('/api/admin/dux/catalog-control', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (response.status === 401) { onUnauthorized?.(); return; }
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(payload));
      cancel();
      await refresh();
      setMessage(body.publicCatalogEnabled === false
        ? 'Catálogo local restaurado. El snapshot y los vínculos se conservaron.'
        : 'Control actualizado. Las compras continúan bloqueadas.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el catálogo.');
    } finally {
      operationRef.current = false;
      setBusy(false);
      onOperationStateChange?.(false);
    }
  }

  const snapshot = state?.snapshot ?? null;
  const withoutPrice = snapshot === null ? 0 : snapshot.itemCount - snapshot.priceCounts.usable;
  const blocked = busy || disabled;
  return <section className="admin-context-note" aria-labelledby="dux-catalog-title">
    <h3 id="dux-catalog-title">Catálogo público Dux</h3>
    {state === null ? null : <>
      <dl className="admin-summary-grid">
        <Metric label="Colección de snapshots" value={flag(state.control.snapshotCollectionEnabled)} />
        <Metric label="Catálogo Dux visible" value={flag(state.control.publicCatalogEnabled)} />
        <Metric label="Corte comercial" value={flag(state.control.publicCutoverEnabled)} />
        <Metric label="Productos Dux visibles" value={state.control.publicCatalogEnabled ? snapshot?.itemCount ?? 0 : 0} />
        <Metric label="Productos del snapshot" value={snapshot?.itemCount ?? 0} />
        <Metric label="Precios usables" value={snapshot?.priceCounts.usable ?? 0} />
        <Metric label="Precios placeholder" value={snapshot?.priceCounts.placeholder ?? 0} />
        <Metric label="Precios ausentes o cero" value={snapshot?.priceCounts.missing_or_zero ?? 0} />
        <Metric label="Precios inválidos" value={snapshot?.priceCounts.invalid ?? 0} />
        <Metric label="Compras habilitadas" value={0} />
      </dl>
      <p>{snapshot === null ? 'Sin snapshot disponible.' : `Último snapshot: ${new Date(snapshot.syncedAt).toLocaleString('es-AR')}. ${snapshot.stale ? 'Obsoleto' : 'Fresco'}.`}</p>
      {state.snapshotError === 'DUX_CATALOG_SNAPSHOT_INVALID' ? <p role="alert">El snapshot no superó la validación. Restaurá el catálogo local y revisá la sincronización.</p> : null}
      <p>La visibilidad del catálogo no habilita Checkout Pro ni pedidos por WhatsApp.</p>
      {!state.control.migrationApplied ? <p>La migración 0017 está pendiente. Los controles permanecen cerrados.</p> : <div className="admin-order-actions">
        <button className="button button-secondary" type="button" disabled={blocked}
          onClick={() => void change({ snapshotCollectionEnabled: !state.control.snapshotCollectionEnabled })}>
          {state.control.snapshotCollectionEnabled ? 'Detener colección de snapshots' : 'Habilitar colección de snapshots'}
        </button>
        {state.control.publicCatalogEnabled
          ? <button className="button button-secondary" type="button" disabled={blocked}
            onClick={() => void change({ publicCatalogEnabled: false })}>Restaurar catálogo local</button>
          : <button className="button button-primary" type="button" ref={enableRef}
            disabled={blocked || snapshot === null || snapshot.itemCount === 0}
            onClick={() => setConfirming(true)}>Habilitar catálogo público Dux</button>}
      </div>}
      {confirming ? <div className="admin-inline-confirmation" role="dialog"
        aria-labelledby="dux-enable-title" aria-describedby="dux-enable-description"
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); cancel(); } }}>
        <h4 id="dux-enable-title">Confirmar publicación del catálogo Dux</h4>
        <p id="dux-enable-description">Se mostrarán {snapshot?.itemCount ?? 0} productos Dux; {withoutPrice} mostrarán “Consultar precio”. Los productos exclusivamente locales dejarán de aparecer. Las compras seguirán bloqueadas.</p>
        <button className="button button-secondary" ref={cancelRef} type="button" disabled={blocked} onClick={cancel}>Cancelar</button>
        <button className="button button-primary" type="button" disabled={blocked}
          onClick={() => void change({ publicCatalogEnabled: true, confirmation: 'ENABLE_DUX_PUBLIC_CATALOG' })}>Confirmar publicación</button>
      </div> : null}
    </>}
    {message === '' ? null : <p role="status">{message}</p>}
    {error === '' ? null : <p role="alert" className="form-error">{error}</p>}
  </section>;
}

function parseState(value: unknown): State {
  if (!record(value) || !record(value.control)) throw new Error('El control del catálogo no es válido.');
  const c = value.control;
  if (typeof c.migrationApplied !== 'boolean' || typeof c.snapshotCollectionEnabled !== 'boolean' ||
    typeof c.publicCatalogEnabled !== 'boolean' || typeof c.publicCutoverEnabled !== 'boolean') {
    throw new Error('El control del catálogo no es válido.');
  }
  let snapshot: Snapshot | null = null;
  if (value.snapshot !== null) {
    const s = value.snapshot;
    if (!record(s) || !record(s.priceCounts) || !count(s.itemCount) || typeof s.syncedAt !== 'string' ||
      !Number.isFinite(Date.parse(s.syncedAt)) || typeof s.stale !== 'boolean' ||
      !count(s.priceCounts.usable) || !count(s.priceCounts.placeholder) ||
      !count(s.priceCounts.missing_or_zero) || !count(s.priceCounts.invalid) ||
      s.priceCounts.usable + s.priceCounts.placeholder + s.priceCounts.missing_or_zero + s.priceCounts.invalid !== s.itemCount ||
      s.checkoutEligibleCount !== 0) throw new Error('El snapshot del catálogo no es válido.');
    snapshot = { itemCount: s.itemCount, syncedAt: s.syncedAt, stale: s.stale,
      priceCounts: { usable: s.priceCounts.usable, placeholder: s.priceCounts.placeholder,
        missing_or_zero: s.priceCounts.missing_or_zero, invalid: s.priceCounts.invalid } };
  }
  return { control: { migrationApplied: c.migrationApplied, snapshotCollectionEnabled: c.snapshotCollectionEnabled,
    publicCatalogEnabled: c.publicCatalogEnabled, publicCutoverEnabled: c.publicCutoverEnabled }, snapshot,
    snapshotError: typeof value.snapshotError === 'string' ? value.snapshotError : null };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function flag(value: boolean): string { return value ? 'Habilitado' : 'Deshabilitado'; }
function apiMessage(value: unknown): string {
  return record(value) && record(value.error) && typeof value.error.message === 'string' ? value.error.message : 'No se pudo completar la operación del catálogo.';
}
function Metric({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return <div><dt>{label}</dt><dd>{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</dd></div>;
}
