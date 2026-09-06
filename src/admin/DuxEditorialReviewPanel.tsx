import { useCallback, useEffect, useRef, useState } from 'react';
import type { listDuxEditorialTriage } from '../../server/dux-editorial-triage';

type TriagePage = Awaited<ReturnType<typeof listDuxEditorialTriage>>;
type ReviewRow = TriagePage['rows'][number];
type ReviewDecision = 'approve' | 'reject' | 'discard' | 'deactivate';

export function DuxEditorialReviewPanel({ disabled = false, onOperationStateChange, onUnauthorized }: Readonly<{
  disabled?: boolean;
  onOperationStateChange?: ((busy: boolean, label?: string) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
}>) {
  const [page, setPage] = useState<TriagePage | null>(null);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/dux/editorial-triage?${new URLSearchParams({
        status: filter, search: query, offset: String(offset), limit: '20',
      }).toString()}`, { credentials: 'same-origin' });
      if (response.status === 401) { onUnauthorized?.(); return; }
      const result: unknown = await response.json();
      if (!response.ok) throw responseError(result);
      if (requestRef.current === requestId) setPage(parsePage(result));
    } catch (caught: unknown) {
      if (requestRef.current === requestId) setError(caught instanceof Error ? caught.message : 'No se pudo consultar la revisión.');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [filter, query, offset, onUnauthorized]);

  useEffect(() => { void refresh(); return () => { requestRef.current += 1; }; }, [refresh]);
  useEffect(() => {
    onOperationStateChange?.(busy, busy ? 'Guardando revisión editorial Dux' : undefined);
    return () => onOperationStateChange?.(false);
  }, [busy, onOperationStateChange]);

  async function mutate(path: string, body?: Record<string, unknown>) {
    if (busy || disabled) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin', redirect: 'error',
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (response.status === 401) { onUnauthorized?.(); return; }
      const result: unknown = await response.json();
      if (!response.ok) throw responseError(result);
      setMessage(body === undefined ? 'Clasificación importada. Los productos pendientes o descartados conservan los datos de Dux.' : 'Decisión editorial registrada.');
      await refresh();
      window.dispatchEvent(new Event('shekinah:admin-products-refresh'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la revisión.');
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="dux-editorial-review-title" className="admin-context-note">
    <h3 id="dux-editorial-review-title">Revisión editorial Dux</h3>
    <p>Los vínculos sólo reutilizan imágenes y descripción. Pendientes y descartados siguen visibles con la información de Dux cuando el catálogo público está habilitado.</p>
    {page === null ? null : <>
      <dl className="admin-summary-grid">
        {([
          ['Auto-confirmados', page.counts.autoConfirmed], ['Pendientes manuales', page.counts.pendingManualReview],
          ['Aprobados manualmente', page.counts.approvedManual], ['Rechazados', page.counts.rejected],
          ['Enriquecimientos descartados', page.counts.discardedEnrichment],
        ] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
      </dl>
      <p>{page.mercadoLibreEvidenceCount} evidencias Mercado Libre. Sólo corroboran identidad; no autorizan vínculos ni aportan precio o stock.</p>
      {page.counts.total !== 0 ? null : <button type="button" className="button button-secondary" disabled={busy || disabled}
        onClick={() => void mutate('/api/admin/dux/editorial-triage/import')}>Importar clasificación editorial versionada</button>}
    </>}
    <form onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(search); }}>
      <label htmlFor="dux-triage-search">Buscar por código o nombre Dux del análisis</label>
      <input id="dux-triage-search" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} disabled={busy || disabled} />
      <label htmlFor="dux-triage-filter">Estado de revisión</label>
      <select id="dux-triage-filter" value={filter} disabled={busy || disabled} onChange={(event) => { setFilter(event.target.value); setOffset(0); }}>
        <option value="pending">Pendientes manuales</option><option value="approved">Aprobados manualmente</option>
        <option value="rejected">Rechazados</option><option value="discarded">Descartados</option>
        <option value="auto_confirmed">Auto-confirmados</option><option value="all">Todos</option>
      </select>
      <button className="button button-secondary" disabled={busy || disabled || loading} type="submit">Buscar casos</button>
    </form>
    {loading ? <p role="status">Consultando revisión editorial…</p> : null}
    {page === null ? null : <>
      <p>{page.total} casos en este filtro. Página {Math.floor(offset / 20) + 1}.</p>
      {page.rows.map((row) => <ReviewCase key={`${row.code}:${row.reviewState}:${row.updatedAt}`} row={row} disabled={busy || disabled || loading}
        onReview={(body) => void mutate('/api/admin/dux/editorial-triage/review', body)} />)}
      {page.total !== 0 ? null : <p>No hay casos para estos criterios.</p>}
      <nav aria-label="Páginas de revisión editorial" className="admin-order-actions">
        <button type="button" className="button button-secondary" disabled={busy || disabled || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Casos anteriores</button>
        <button type="button" className="button button-secondary" disabled={busy || disabled || loading || offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Casos siguientes</button>
      </nav>
    </>}
    {message === '' ? null : <p role="status">{message}</p>}
    {error === '' ? null : <p role="alert" className="form-error">{error}</p>}
    <button type="button" className="button button-secondary" disabled={busy || disabled || loading} onClick={() => void refresh()}>Actualizar revisión</button>
  </section>;
}

function ReviewCase({ row, disabled, onReview }: Readonly<{
  row: ReviewRow; disabled: boolean; onReview: (body: Record<string, unknown>) => void;
}>) {
  const [selectedId, setSelectedId] = useState('');
  const [images, setImages] = useState(false);
  const [description, setDescription] = useState(false);
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<ReviewDecision>('approve');
  const candidate = row.candidates.find((entry) => entry.localProductId === selectedId);
  const canApprove = candidate?.exists === true && (images || description)
    && (!images || candidate.images.length > 0) && (!description || (candidate.description ?? '').trim() !== '');
  return <details>
    <summary>{row.evidence.duxNameAtAnalysis} — {row.code}{row.candidates.some((entry) => entry.mercadoLibreEvidence.length > 0) ? ' · Identidad corroborada' : ''}</summary>
    <p>Nombre y candidatos del análisis histórico. Estado: {row.evidence.analysisStatus}. Método: {row.evidence.decisionMethod}.</p>
    {row.currentDux === null ? <p>Sin producto en el snapshot actual disponible. Este registro conserva únicamente la evidencia histórica.</p> : <p>
      Dux actual: {row.currentDux.name} ({row.currentDux.code}). Categorías: {row.currentDux.categories.map((category) => category.name).join(', ')}.
      Estado del precio Dux: {row.currentDux.priceStatus}{row.currentDux.priceAmount === null ? '' : ` · ${row.currentDux.priceAmount.toLocaleString('es-AR')} ARS`}.
      Snapshot: {row.currentDux.syncedAt}.
    </p>}
    <p>Recomendación del análisis: imagen {row.evidence.recommendedReuse.images ? 'sí' : 'no'}; descripción {row.evidence.recommendedReuse.description ? 'sí' : 'no'}. Requiere verificación humana.</p>
    {row.evidence.blockers.length === 0 ? null : <p>Motivos de revisión: {row.evidence.blockers.join(', ')}.</p>}
    {row.reason === null ? null : <p>Última decisión: {row.reason}. Actor: {row.updatedBy}.</p>}
    {row.reviewState !== 'pending' && !row.activeLink ? null : <form onSubmit={(event) => {
      event.preventDefault();
      const chosen = row.reviewState !== 'pending' ? 'deactivate' : decision;
      onReview({ code: row.code, decision: chosen, reason,
        ...(chosen === 'approve' ? { localProductId: selectedId, reuseImages: images, reuseDescription: description } : {}),
      });
    }}>
      {row.reviewState !== 'pending' ? <p>Desactivar quita el enriquecimiento y conserva la evidencia histórica. Los casos manuales vuelven a revisión.</p> : <>
        <fieldset disabled={disabled}><legend>Candidatos permitidos</legend>
          {row.candidates.map((entry) => <div key={entry.localProductId}>
            <label><input type="radio" name={`candidate-${row.code}`} checked={selectedId === entry.localProductId} disabled={!entry.exists}
              onChange={() => { setSelectedId(entry.localProductId); setImages(false); setDescription(false); }} />{entry.name} ({entry.localProductId})</label>
            <p>Presentación: {entry.presentationRelation}. Evidencia: {entry.reason}. {entry.exists ? '' : 'Ficha local ausente.'}</p>
            {entry.images.slice(0, 1).map((entryImage) => <img key={entryImage.src} src={entryImage.src} alt={entryImage.alt} width="96" height="96" loading="lazy" />)}
            {entry.description === null ? <p>Sin descripción.</p> : <p>{entry.description}</p>}
            {entry.mercadoLibreEvidence.length === 0 ? null : <p>Corroboración Mercado Libre por SKU y vínculo local exactos: {entry.mercadoLibreEvidence.map((unit) => unit.itemId).join(', ')}.</p>}
          </div>)}
        </fieldset>
        <label><input type="checkbox" checked={images} disabled={disabled || !candidate?.exists || candidate.images.length === 0} onChange={(event) => setImages(event.target.checked)} />Reutilizar imágenes</label>
        <label><input type="checkbox" checked={description} disabled={disabled || !candidate?.exists || (candidate.description ?? '').trim() === ''} onChange={(event) => setDescription(event.target.checked)} />Reutilizar descripción</label>
        <label htmlFor={`decision-${row.code}`}>Decisión</label>
        <select id={`decision-${row.code}`} value={decision} disabled={disabled} onChange={(event) => setDecision(event.target.value as ReviewDecision)}>
          <option value="approve">Aprobar candidato seleccionado</option><option value="reject">Rechazar vínculo</option><option value="discard">Descartar enriquecimiento local</option>
          {row.activeLink ? <option value="deactivate">Desactivar vínculo anterior y volver a revisión</option> : null}
        </select>
      </>}
      <label htmlFor={`reason-${row.code}`}>Motivo de la decisión</label>
      <textarea id={`reason-${row.code}`} required maxLength={1000} value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} />
      <button className="button button-secondary" type="submit" disabled={disabled || reason.trim() === '' || (row.reviewState === 'pending' && decision === 'approve' && !canApprove)}>
        {row.reviewState !== 'pending' ? 'Desactivar vínculo editorial' : 'Registrar decisión editorial'}
      </button>
    </form>}
  </details>;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function responseError(value: unknown) { return new Error(isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' ? value.error.message : 'No se pudo completar la revisión editorial.'); }
function parsePage(value: unknown): TriagePage {
  if (!isRecord(value) || !isRecord(value.counts) || !Array.isArray(value.rows)
    || typeof value.batchId !== 'string' || !isCount(value.total) || !isCount(value.mercadoLibreEvidenceCount)
    || !isCount(value.limit) || value.limit < 1 || value.limit > 50 || !isCount(value.offset)
    || !Object.values(value.counts).every(isCount)
    || !['total', 'autoConfirmed', 'pendingManualReview', 'approvedManual', 'rejected', 'discardedEnrichment']
      .every((key) => isRecord(value.counts) && isCount(value.counts[key]))
    || !value.rows.every(isReviewRow)) throw new Error('El servidor devolvió una revisión editorial inválida.');
  return value as TriagePage;
}

function isCount(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function nullableText(value: unknown): boolean { return value === null || typeof value === 'string'; }
function isReviewRow(value: unknown): boolean {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.activeLink !== 'boolean'
    || typeof value.reviewState !== 'string' || !['auto_confirmed', 'pending', 'approved', 'rejected', 'discarded'].includes(value.reviewState)
    || !nullableText(value.reason) || !nullableText(value.selectedLocalProductId)
    || typeof value.updatedBy !== 'string' || typeof value.updatedAt !== 'string'
    || !isRecord(value.evidence) || typeof value.evidence.duxNameAtAnalysis !== 'string'
    || typeof value.evidence.analysisStatus !== 'string' || typeof value.evidence.decisionMethod !== 'string'
    || !Array.isArray(value.evidence.blockers) || !value.evidence.blockers.every((blocker: unknown) => typeof blocker === 'string')
    || !isRecord(value.evidence.recommendedReuse) || typeof value.evidence.recommendedReuse.images !== 'boolean'
    || typeof value.evidence.recommendedReuse.description !== 'boolean'
    || !Array.isArray(value.candidates) || !value.candidates.every(isReviewCandidate)) return false;
  if (value.currentDux === null) return true;
  const current = value.currentDux;
  return isRecord(current) && typeof current.code === 'string' && typeof current.name === 'string'
    && typeof current.syncedAt === 'string' && Array.isArray(current.categories)
    && current.categories.every((category: unknown) => isRecord(category) && typeof category.name === 'string' && typeof category.slug === 'string')
    && (current.priceStatus === 'usable'
      ? typeof current.priceAmount === 'number' && Number.isFinite(current.priceAmount) && current.priceAmount > 2
      : ['placeholder', 'missing_or_zero', 'invalid'].includes(String(current.priceStatus)) && current.priceAmount === null);
}
function isReviewCandidate(value: unknown): boolean {
  return isRecord(value) && typeof value.localProductId === 'string' && typeof value.name === 'string'
    && typeof value.exists === 'boolean' && nullableText(value.description)
    && typeof value.presentationRelation === 'string' && typeof value.reason === 'string'
    && Array.isArray(value.images) && value.images.every((entry: unknown) => isRecord(entry) && typeof entry.src === 'string' && typeof entry.alt === 'string')
    && Array.isArray(value.mercadoLibreEvidence) && value.mercadoLibreEvidence.every((entry: unknown) => isRecord(entry)
      && typeof entry.itemId === 'string' && nullableText(entry.variationId) && typeof entry.reason === 'string');
}
