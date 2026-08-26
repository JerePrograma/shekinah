import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef(0);

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
    onOperationStateChange?.(busy, busy ? 'Sincronizando inventario Dux' : undefined);
    return () => onOperationStateChange?.(false);
  }, [busy, onOperationStateChange]);

  async function synchronize(): Promise<void> {
    if (busy || status?.enabled !== true) return;
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
          <h2 id="admin-dux-title">Dux Software</h2>
          <p>
            Dux es la fuente autoritativa de stock, unidades y depósitos. Shekinah sólo conserva
            una observación operativa y el vínculo con su catálogo editorial.
          </p>
        </div>
        {loading ? <p role="status">Consultando configuración y sincronización Dux…</p> : null}
        {status === null ? null : (
          <>
            <dl className="admin-summary-grid">
              <Metric
                label="Plan / token API"
                value={status.enabled ? 'Acceso configurado' : 'Pendiente o no disponible'}
              />
              <Metric
                label="Configuración Dux"
                value={status.tenant === null ? 'Sin verificar' : 'Verificada'}
              />
              <Metric label="Empresa" value={status.tenant?.companyName ?? 'Sin verificar'} />
              <Metric label="Sucursal" value={status.tenant?.branchName ?? 'Sin verificar'} />
              <Metric label="Depósito" value={status.tenant?.depositName ?? 'Sin verificar'} />
              <Metric
                label="Última sincronización"
                value={latestRunText(status.latestRun, 'Sin ejecutar')}
              />
              <Metric
                label="Procesados en el último ciclo"
                value={latestRunNumber(status.latestRun, 'processed', 'processed_count')}
              />
              <Metric
                label="Errores en el último ciclo"
                value={latestRunNumber(status.latestRun, 'failed', 'failed_count')}
              />
              <Metric label="Items observados" value={status.counts.inventoryCount} />
              <Metric label="Vinculados" value={status.counts.mappedCount} />
              <Metric label="Sin vincular a Dux" value={status.counts.unmappedCount} />
              <Metric label="Vínculos ambiguos" value={status.counts.ambiguousCount} />
              <Metric label="Elegibles para Checkout" value={status.counts.checkoutEligibleCount} />
              <Metric label="Datos obsoletos" value={status.counts.staleCount} />
              <Metric label="Errores de sincronización" value={status.counts.errorCount} />
              <Metric label="Ausentes en Dux" value={status.counts.absentCount} />
              <Metric
                label="Semántica de unidades"
                value={status.unitSemanticsReady ? 'Verificada' : 'Pendiente'}
              />
              <Metric
                label="Ciclo de reservas"
                value={status.lifecycleReady ? 'Verificado' : 'Bloqueado'}
              />
            </dl>
            <p className="admin-context-note">
              Umbral de frescura: {status.maxAgeSeconds.toLocaleString('es-AR')} segundos. Un dato
              obsoleto nunca autoriza una venta.
            </p>
            {status.tenant === null ? null : (
              <p className="admin-context-note">
                Configuración verificada el {formatDate(status.tenant.verifiedAt)}. Identificadores:
                empresa {status.tenant.companyId}, sucursal {status.tenant.branchId}, depósito{' '}
                {status.tenant.depositId}.
              </p>
            )}
            {latestRunDate(status.latestRun) === null ? null : (
              <p className="admin-context-note">
                Último ciclo completado: {formatDate(latestRunDate(status.latestRun) ?? '')}.
              </p>
            )}
            <Blockers status={status} />
          </>
        )}
        {status?.enabled === true ? (
          <div className="admin-order-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={busy || loading}
              onClick={() => void synchronize()}
            >
              {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>
        ) : null}
        {status?.enabled === false ? (
          <p className="admin-context-note">
            La sincronización permanece deshabilitada hasta contar con un plan, token y
            configuración Dux válidos.
          </p>
        ) : null}
        {message === '' ? null : <p role="status" className="admin-context-note">{message}</p>}
        {error === '' ? null : <p role="alert" className="form-error">{error}</p>}
      </div>
    </section>
  );
}

function Blockers({ status }: Readonly<{ status: DuxStatus }>) {
  const implicitBlockers = [
    ...(status.unitSemanticsReady ? [] : ['La semántica de unidades y cantidades no está verificada.']),
    ...(status.lifecycleReady ? [] : ['La liberación y finalización de reservas no está demostrada.']),
  ];
  const blockers = [...status.blockers, ...implicitBlockers]
    .filter((value, index, values) => values.indexOf(value) === index);
  if (blockers.length === 0) return null;
  return (
    <section className="admin-context-note" aria-labelledby="dux-blockers-title">
      <h3 id="dux-blockers-title">Bloqueos de activación</h3>
      <ul>
        {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
      </ul>
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
  return `Sincronización ${summary.status}: ${summary.processed.toLocaleString('es-AR')} procesados, ${summary.mapped.toLocaleString('es-AR')} vinculados, ${summary.unmapped.toLocaleString('es-AR')} sin vincular, ${summary.ambiguous.toLocaleString('es-AR')} ambiguos, ${summary.absent.toLocaleString('es-AR')} ausentes y ${summary.failed.toLocaleString('es-AR')} errores.`;
}

function latestRunText(
  latestRun: Readonly<Record<string, unknown>> | null,
  fallback: string,
): string {
  if (latestRun === null) return fallback;
  return textValue(latestRun.status, fallback);
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
  return Number.isNaN(date.getTime()) ? 'fecha no disponible' : date.toLocaleString('es-AR');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
