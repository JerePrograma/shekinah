import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DuxPanel } from './DuxPanel';

vi.mock('./DuxCatalogControls', () => ({ DuxCatalogControls: () => null }));
vi.mock('./DuxEditorialReviewPanel', () => ({ DuxEditorialReviewPanel: () => null }));
vi.mock('./MercadoLibreEditorialPanel', () => ({ MercadoLibreEditorialPanel: () => null }));

describe('panel administrativo Dux', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prioriza el negocio y reserva códigos, métricas y bloqueos técnicos para soporte', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(enabledStatus())));
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Dux Software' })).toBeVisible();
    expect(screen.getByText(/Los productos, precios y existencias se administran en Dux/)).toBeVisible();
    expect(metric('Actualización desde Dux')).toHaveTextContent('Habilitada');
    expect(metric('Datos del negocio')).toHaveTextContent('Verificada');
    expect(metric('Empresa')).toHaveTextContent('Shekinah Pruebas');
    expect(metric('Sucursal')).toHaveTextContent('Mar del Plata');
    expect(metric('Depósito')).toHaveTextContent('Depósito central');
    expect(metric('Productos y variantes consultados')).toHaveTextContent('12');
    expect(metric('Última actualización')).toHaveTextContent('Completada');
    expect(screen.getByText('succeeded')).not.toBeVisible();
    expect(metric('Vinculados')).toHaveTextContent('7');
    expect(metric('Sin vincular a Dux')).toHaveTextContent('3');
    expect(metric('Vínculos ambiguos')).toHaveTextContent('2');
    expect(metric('Semántica de unidades')).toHaveTextContent('Pendiente');
    expect(metric('Ciclo de reservas')).toHaveTextContent('Bloqueado');
    expect(screen.getByText(/Última actualización terminada:/)).toHaveTextContent('26/8/2026, 13:05:00');
    expect(screen.queryByRole('heading', { level: 3, name: 'Revisión necesaria' })).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade Dux a PRO/FULL + token API requerido')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Actualizar productos desde Dux' })).toBeEnabled();
    fireEvent.click(screen.getByText('Información para soporte: conexión con Dux'));
    expect(screen.getByText('Upgrade Dux a PRO/FULL + token API requerido')).toBeVisible();
    expect(screen.queryByText('Mercado Libre')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/dux/status', {
      credentials: 'same-origin',
    });
  });

  it('sincroniza una sola vez, informa el resumen y actualiza los productos', async () => {
    let statusRequests = 0;
    let resolveSync: ((response: Response) => void) | undefined;
    const pendingSync = new Promise<Response>((resolve) => {
      resolveSync = resolve;
    });
    const refreshListener = vi.fn();
    window.addEventListener('shekinah:admin-products-refresh', refreshListener);
    const onOperationStateChange = vi.fn();
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      if (path === '/api/admin/dux/status') {
        statusRequests += 1;
        return Promise.resolve(json(enabledStatus()));
      }
      if (path === '/api/admin/dux/sync' && init?.method === 'POST') return pendingSync;
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel onOperationStateChange={onOperationStateChange} />);
    const synchronize = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    fireEvent.click(synchronize);
    fireEvent.click(synchronize);

    expect(screen.getByRole('button', { name: 'Actualizando productos…' })).toBeDisabled();
    expect(syncRequests(fetchMock)).toHaveLength(1);
    await waitFor(() => {
      expect(onOperationStateChange).toHaveBeenCalledWith(
        true,
        'Actualizando productos desde Dux',
      );
    });

    resolveSync?.(json({
      summary: {
        status: 'succeeded',
        processed: 12,
        failed: 0,
        mapped: 7,
        unmapped: 3,
        ambiguous: 2,
        absent: 1,
      },
    }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Actualización completada. 12 productos y variantes revisados y 0 problemas de actualización.',
    );
    await waitFor(() => expect(statusRequests).toBe(2));
    expect(refreshListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('shekinah:admin-products-refresh', refreshListener);
  });

  it('queda sin acción de sincronización cuando Dux está deshabilitado', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({
      ...enabledStatus(),
      enabled: false,
      tenant: null,
      latestRun: null,
      blockers: ['Upgrade Dux a PRO/FULL + token API requerido'],
    })));
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel />);

    expect(await screen.findByText(/La actualización desde Dux no está habilitada/)).toBeVisible();
    expect(metric('Actualización desde Dux')).toHaveTextContent('No habilitada');
    expect(metric('Datos del negocio')).toHaveTextContent('Sin verificar');
    expect(metric('Empresa')).toHaveTextContent('Sin verificar');
    expect(screen.queryByRole('button', { name: 'Actualizar productos desde Dux' })).not.toBeInTheDocument();
  });

  it('rechaza una respuesta incompleta y no habilita operaciones', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({
      enabled: true,
      lifecycleReady: false,
      unitSemanticsReady: false,
      tenant: null,
      latestRun: null,
      counts: { inventoryCount: 1 },
      maxAgeSeconds: 300,
      blockers: [],
    })));
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos consultar o actualizar los productos de Dux.',
    );
    expect(screen.getByText('El servidor devolvió métricas Dux inválidas.')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actualizar productos desde Dux' })).not.toBeInTheDocument();
  });

  it('recupera una consulta fallida sin iniciar una sincronización', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('No pudimos consultar Dux.'))
      .mockResolvedValueOnce(json(enabledStatus()));
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar o actualizar los productos de Dux.');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar Dux' }));
    expect(await screen.findByRole('button', { name: 'Actualizar productos desde Dux' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Dux Software' })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(syncRequests(fetchMock)).toHaveLength(0);
  });
});

function enabledStatus() {
  return {
    enabled: true,
    lifecycleReady: false,
    unitSemanticsReady: false,
    tenant: {
      companyId: 44,
      companyName: 'Shekinah Pruebas',
      branchId: 7,
      branchName: 'Mar del Plata',
      depositId: 9,
      depositName: 'Depósito central',
      verifiedAt: '2026-08-26T12:00:00.000Z',
    },
    latestRun: {
      status: 'succeeded',
      processed: 12,
      failed: 0,
      completedAt: '2026-08-26T16:05:00.000Z',
    },
    counts: {
      inventoryCount: 12,
      mappedCount: 7,
      unmappedCount: 3,
      ambiguousCount: 2,
      staleCount: 1,
      errorCount: 0,
      absentCount: 1,
      checkoutEligibleCount: 0,
    },
    maxAgeSeconds: 900,
    blockers: ['Upgrade Dux a PRO/FULL + token API requerido'],
  };
}

function metric(label: string): HTMLElement {
  const term = screen.getByText(label);
  const container = term.closest('div');
  if (container === null) throw new Error(`No se encontró la métrica ${label}.`);
  return container;
}

function syncRequests(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/admin/dux/sync');
}

function requestPath(input: RequestInfo | URL): string {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return value.startsWith('http') ? new URL(value).pathname : value;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
