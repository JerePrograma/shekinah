import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DuxCatalogControls } from './DuxCatalogControls';

function payload() { return { control: { migrationApplied: true, snapshotCollectionEnabled: true,
  publicCatalogEnabled: false, publicCutoverEnabled: false }, snapshot: { itemCount: 3,
  syncedAt: '2026-09-06T12:00:00Z', stale: false, checkoutEligibleCount: 0,
  priceCounts: { usable: 1, placeholder: 1, missing_or_zero: 1, invalid: 0 } } }; }
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }

describe('controles del catálogo público', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('confirma cantidad sin precio, habilita sólo catálogo y permite rollback', async () => {
    const state = payload();
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_url, init) => {
      if (init?.method === 'POST') {
        if (typeof init.body !== 'string') throw new Error('Expected a JSON body');
        const body = JSON.parse(init.body) as Record<string, unknown>;
        writes.push(body);
        if (typeof body.publicCatalogEnabled === 'boolean') state.control.publicCatalogEnabled = body.publicCatalogEnabled;
      }
      return Promise.resolve(json(state));
    }));
    render(<DuxCatalogControls />);
    const enable = await screen.findByRole('button', { name: 'Habilitar catálogo público Dux' });
    expect(enable).toBeEnabled();
    fireEvent.click(enable);
    expect(screen.getByRole('dialog')).toHaveTextContent('2 mostrarán “Consultar precio”');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(enable).toHaveFocus();
    expect(writes).toHaveLength(0);
    fireEvent.click(enable);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar publicación' }));
    await waitFor(() => expect(writes).toEqual([{ publicCatalogEnabled: true, confirmation: 'ENABLE_DUX_PUBLIC_CATALOG' }]));
    const rollback = await screen.findByRole('button', { name: 'Restaurar catálogo local' });
    expect(screen.getByText('Corte comercial').parentElement).toHaveTextContent('Deshabilitado');
    fireEvent.click(rollback);
    await waitFor(() => expect(writes[1]).toEqual({ publicCatalogEnabled: false }));
    expect(await screen.findByText('Catálogo local restaurado. El snapshot y los vínculos se conservaron.')).toBeVisible();
  });
  it('sin snapshot la activación está bloqueada; migración pendiente no expone acciones', async () => {
    const state: { control: ReturnType<typeof payload>['control']; snapshot: null } = { control: payload().control, snapshot: null };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json(state))));
    const { unmount } = render(<DuxCatalogControls />);
    expect(await screen.findByRole('button', { name: 'Habilitar catálogo público Dux' })).toBeDisabled();
    unmount();
    state.control.migrationApplied = false;
    render(<DuxCatalogControls />);
    expect(await screen.findByText(/La migración 0017 está pendiente/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Habilitar catálogo público Dux' })).not.toBeInTheDocument();
  });

  it('ignora un GET anterior que termina después de publicar y conserva el rollback visible', async () => {
    const state = payload();
    let readCount = 0;
    let resolveEarlier: (() => void) | undefined;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_url, init) => {
      if (init?.method === 'POST') {
        state.control.publicCatalogEnabled = true;
        return Promise.resolve(json({ control: state.control }));
      }
      readCount += 1;
      if (readCount === 2) {
        const earlierResponse = json(state);
        return new Promise((resolve) => { resolveEarlier = () => resolve(earlierResponse); });
      }
      return Promise.resolve(json(state));
    }));
    render(<DuxCatalogControls />);
    const enable = await screen.findByRole('button', { name: 'Habilitar catálogo público Dux' });
    act(() => { window.dispatchEvent(new Event('shekinah:admin-products-refresh')); });
    await waitFor(() => expect(readCount).toBe(2));
    fireEvent.click(enable);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar publicación' }));
    expect(await screen.findByRole('button', { name: 'Restaurar catálogo local' })).toBeEnabled();
    await waitFor(() => expect(readCount).toBe(3));
    await act(async () => { resolveEarlier?.(); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Restaurar catálogo local' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Habilitar catálogo público Dux' })).not.toBeInTheDocument();
    expect(screen.getByText('Catálogo Dux visible').parentElement).toHaveTextContent('Habilitado');
  });

  it('ignora respuesta de sesión vencida de una lectura desmontada', async () => {
    let resolveRead: ((response: Response) => void) | undefined;
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => new Promise((resolve) => { resolveRead = resolve; })));
    const rendered = render(<DuxCatalogControls onUnauthorized={onUnauthorized} />);
    rendered.unmount();
    await act(async () => { resolveRead?.(new Response('{}', { status: 401 })); await Promise.resolve(); });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
