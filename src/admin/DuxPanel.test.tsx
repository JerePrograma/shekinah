import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DuxPanel } from './DuxPanel';

vi.mock('./DuxCatalogControls', () => ({ DuxCatalogControls: () => null }));
vi.mock('./DuxEditorialReviewPanel', () => ({ DuxEditorialReviewPanel: () => null }));
vi.mock('./MercadoLibreEditorialPanel', () => ({ MercadoLibreEditorialPanel: () => null }));

describe('panel administrativo Dux', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prioriza el negocio y reserva códigos, métricas y bloqueos técnicos para soporte', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(enabledStatus())));
    vi.stubGlobal('fetch', fetchMock);

    render(<DuxPanel />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Dux Software' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Actualizaciones' })).toBeVisible();
    expect(screen.getByText('Productos, precios y existencias.')).toBeVisible();
    expect(metric('Actualización desde Dux')).toHaveTextContent('Habilitada');
    expect(metric('Datos del negocio')).toHaveTextContent('Verificada');
    expect(metric('Empresa')).toHaveTextContent('Shekinah Pruebas');
    expect(metric('Sucursal')).toHaveTextContent('Mar del Plata');
    expect(metric('Depósito')).toHaveTextContent('Depósito central');
    expect(metric('Productos y variantes consultados')).toHaveTextContent('12');
    expect(screen.getByText('Última actualización: Completada')).toBeVisible();
    expect(screen.getByText('succeeded')).not.toBeVisible();
    expect(metric('Vinculados')).toHaveTextContent('7');
    expect(metric('Sin vincular a Dux')).toHaveTextContent('3');
    expect(metric('Vínculos ambiguos')).toHaveTextContent('2');
    expect(metric('Semántica de unidades')).toHaveTextContent('Pendiente');
    expect(metric('Ciclo de reservas')).toHaveTextContent('Bloqueado');
    expect(screen.getByText(/Terminada el/)).toHaveTextContent('26/8/2026, 13:05:00');
    expect(screen.queryByRole('heading', { level: 3, name: 'Revisión necesaria' })).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade Dux a PRO/FULL + token API requerido')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Actualizar productos desde Dux' })).toBeEnabled();
    expect(screen.getByText('Ver detalles de Dux').closest('details')).not.toHaveAttribute('open');
    expect(metric('Empresa')).not.toBeVisible();
    fireEvent.click(screen.getByText('Ver detalles de Dux'));
    expect(metric('Empresa')).toBeVisible();
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

    resolveSync?.(json(completedSync()));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Actualización completada. 12 productos y variantes revisados y 0 problemas de actualización.',
    );
    await waitFor(() => expect(statusRequests).toBe(2));
    expect(refreshListener).toHaveBeenCalledTimes(1);
    expect(syncRequests(fetchMock)[0]?.[1]).toMatchObject({
      headers: { 'content-type': 'application/json' },
    });
    expect(syncRequests(fetchMock)[0]?.[1]?.body).toEqual(expect.stringMatching(/^\{"requestId":"[0-9a-f-]{36}"\}$/u));
    window.removeEventListener('shekinah:admin-products-refresh', refreshListener);
  });

  it('avanza por pasos con la misma identidad y anuncia productos sólo al confirmar la publicación', async () => {
    const refreshListener = vi.fn();
    window.addEventListener('shekinah:admin-products-refresh', refreshListener);
    let steps = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      steps += 1;
      return Promise.resolve(steps < 3 ? json(runningSync(init, { processed: steps * 50, total: 150 }), 202)
        : json(completedSync()));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    expect(screen.getByRole('status')).toHaveTextContent('50 de 150 revisados');
    expect(refreshListener).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole('status')).toHaveTextContent('100 de 150 revisados');
    expect(refreshListener).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Actualización completada.');
    expect(new Set(syncRequests(fetchMock).map(([, init]) => init?.body)).size).toBe(1);
    expect(syncRequests(fetchMock)).toHaveLength(3);
    expect(refreshListener).toHaveBeenCalledOnce();
    window.removeEventListener('shekinah:admin-products-refresh', refreshListener);
  });

  it('recupera la misma actualización después de pérdidas de transporte sin crear otra identidad', async () => {
    let attempts = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      attempts += 1;
      return attempts <= 3 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(json(completedSync()));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(syncRequests(fetchMock)).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Retomá la misma actualización');
    await act(() => Promise.resolve(fireEvent.click(screen.getByRole('button', { name: 'Retomar actualización desde Dux' }))));
    expect(screen.getByRole('status')).toHaveTextContent('Actualización completada.');
    expect(new Set(syncRequests(fetchMock).map(([, init]) => init?.body)).size).toBe(1);
  });

  it.each([
    ['catálogo ausente', { ...completedSync(), catalog: undefined }],
    ['colección cerrada', { ...completedSync(), catalog: { status: 'disabled' } }],
    ['migración pendiente', { ...completedSync(), catalog: { status: 'pending_migration' } }],
    ['run diferente', { ...completedSync(), catalog: { ...completedSync().catalog, inventoryRunId: 'dux_sync_other' } }],
    ['hash inválido', { ...completedSync(), catalog: { ...completedSync().catalog, catalogVersion: 'incorrecto' } }],
    ['fecha diferente', { ...completedSync(), catalog: { ...completedSync().catalog, syncedAt: '2026-09-30T12:01:00.000Z' } }],
    ['lista incorrecta', { ...completedSync(), catalog: { ...completedSync().catalog, priceListName: 'OTRA' } }],
    ['conteo inválido', { ...completedSync(), catalog: { ...completedSync().catalog, itemCount: 0.5 } }],
    ['estado incorrecto', { ...completedSync(), status: 'running' }],
  ])('no declara éxito ni reintenta ante %s y permite consultar el mismo resultado', async (_name, invalid) => {
    let attempts = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      attempts += 1;
      return Promise.resolve(json(attempts === 1 ? invalid : completedSync()));
    });
    const listener = vi.fn();
    window.addEventListener('shekinah:admin-products-refresh', listener);
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar productos desde Dux' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar la publicación');
    expect(syncRequests(fetchMock)).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar resultado de la actualización' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Actualización completada.');
    expect(new Set(syncRequests(fetchMock).map(([, init]) => init?.body)).size).toBe(1);
    window.removeEventListener('shekinah:admin-products-refresh', listener);
  });

  it.each(['requestId', 'runId', 'phase', 'processed', 'total', 'retryAfterMs'] as const)(
    'detiene una respuesta de progreso con %s incompatible', async (field) => {
      let steps = 0;
      const invalid: Record<string, unknown> = { requestId: 'otra-id', runId: 'dux_sync_other', phase: 'unknown',
        processed: 1001, total: -1, retryAfterMs: 0 };
      const fetchMock = vi.fn<typeof fetch>((input, init) => {
        if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
        steps += 1;
        return Promise.resolve(json(runningSync(init, steps === 1 ? {} : { [field]: invalid[field] }), 202));
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<DuxPanel />);
      const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
      vi.useFakeTimers();
      await act(() => Promise.resolve(fireEvent.click(button)));
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos confirmar la publicación');
      expect(syncRequests(fetchMock)).toHaveLength(2);
      expect(screen.queryByText(/Actualización completada/)).not.toBeInTheDocument();
    },
  );

  it.each([
    ['retroceso de fase', { phase: 'branches' }],
    ['retroceso de productos', { processed: 49 }],
    ['cambio de total', { total: 101 }],
    ['pérdida del total conocido', { total: null }],
  ])('detiene %s entre pasos válidos individualmente', async (_name, changed) => {
    let steps = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      steps += 1;
      return Promise.resolve(json(runningSync(init, steps === 1 ? {} : changed), 202));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos confirmar la publicación');
    expect(screen.getByRole('button', { name: 'Consultar resultado de la actualización' })).toBeEnabled();
    expect(syncRequests(fetchMock)).toHaveLength(2);
    expect(screen.queryByText(/Actualización completada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Se conserva la información anterior/)).not.toBeInTheDocument();
  });

  it('no repite un error terminal del servidor y sólo inicia otra identidad tras un nuevo clic', async () => {
    let attempts = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      attempts += 1;
      return Promise.resolve(attempts === 1 ? json({ error: { code: 'DUX_PROVIDER_REJECTED', message: 'Dux rechazó la consulta.' } }, 502)
        : json(completedSync()));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar productos desde Dux' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar o actualizar');
    expect(syncRequests(fetchMock)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar productos desde Dux' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Actualización completada.');
    expect(new Set(syncRequests(fetchMock).map(([, init]) => init?.body)).size).toBe(2);
  });

  it('acota los pasos y conserva la identidad para consultar el resultado', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => Promise.resolve(json(
      requestPath(input) === '/api/admin/dux/status' ? enabledStatus() : runningSync(init),
      requestPath(input) === '/api/admin/dux/status' ? 200 : 202,
    )));
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    await act(async () => { await vi.advanceTimersByTimeAsync(80_000); });
    expect(syncRequests(fetchMock)).toHaveLength(80);
    expect(screen.getByRole('button', { name: 'Retomar actualización desde Dux' })).toBeEnabled();
    expect(screen.queryByText(/Actualización completada/)).not.toBeInTheDocument();
  });

  it('detiene el avance al agotar siete minutos aunque queden pasos disponibles', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      vi.setSystemTime(Date.now() + 70_000);
      return Promise.resolve(json(runningSync(init), 202));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(syncRequests(fetchMock)).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Retomar actualización desde Dux' })).toBeEnabled();
    expect(screen.queryByText(/Actualización completada/)).not.toBeInTheDocument();
  });

  it('conserva la identidad al recuperar una respuesta de gateway sin JSON', async () => {
    let steps = 0;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (requestPath(input) === '/api/admin/dux/status') return Promise.resolve(json(enabledStatus()));
      steps += 1;
      return Promise.resolve(steps === 1 ? new Response('Gateway timeout', { status: 524 }) : json(completedSync()));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Actualización completada.');
    expect(syncRequests(fetchMock)).toHaveLength(2);
    expect(new Set(syncRequests(fetchMock).map(([, init]) => init?.body)).size).toBe(1);
  });

  it('detiene los siguientes pasos al salir de la pantalla', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => Promise.resolve(json(
      requestPath(input) === '/api/admin/dux/status' ? enabledStatus() : runningSync(init),
      requestPath(input) === '/api/admin/dux/status' ? 200 : 202,
    )));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<DuxPanel />);
    const button = await screen.findByRole('button', { name: 'Actualizar productos desde Dux' });
    vi.useFakeTimers();
    await act(() => Promise.resolve(fireEvent.click(button)));
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(syncRequests(fetchMock)).toHaveLength(1);
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

function completedSync() {
  return { status: 'completed', summary: { runId: 'dux_sync_panel_test', status: 'succeeded',
    processed: 12, failed: 0, mapped: 7, unmapped: 3, ambiguous: 2, absent: 1,
    startedAt: '2026-09-30T12:00:00.000Z', completedAt: '2026-09-30T12:00:30.000Z' },
  catalog: { inventoryRunId: 'dux_sync_panel_test', catalogVersion: 'a'.repeat(64),
    priceListName: 'PRECIOS DEL NEGOCIO', itemCount: 12, syncedAt: '2026-09-30T12:00:30.000Z' } };
}

function runningSync(init: RequestInit | undefined, overrides: Record<string, unknown> = {}) {
  if (typeof init?.body !== 'string') throw new Error('El paso debe enviar una identidad JSON.');
  const body = JSON.parse(init.body) as { requestId: string };
  return { status: 'running', requestId: body.requestId, runId: 'dux_sync_panel_test', phase: 'items',
    processed: 50, total: 100, retryAfterMs: 1_000, ...overrides };
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
