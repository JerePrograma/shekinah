import { useCallback, useEffect, useRef, useState } from 'react';

type CatalogStatus = Readonly<{
  connection: Readonly<{
    connected: boolean;
    sellerId?: string;
    siteId?: string;
    nickname?: string;
    tokenExpiresAt?: string;
    lastVerifiedAt?: string;
  }>;
  latestRun: Readonly<Record<string, unknown>> | null;
  counts: Readonly<Record<string, unknown>>;
  operations: Readonly<Record<string, unknown>>;
  maxAgeSeconds: number;
}>;

export function MercadoLibrePanel({
  onOperationStateChange,
  onUnauthorized,
}: Readonly<{
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
}>) {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/mercadolibre/status', { credentials: 'same-origin' });
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      const payload = await readJson(response);
      if (!response.ok) throw apiError(payload, 'No se pudo consultar Mercado Libre.');
      if (requestRef.current === requestId) setStatus(parseStatus(payload));
    } catch (caught: unknown) {
      if (requestRef.current === requestId) setError(errorMessage(caught));
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    onOperationStateChange?.(busy, busy ? 'Sincronizando catálogo de Mercado Libre' : undefined);
    return () => onOperationStateChange?.(false);
  }, [busy, onOperationStateChange]);

  async function synchronize(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/mercadolibre/sync', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
      });
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      const payload = await readJson(response);
      if (!response.ok) throw apiError(payload, 'No se pudo sincronizar Mercado Libre.');
      setMessage(syncMessage(payload));
      await refresh();
      window.dispatchEvent(new Event('shekinah:admin-products-refresh'));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function authorize(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/mercadolibre/authorize', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
      });
      if (response.status === 401) {
        onUnauthorized?.();
        return;
      }
      const payload = await readJson(response);
      if (!response.ok) throw apiError(payload, 'No se pudo iniciar la autorización.');
      if (!isRecord(payload) || typeof payload.authorizationUrl !== 'string') {
        throw new Error('El servidor devolvió una autorización no válida.');
      }
      const url = new URL(payload.authorizationUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'auth.mercadolibre.com.ar') {
        throw new Error('El servidor devolvió una autorización no válida.');
      }
      window.location.assign(url.toString());
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <section className="admin-page section" aria-labelledby="admin-mercadolibre-title">
      <div className="container admin-shell">
        <div className="section-heading admin-report-heading">
          <p className="eyebrow">Inventario</p>
          <h2 id="admin-mercadolibre-title">Mercado Libre</h2>
          <p>Estado del catálogo autoritativo, mapeos, frescura y compensaciones intercanal.</p>
        </div>
        {loading ? <p role="status">Consultando sincronización…</p> : null}
        {status === null ? null : (
          <>
            <dl className="admin-summary-grid">
              <Metric label="Conexión" value={status.connection.connected ? 'Conectada' : 'Pendiente'} />
              <Metric label="Seller" value={status.connection.sellerId ?? 'Sin verificar'} />
              <Metric label="Última sincronización" value={textValue(status.latestRun?.status, 'Sin ejecutar')} />
              <Metric label="Procesadas en el último ciclo" value={numberValue(status.latestRun?.processed_count)} />
              <Metric label="Último error" value={textValue(status.latestRun?.error_code, 'Ninguno')} />
              <Metric label="Unidades sincronizadas" value={numberValue(status.counts.unit_count)} />
              <Metric label="Vendibles" value={numberValue(status.counts.sellable_count)} />
              <Metric label="Pausadas" value={numberValue(status.latestRun?.paused_count)} />
              <Metric label="Cerradas" value={numberValue(status.latestRun?.closed_count)} />
              <Metric label="Sin stock" value={numberValue(status.counts.out_of_stock_count)} />
              <Metric label="Sin mapeo" value={numberValue(status.counts.unmapped_count)} />
              <Metric label="Ambiguas o duplicadas" value={numberValue(status.counts.ambiguous_count)} />
              <Metric label="Errores de sincronización" value={numberValue(status.counts.error_count)} />
              <Metric label="Ausentes desde la última sincronización" value={numberValue(status.counts.absent_count)} />
              <Metric label="Obsoletas" value={numberValue(status.counts.stale_count)} />
              <Metric label="Reservas activas" value={numberValue(status.operations.active_reservation_count)} />
              <Metric label="Reservas vencidas" value={numberValue(status.operations.expired_reservation_count)} />
              <Metric label="Operaciones pendientes" value={numberValue(status.operations.pending_count)} />
              <Metric label="Operaciones a conciliar" value={numberValue(status.operations.attention_count)} />
              <Metric label="Pagos aprobados con conflicto" value={numberValue(status.operations.approved_stock_conflict_count)} />
              <Metric label="Reembolsos para revisión" value={numberValue(status.operations.refund_review_count)} />
            </dl>
            <p className="admin-context-note">
              Umbral de obsolescencia: {status.maxAgeSeconds.toLocaleString('es-AR')} segundos.
              Los productos obsoletos o sin reserva versionada quedan bloqueados.
            </p>
            {status.connection.lastVerifiedAt === undefined ? null : (
              <p className="admin-context-note">
                Cuenta verificada: {formatDate(status.connection.lastVerifiedAt)}.
              </p>
            )}
            {typeof status.latestRun?.completed_at !== 'string' ? null : (
              <p className="admin-context-note">
                Último ciclo completado: {formatDate(status.latestRun.completed_at)}.
              </p>
            )}
          </>
        )}
        <div className="admin-order-actions">
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void synchronize()}>
            {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          {status?.connection.connected === true ? null : (
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => void authorize()}>
              Autorizar cuenta vendedora
            </button>
          )}
        </div>
        {message === '' ? null : <p role="status" className="admin-context-note">{message}</p>}
        {error === '' ? null : <p role="alert" className="form-error">{error}</p>}
      </div>
    </section>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return <div><dt>{label}</dt><dd>{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</dd></div>;
}

function parseStatus(value: unknown): CatalogStatus {
  if (
    !isRecord(value) || !isRecord(value.connection) ||
    typeof value.connection.connected !== 'boolean' ||
    !isRecord(value.counts) || !isRecord(value.operations) ||
    typeof value.maxAgeSeconds !== 'number' || !Number.isSafeInteger(value.maxAgeSeconds)
  ) throw new Error('El servidor devolvió un estado de sincronización inválido.');
  return value as unknown as CatalogStatus;
}

function syncMessage(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.summary)) return 'Sincronización completada.';
  return `Sincronización ${String(value.summary.status)}: ${numberValue(value.summary.processed).toLocaleString('es-AR')} unidades procesadas, ${numberValue(value.summary.failed).toLocaleString('es-AR')} errores.`;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function apiError(value: unknown, fallback: string): Error {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string') {
    return new Error(value.error.message);
  }
  return new Error(fallback);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
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
