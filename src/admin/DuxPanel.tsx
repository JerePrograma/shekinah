import { useCallback, useEffect, useRef, useState } from 'react';
import { DuxCatalogControls } from './DuxCatalogControls';
import { DuxEditorialReviewPanel } from './DuxEditorialReviewPanel';
import { MercadoLibreEditorialPanel } from './MercadoLibreEditorialPanel';

type DuxTenant = Readonly<{
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  depositId: string;
  depositName: string;
  verifiedAt: string;
}>;

type DuxCounts = Readonly<{
  inventoryCount: number;
  mappedCount: number;
  unmappedCount: number;
  ambiguousCount: number;
  staleCount: number;
  errorCount: number;
  absentCount: number;
  checkoutEligibleCount: number;
}>;

type DuxStatus = Readonly<{
  enabled: boolean;
  lifecycleReady: boolean;
  unitSemanticsReady: boolean;
  tenant: DuxTenant | null;
  latestRun: Readonly<Record<string, unknown>> | null;
  counts: DuxCounts;
  maxAgeSeconds: number;
  blockers: readonly string[];
}>;

type SyncSummary = Readonly<{
  status: string;
  processed: number;
  failed: number;
  mapped: number;
  unmapped: number;
  ambiguous: number;
  absent: number;
}>;

export function DuxPanel({
  onOperationStateChange,
  onUnauthorized,
}: Readonly<{
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
}>) {
  const [status, setStatus] = useState<DuxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [editorialBusy, setEditorialBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const catalogOperation = useCallback((active: boolean) => setCatalogBusy(active), []);
  const editorialOperation = useCallback((active: boolean) => setEditorialBusy(active), []);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/dux/status', { credentials: 'same-origin' });
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      const payload = await readJson(response);
      if (!response.ok) throw apiError(payload, 'No se pudo consultar el estado de Dux.');
      if (requestRef.current === requestId) setStatus(parseStatus(payload));
    } catch (caught: unknown) {
      if (requestRef.current === requestId) setError(errorMessage(caught));
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
    return () => {
      requestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const active = busy || catalogBusy || editorialBusy;
    onOperationStateChange?.(active, busy ? 'Actualizando productos desde Dux' : active ? 'Actualizando catálogo Dux' : undefined);
    return () => onOperationStateChange?.(false);
  }, [busy, catalogBusy, editorialBusy, onOperationStateChange]);

  async function synchronize(): Promise<void> {
    if (busy || catalogBusy || editorialBusy || status?.enabled !== true) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/dux/sync', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
      });
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      const payload = await readJson(response);
      if (!response.ok) throw apiError(payload, 'No se pudo sincronizar el inventario Dux.');
      setMessage(syncMessage(parseSyncSummary(payload)));
      await refresh();
      window.dispatchEvent(new Event('shekinah:admin-products-refresh'));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page section" aria-labelledby="admin-dux-title">
      <div className="container admin-shell">
        <div className="section-heading admin-report-heading">
          <p className="eyebrow">Inventario</p>
          <h2 id="admin-dux-title" ref={titleRef} tabIndex={-1}>Dux Software</h2>
          <p>
            Los productos, precios y existencias se administran en Dux. Actualizalos acá para
            traer la información del negocio a Shekinah.
          </p>
        </div>
        {status?.enabled === true ? (
          <div className="admin-order-actions">
            <button className="button button-primary" type="button"
              disabled={busy || catalogBusy || editorialBusy || loading}
              onClick={() => void synchronize()}>
              {busy ? 'Actualizando productos…' : 'Actualizar productos desde Dux'}
            </button>
          </div>
        ) : null}
        {loading ? <p role="status">Consultando los productos de Dux…</p> : null}
        {status === null ? null : (
          <>
            <dl className="admin-summary-grid">
              <Metric
                label="Última actualización"
                value={latestRunText(status.latestRun, 'Sin ejecutar')}
              />
              <Metric
                label="Productos y variantes revisados"
                value={latestRunNumber(status.latestRun, 'processed', 'processed_count')}
              />
              <Metric
                label="Problemas en la última actualización"
                value={latestRunNumber(status.latestRun, 'failed', 'failed_count')}
              />
            </dl>
            {latestRunDate(status.latestRun) === null ? null : (
              <p className="admin-context-note">
                Última actualización terminada: {formatDate(latestRunDate(status.latestRun) ?? '')}.
              </p>
            )}
            <details>
              <summary>Información del negocio y sus productos</summary>
              <dl className="admin-summary-grid">
                <Metric label="Actualización desde Dux" value={status.enabled ? 'Habilitada' : 'No habilitada'} />
                <Metric label="Datos del negocio" value={status.tenant === null ? 'Sin verificar' : 'Verificada'} />
                <Metric label="Empresa" value={status.tenant?.companyName ?? 'Sin verificar'} />
                <Metric label="Sucursal" value={status.tenant?.branchName ?? 'Sin verificar'} />
                <Metric label="Depósito" value={status.tenant?.depositName ?? 'Sin verificar'} />
                <Metric label="Productos y variantes consultados" value={status.counts.inventoryCount} />
                <Metric label="Sin actualización reciente" value={status.counts.staleCount} />
                <Metric label="Productos con problemas de actualización" value={status.counts.errorCount} />
                <Metric label="Ya no encontrados en Dux" value={status.counts.absentCount} />
              </dl>
            </details>
            <details>
              <summary>Información para soporte: conexión con Dux</summary>
              <dl className="admin-summary-grid">
                <Metric label="Estado de sincronización" value={textValue(status.latestRun?.status, 'Sin ejecutar')} />
                <Metric label="Vinculados" value={status.counts.mappedCount} />
                <Metric label="Sin vincular a Dux" value={status.counts.unmappedCount} />
                <Metric label="Vínculos ambiguos" value={status.counts.ambiguousCount} />
                <Metric label="Elegibles para Checkout" value={status.counts.checkoutEligibleCount} />
                <Metric label="Semántica de unidades" value={status.unitSemanticsReady ? 'Verificada' : 'Pendiente'} />
                <Metric label="Ciclo de reservas" value={status.lifecycleReady ? 'Verificado' : 'Bloqueado'} />
              </dl>
              <p>Antigüedad máxima de datos: {status.maxAgeSeconds.toLocaleString('es-AR')} segundos.</p>
              <p>Este diagnóstico de inventario no determina por sí solo la disponibilidad del pago.</p>
              {status.tenant === null ? null : <p>Configuración verificada el {formatDate(status.tenant.verifiedAt)}.
                Identificadores: empresa {status.tenant.companyId}, sucursal {status.tenant.branchId}, depósito {status.tenant.depositId}.</p>}
              {status.blockers.length === 0 ? null : <ul>{status.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
            </details>
          </>
        )}
        {status?.enabled === false ? (
          <p className="admin-context-note">
            La actualización desde Dux no está habilitada.
            Contactá a soporte para revisar la preparación del negocio.
          </p>
        ) : null}
        {message === '' ? null : <p role="status" className="admin-context-note">{message}</p>}
        {error === '' ? null : <><p role="alert" className="form-error">No pudimos consultar o actualizar los productos de Dux. Volvé a consultar su estado antes de intentar una actualización.</p>
          <details><summary>Información para soporte: error de Dux</summary><p>{error}</p></details></>}
        {error === '' ? null : <div><button type="button" className="button button-secondary"
          disabled={loading || busy || catalogBusy || editorialBusy}
          onClick={() => { titleRef.current?.focus(); void refresh(); }}>Volver a consultar Dux</button></div>}
        {status === null ? null : <>
          <DuxCatalogControls disabled={busy || editorialBusy} onOperationStateChange={catalogOperation} onUnauthorized={onUnauthorized} />
          <MercadoLibreEditorialPanel onUnauthorized={onUnauthorized} />
          <details><summary>Información para soporte: revisión histórica de contenido</summary>
            <p>Este registro se conserva para consulta. Las decisiones de contenido actuales se revisan en Mercado Libre.</p>
            <DuxEditorialReviewPanel disabled onOperationStateChange={editorialOperation} onUnauthorized={onUnauthorized} />
          </details>
        </>}
      </div>
    </section>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</dd>
    </div>
  );
}

function parseStatus(value: unknown): DuxStatus {
  if (
    !isRecord(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.lifecycleReady !== 'boolean' ||
    typeof value.unitSemanticsReady !== 'boolean' ||
    (value.tenant !== null && !isRecord(value.tenant)) ||
    (value.latestRun !== null && !isRecord(value.latestRun)) ||
    !isRecord(value.counts) ||
    !isNonNegativeInteger(value.maxAgeSeconds) ||
    !Array.isArray(value.blockers) ||
    !value.blockers.every(isNonEmptyString)
  ) {
    throw new Error('El servidor devolvió un estado Dux inválido.');
  }
  const counts = parseCounts(value.counts);
  const tenant = value.tenant === null ? null : parseTenant(value.tenant);
  return Object.freeze({
    enabled: value.enabled,
    lifecycleReady: value.lifecycleReady,
    unitSemanticsReady: value.unitSemanticsReady,
    tenant,
    latestRun: value.latestRun === null ? null : Object.freeze({ ...value.latestRun }),
    counts,
    maxAgeSeconds: value.maxAgeSeconds,
    blockers: Object.freeze(value.blockers.map((blocker) => blocker.trim())),
  });
}

function parseTenant(value: Readonly<Record<string, unknown>>): DuxTenant {
  const companyId = parseIdentifier(value.companyId);
  const branchId = parseIdentifier(value.branchId);
  const depositId = parseIdentifier(value.depositId);
  if (
    companyId === null ||
    branchId === null ||
    depositId === null ||
    !isNonEmptyString(value.companyName) ||
    !isNonEmptyString(value.branchName) ||
    !isNonEmptyString(value.depositName) ||
    !isValidDateString(value.verifiedAt)
  ) {
    throw new Error('El servidor devolvió una configuración Dux inválida.');
  }
  return Object.freeze({
    companyId,
    companyName: value.companyName.trim(),
    branchId,
    branchName: value.branchName.trim(),
    depositId,
    depositName: value.depositName.trim(),
    verifiedAt: value.verifiedAt,
  });
}

function parseCounts(value: Readonly<Record<string, unknown>>): DuxCounts {
  const keys = [
    'inventoryCount',
    'mappedCount',
    'unmappedCount',
    'ambiguousCount',
    'staleCount',
    'errorCount',
    'absentCount',
    'checkoutEligibleCount',
  ] as const;
  if (!keys.every((key) => isNonNegativeInteger(value[key]))) {
    throw new Error('El servidor devolvió métricas Dux inválidas.');
  }
  return Object.freeze({
    inventoryCount: value.inventoryCount as number,
    mappedCount: value.mappedCount as number,
    unmappedCount: value.unmappedCount as number,
    ambiguousCount: value.ambiguousCount as number,
    staleCount: value.staleCount as number,
    errorCount: value.errorCount as number,
    absentCount: value.absentCount as number,
    checkoutEligibleCount: value.checkoutEligibleCount as number,
  });
}

function parseSyncSummary(value: unknown): SyncSummary {
  if (!isRecord(value) || !isRecord(value.summary)) {
    throw new Error('El servidor devolvió un resultado de sincronización inválido.');
  }
  const summary = value.summary;
  const status = summary.status;
  const countKeys = ['processed', 'failed', 'mapped', 'unmapped', 'ambiguous', 'absent'] as const;
  if (!isNonEmptyString(status) || !countKeys.every((key) => isNonNegativeInteger(summary[key]))) {
    throw new Error('El servidor devolvió un resultado de sincronización inválido.');
  }
  return Object.freeze({
    status: status.trim(),
    processed: summary.processed as number,
    failed: summary.failed as number,
    mapped: summary.mapped as number,
    unmapped: summary.unmapped as number,
    ambiguous: summary.ambiguous as number,
    absent: summary.absent as number,
  });
}

function syncMessage(summary: SyncSummary): string {
  const result = summary.status === 'succeeded' ? 'Actualización completada.'
    : summary.status === 'partial' ? 'La actualización quedó incompleta. Revisá los problemas antes de volver a actualizar.'
      : 'No pudimos completar la actualización. Consultá el estado de Dux antes de reintentar.';
  return `${result} ${summary.processed.toLocaleString('es-AR')} productos y variantes revisados y ${summary.failed.toLocaleString('es-AR')} problemas de actualización.`;
}

function latestRunText(
  latestRun: Readonly<Record<string, unknown>> | null,
  fallback: string,
): string {
  if (latestRun === null) return fallback;
  const labels: Readonly<Record<string, string>> = { succeeded: 'Completada', partial: 'Incompleta: requiere revisión', failed: 'No se completó', running: 'En curso' };
  const status = textValue(latestRun.status, '');
  return (Object.hasOwn(labels, status) ? labels[status] : undefined) ?? 'Estado no reconocido: consultar soporte';
}

function latestRunNumber(
  latestRun: Readonly<Record<string, unknown>> | null,
  camelKey: string,
  snakeKey: string,
): number {
  if (latestRun === null) return 0;
  const value = latestRun[camelKey] ?? latestRun[snakeKey];
  return isNonNegativeInteger(value) ? value : 0;
}

function latestRunDate(latestRun: Readonly<Record<string, unknown>> | null): string | null {
  if (latestRun === null) return null;
  const value = latestRun.completedAt ?? latestRun.completed_at;
  return isValidDateString(value) ? value : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(value: unknown, fallback: string): Error {
  if (isRecord(value) && isRecord(value.error) && isNonEmptyString(value.error.message)) {
    return new Error(value.error.message);
  }
  return new Error(fallback);
}

function textValue(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function parseIdentifier(value: unknown): string | null {
  if (isNonEmptyString(value)) return value.trim();
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isValidDateString(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'fecha no disponible' : date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour12: false,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
