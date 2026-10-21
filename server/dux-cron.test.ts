import cron from './dux-cron';

afterEach(()=>vi.unstubAllGlobals());

it('continúa un ciclo segmentado con el mismo requestId sin confundir 202 con publicación', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    if (typeof init.body !== 'string') throw new Error('Falta la identidad del ciclo.');
    const { requestId } = JSON.parse(init.body) as { requestId: string };
    if (fetchMock.mock.calls.length === 1) return Promise.resolve(Response.json({
      status: 'running', requestId, runId: 'dux_sync_automatic', phase: 'items',
      processed: 50, total: 812, retryAfterMs: 1_000,
    }, { status: 202 }));
    return Promise.resolve(publication());
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    const result = cron.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' }, { DUX_CRON_SECRET: 'x'.repeat(32) });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
    expect(bodies[0]).toEqual(bodies[1]);
  } finally { vi.useRealTimers(); }
});

it('rechaza una continuación de otra identidad sin seguir leyendo Dux', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    status: 'running', requestId: 'another-request', runId: 'dux_sync_automatic', phase: 'items',
    processed: 50, total: 812, retryAfterMs: 1_000,
  }, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' }, { DUX_CRON_SECRET: 'x'.repeat(32) }))
    .rejects.toThrow('DUX_RELAY_PROGRESS_INVALID');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('invoca una sola lectura Dux autenticada y acredita la publicación del mismo run', async () => {
  const fetchMock=vi.fn().mockResolvedValue(Response.json({status:'completed', summary:{status:'succeeded', failed:0,
    runId:'dux_sync_automatic', startedAt:'2026-09-08T12:00:00.000Z', completedAt:'2026-09-08T12:01:30.000Z'},
    catalog:{inventoryRunId:'dux_sync_automatic',syncedAt:'2026-09-08T12:01:30.000Z',itemCount:812,catalogVersion:'a'.repeat(64),priceListName:'PRECIOS DEL NEGOCIO'}}));
  vi.stubGlobal('fetch',fetchMock);
  await cron.scheduled({scheduledTime:Date.parse('2026-09-08T12:00:00Z'),cron:'*/5 * * * *'},{DUX_CRON_SECRET:'x'.repeat(32)});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://shekinah.ar/api/internal/dux/reconcile',expect.objectContaining({method:'POST',redirect:'error'}));
});

it.each([409,429,500])('un error HTTP %s no dispara otra lectura ni simula éxito', async (status) => {
  const fetchMock=vi.fn().mockResolvedValue(Response.json({error:{code:'test'}},{status}));
  vi.stubGlobal('fetch',fetchMock);
  await expect(cron.scheduled({scheduledTime:Date.now(),cron:'*/5 * * * *'},{DUX_CRON_SECRET:'x'.repeat(32)})).rejects.toThrow('UNCONFIRMED');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('no acepta un cuerpo ilimitado ni un inventario sin catálogo publicado', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('x'.repeat(40000))));
  await expect(cron.scheduled({scheduledTime:Date.now(),cron:'*/5 * * * *'},{DUX_CRON_SECRET:'x'.repeat(32)})).rejects.toThrow('LIMIT');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({status:'completed',summary:{status:'succeeded'},catalog:{status:'disabled'}})));
  await expect(cron.scheduled({scheduledTime:Date.now(),cron:'*/5 * * * *'},{DUX_CRON_SECRET:'x'.repeat(32)})).rejects.toThrow('UNCONFIRMED');
});

function publication(): Response {
  return Response.json({ status: 'completed', summary: { status: 'succeeded', failed: 0,
    runId: 'dux_sync_automatic', startedAt: '2026-09-08T12:00:00.000Z', completedAt: '2026-09-08T12:01:30.000Z' },
    catalog: { inventoryRunId: 'dux_sync_automatic', syncedAt: '2026-09-08T12:01:30.000Z', itemCount: 812,
      catalogVersion: 'a'.repeat(64), priceListName: 'PRECIOS DEL NEGOCIO' } });
}
