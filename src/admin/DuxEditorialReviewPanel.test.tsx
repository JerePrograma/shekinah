import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DuxEditorialReviewPanel } from './DuxEditorialReviewPanel';

describe('revisión editorial Dux', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('muestra conteos, cero evidencia ML y exige candidato, contenido y motivo para aprobar', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(page())));
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxEditorialReviewPanel />);
    expect(await screen.findByText(/0 evidencias Mercado Libre/)).toBeVisible();
    fireEvent.click(screen.getByText('Producto Dux histórico — DU1'));
    const save = screen.getByRole('button', { name: 'Registrar decisión editorial' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Candidato local (local-a)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reutilizar imágenes' }));
    fireEvent.change(screen.getByLabelText('Motivo de la decisión'), { target: { value: 'Identidad confirmada por SKU' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/dux/editorial-triage/review', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({ code: 'DU1', decision: 'approve', reason: 'Identidad confirmada por SKU', localProductId: 'local-a', reuseImages: true, reuseDescription: false }),
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('Decisión editorial registrada.');
  });

  it('importa sólo manifiesto fijo sin body y conserva controles disabled externos', async () => {
    const empty = { ...page(), total: 0, rows: [], counts: { total: 0, autoConfirmed: 0, pendingManualReview: 0, approvedManual: 0, rejected: 0, discardedEnrichment: 0 } };
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(empty)));
    vi.stubGlobal('fetch', fetchMock);
    const rendered = render(<DuxEditorialReviewPanel disabled />);
    expect(await screen.findByRole('button', { name: 'Importar clasificación editorial versionada' })).toBeDisabled();
    rendered.rerender(<DuxEditorialReviewPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar clasificación editorial versionada' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/dux/editorial-triage/import', { method: 'POST', credentials: 'same-origin', redirect: 'error' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Clasificación importada.');
  });

  it('sesión expirada y errores de migración se comunican sin permitir revisión', async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({}, 401))));
    const rendered = render(<DuxEditorialReviewPanel onUnauthorized={onUnauthorized} />);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
    rendered.unmount();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ error: { message: 'Falta aplicar la migración 0017.' } }, 503))));
    render(<DuxEditorialReviewPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta aplicar la migración 0017.');
    expect(screen.queryByRole('button', { name: 'Registrar decisión editorial' })).not.toBeInTheDocument();
  });

  it.each(['currentDux', 'candidate'] as const)('respuesta inválida %s falla con mensaje y no rompe administración', async (failure) => {
    const malformed = page();
    const row = malformed.rows[0];
    if (row === undefined) throw new Error('Row fixture required.');
    const invalidRow = failure === 'currentDux' ? { ...row, currentDux: undefined }
      : { ...row, candidates: [{ ...row.candidates[0], exists: undefined, images: [{ src: '/image.png' }] }] };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ ...malformed, rows: [invalidRow] }))));
    render(<DuxEditorialReviewPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor devolvió una revisión editorial inválida.');
    expect(screen.getByRole('button', { name: 'Actualizar revisión' })).toBeEnabled();
  });
});

function page() {
  return { batchId: 'test', total: 294, limit: 20, offset: 0, mercadoLibreEvidenceCount: 0,
    counts: { total: 747, autoConfirmed: 135, pendingManualReview: 294, approvedManual: 0, rejected: 0, discardedEnrichment: 318 },
    rows: [{ code: 'DU1', currentDux: null, activeLink: false, reviewState: 'pending', selectedLocalProductId: null, reason: null, updatedBy: 'admin', updatedAt: '2026-09-03',
      evidence: { duxNameAtAnalysis: 'Producto Dux histórico', analysisStatus: 'review_fuzzy', decisionMethod: 'fuzzy_name_similarity', recommendedReuse: { images: true, description: false }, blockers: ['manual_confirmation_required'] },
      candidates: [{ localProductId: 'local-a', name: 'Candidato local', exists: true, images: [{ src: '/images/test.png', alt: 'Imagen editorial' }], description: null, presentationRelation: 'same', reason: 'name_similarity', mercadoLibreEvidence: [] }],
    }],
  };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
