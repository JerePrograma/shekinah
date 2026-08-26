import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DuxPanel } from './DuxPanel';

describe('panel administrativo Dux', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('muestra autoridad, tenant, mapping y bloqueos sin controles de Mercado Libre', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(enabledStatus())));
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Dux Software' })).toBeVisible();
    expect(screen.getByText(/Dux es la fuente autoritativa de stock/)).toBeVisible();
    expect(metric('Plan / token API')).toHaveTextContent('Acceso configurado');
    expect(metric('Configuración Dux')).toHaveTextContent('Verificada');
    expect(metric('Empresa')).toHaveTextContent('Shekinah Pruebas');
    expect(metric('Sucursal')).toHaveTextContent('Mar del Plata');
    expect(metric('Depósito')).toHaveTextContent('Depósito central');
    expect(metric('Items observados')).toHaveTextContent('12');
    expect(metric('Vinculados')).toHaveTextContent('7');
    expect(metric('Sin vincular a Dux')).toHaveTextContent('3');
    expect(metric('Vínculos ambiguos')).toHaveTextContent('2');
    expect(metric('Semántica de unidades')).toHaveTextContent('Pendiente');
    expect(metric('Ciclo de reservas')).toHaveTextContent('Bloqueado');
    expect(screen.getByRole('heading', { level: 3, name: 'Bloqueos de activación' })).toBeVisible();
    expect(screen.getByText('Upgrade Dux a PRO/FULL + token API requerido')).toBeVisible();
    expect(screen.getByText('La semántica de unidades y cantidades no está verificada.')).toBeVisible();
    expect(screen.getByText('La liberación y finalización de reservas no está demostrada.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sincronizar ahora' })).toBeEnabled();
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
    const synchronize = await screen.findByRole('button', { name: 'Sincronizar ahora' });
    fireEvent.click(synchronize);
    fireEvent.click(synchronize);

    expect(screen.getByRole('button', { name: 'Sincronizando…' })).toBeDisabled();
    expect(syncRequests(fetchMock)).toHaveLength(1);
    await waitFor(() => {
      expect(onOperationStateChange).toHaveBeenCalledWith(
        true,
        'Sincronizando inventario Dux',
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
      'Sincronización succeeded: 12 procesados, 7 vinculados, 3 sin vincular, 2 ambiguos, 1 ausentes y 0 errores.',
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

    expect(await screen.findByText(/La sincronización permanece deshabilitada/)).toBeVisible();
    expect(metric('Plan / token API')).toHaveTextContent('Pendiente o no disponible');
    expect(metric('Configuración Dux')).toHaveTextContent('Sin verificar');
    expect(metric('Empresa')).toHaveTextContent('Sin verificar');
    expect(screen.queryByRole('button', { name: /Sincronizar/ })).not.toBeInTheDocument();
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
      'El servidor devolvió métricas Dux inválidas.',
    );
    expect(screen.queryByRole('button', { name: /Sincronizar/ })).not.toBeInTheDocument();
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
      completedAt: '2026-08-26T12:05:00.000Z',
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
