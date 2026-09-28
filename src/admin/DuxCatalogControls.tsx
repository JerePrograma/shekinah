import { useCallback, useEffect, useRef, useState } from 'react';

type Control = Readonly<{
  manualCatalogRetired: boolean;
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const enableRef = useRef<HTMLButtonElement>(null);
  const operationRef = useRef(false);
  const requestRef = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
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
    } finally {
      if (requestRef.current === requestId) setLoading(false);
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
    setLoading(false);
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
        ? state?.control.manualCatalogRetired ? 'Catálogo oculto para los visitantes.' : 'Se volvió al catálogo anterior. La información de Dux se conservó.'
        : body.publicCatalogEnabled === true ? 'Catálogo de Dux publicado en la tienda.'
          : body.snapshotCollectionEnabled === true ? 'La recepción de productos de Dux está habilitada.' : 'La recepción de productos de Dux está detenida.');
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
    <h3 id="dux-catalog-title" ref={titleRef} tabIndex={-1}>Catálogo de la tienda</h3>
    <p>Elegí si los visitantes pueden ver los productos de Dux. Estos controles no cambian la disponibilidad del pago.</p>
    {loading ? <p role="status">Consultando el catálogo de la tienda…</p> : null}
    {state === null ? null : <>
      <dl className="admin-summary-grid">
        <Metric label="Visibilidad" value={state.control.publicCatalogEnabled ? 'Visible para los visitantes' : 'Oculto para los visitantes'} />
        <Metric label="Productos recibidos de Dux" value={snapshot?.itemCount ?? 0} />
        <Metric label="Con precio disponible" value={snapshot?.priceCounts.usable ?? 0} />
        <Metric label="Sin precio disponible" value={withoutPrice} />
      </dl>
      <p>{snapshot === null ? 'Todavía no hay productos recibidos. Actualizá los productos de Dux antes de publicar el catálogo.' : `Última recepción de productos: ${new Date(snapshot.syncedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })}. ${snapshot.stale ? 'La información necesita actualizarse desde Dux.' : 'La información está dentro del plazo de actualización.'}`}</p>
      {state.snapshotError === null ? null : <p role="alert">No pudimos comprobar la información del catálogo. Actualizá los productos de Dux; si el problema continúa, contactá a soporte.</p>}
      {!state.control.migrationApplied ? <p>La publicación todavía no está disponible. Contactá a soporte para completar la preparación de la tienda.</p> : <div className="admin-order-actions">
        {state.control.publicCatalogEnabled
          ? <button className="button button-secondary" type="button" disabled={blocked}
            onClick={() => void change({ publicCatalogEnabled: false })}>{state.control.manualCatalogRetired ? 'Ocultar catálogo de la tienda' : 'Volver al catálogo anterior'}</button>
          : <button className="button button-primary" type="button" ref={enableRef}
            disabled={blocked || snapshot === null || snapshot.itemCount === 0}
            onClick={() => setConfirming(true)}>Mostrar catálogo en la tienda</button>}
      </div>}
      {confirming ? <div className="admin-inline-confirmation" role="dialog"
        aria-labelledby="dux-enable-title" aria-describedby="dux-enable-description"
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); cancel(); } }}>
        <h4 id="dux-enable-title">Confirmar publicación del catálogo Dux</h4>
        <p id="dux-enable-description">El catálogo usará los {snapshot?.itemCount ?? 0} productos recibidos de Dux; {withoutPrice} no tienen precio disponible. Los productos dados de baja seguirán ocultos. Esta acción no habilita ni deshabilita el pago.</p>
        <button className="button button-secondary" ref={cancelRef} type="button" disabled={blocked} onClick={cancel}>Cancelar</button>
        <button className="button button-primary" type="button" disabled={blocked}
          onClick={() => void change({ publicCatalogEnabled: true, confirmation: 'ENABLE_DUX_PUBLIC_CATALOG' })}>Confirmar publicación</button>
      </div> : null}
      <details>
        <summary>Información para soporte: configuración del catálogo</summary>
        <dl className="admin-summary-grid">
          <Metric label="Colección de snapshots" value={flag(state.control.snapshotCollectionEnabled)} />
          <Metric label="Corte comercial" value={flag(state.control.publicCutoverEnabled)} />
          <Metric label="Precios placeholder" value={snapshot?.priceCounts.placeholder ?? 0} />
          <Metric label="Precios ausentes o cero" value={snapshot?.priceCounts.missing_or_zero ?? 0} />
          <Metric label="Precios inválidos" value={snapshot?.priceCounts.invalid ?? 0} />
        </dl>
        <p>Migración 0017: {state.control.migrationApplied ? 'aplicada' : 'pendiente'}. Catálogo manual: {state.control.manualCatalogRetired ? 'retirado' : 'no retirado'}.</p>
        {state.snapshotError === null ? null : <p>{state.snapshotError}</p>}
        {state.control.migrationApplied ? <button className="button button-secondary" type="button" disabled={blocked}
          onClick={() => void change({ snapshotCollectionEnabled: !state.control.snapshotCollectionEnabled })}>
          {state.control.snapshotCollectionEnabled ? 'Detener recepción de productos de Dux' : 'Habilitar recepción de productos de Dux'}
        </button> : null}
      </details>
    </>}
    {message === '' ? null : <p role="status">{message}</p>}
    {error === '' ? null : <><p role="alert" className="form-error">No pudimos consultar o cambiar la publicación del catálogo. Volvé a consultar su estado antes de intentar otro cambio.</p>
      <button className="button button-secondary" type="button" disabled={blocked || loading} onClick={() => { titleRef.current?.focus(); void refresh(); }}>Volver a consultar el catálogo</button>
      <details><summary>Información para soporte: error del catálogo</summary><p>{error}</p></details></>}
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
  return { control: { manualCatalogRetired: c.manualCatalogRetired === true, migrationApplied: c.migrationApplied, snapshotCollectionEnabled: c.snapshotCollectionEnabled,
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
