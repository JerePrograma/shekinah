import cron from './dux-cron';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

const schedule = { scheduledTime: Date.parse('2026-10-22T15:02:00.000Z'), cron: '2-52/10 * * * *' };
const environment = { DUX_CRON_SECRET: 'x'.repeat(32) };

function progressResponse(init: RequestInit): Response {
  if (typeof init.body !== 'string') throw new Error('Falta la identidad del ciclo.');
  const { requestId } = JSON.parse(init.body) as { requestId: string };
  return Response.json({ status: 'running', requestId, runId: 'dux_sync_automatic', phase: 'items', processed: 50, total: 812, retryAfterMs: 1_000 }, { status: 202 });
}

function identities(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>): readonly unknown[] {
  return fetchMock.mock.calls.map(([, init]) => {
    if (typeof init?.body !== 'string') throw new Error('Falta la identidad del ciclo.');
    return (JSON.parse(init.body) as Record<string, unknown>).requestId;
  });
}

it.each(['fetch', 'body', 'gateway'] as const)('recupera pérdida de transporte %s con el mismo UUID y autenticación', async failure => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(() => {
    if (failure === 'fetch') return Promise.reject(new Error('detalle privado de red'));
    if (failure === 'gateway') return Promise.resolve(new Response('<html>gateway privado</html>', { status: 524 }));
    return Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.error(new Error('detalle privado del cuerpo')); } })));
  }).mockImplementation(() => Promise.resolve(publication()));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).resolves.toBeUndefined();
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(new Set(identities(fetchMock)).size).toBe(1);
  for (const [, init] of fetchMock.mock.calls) {
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: {
      authorization: `Bearer ${environment.DUX_CRON_SECRET}`, 'x-shekinah-scheduled-at': '2026-10-22T15:02:00.000Z', 'content-type': 'application/json',
    } });
  }
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('privado');
});

it('conserva la identidad después de progreso, respuesta perdida y publicación recuperada', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce((_input, init) => Promise.resolve(progressResponse(init ?? {})))
    .mockRejectedValueOnce(new Error('conexión interrumpida')).mockImplementation(() => Promise.resolve(publication()));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).resolves.toBeUndefined();
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(3); expect(new Set(identities(fetchMock)).size).toBe(1);
  expect(console.log).toHaveBeenCalledWith('dux_cron_published', expect.objectContaining({ requests: 3, inventoryRunId: 'dux_sync_automatic' }));
});

it('agota sólo dos intentos de transporte por paso, sin imprimir datos privados', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('token-privado-no-publicar'));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_TRANSPORT');
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(new Set(identities(fetchMock)).size).toBe(1);
  expect(JSON.stringify([...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls])).not.toContain('token-privado');
});

it.each([['DUX_PROVIDER_REJECTED', 502], ['DUX_D1_WRITE_BUDGET_EXHAUSTED', 503], ['DUX_SYNC_IN_PROGRESS', 409], ['DUX_SYNC_COOLDOWN', 429]] as const)(
  'no reintenta el error terminal JSON %s aunque el HTTP sea %s', async (code, status) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json({ error: { code, message: 'detalle privado' } }, { status })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_PUBLICATION_UNCONFIRMED');
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(console.warn).not.toHaveBeenCalled();
  },
);

it('una recuperación de transporte seguida de un error JSON terminal se detiene sin otro ciclo', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('respuesta perdida')).mockImplementation(() =>
    Promise.resolve(Response.json({ error: { code: 'DUX_PROVIDER_REJECTED' } }, { status: 502 })));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_PUBLICATION_UNCONFIRMED');
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(new Set(identities(fetchMock)).size).toBe(1);
});

it.each([400, 401])('HTTP %s con cuerpo interrumpido sigue siendo terminal y no repite el POST', async status => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.error(new Error('detalle privado del rechazo')); },
  }), { status })));
  vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_PUBLICATION_UNCONFIRMED');
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(console.warn).not.toHaveBeenCalled();
});

it('un 5xx con cuerpo interrumpido recupera una sola vez y conserva el UUID', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.error(new Error('detalle privado del gateway')); },
  }), { status: 502 })));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_TRANSPORT');
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(new Set(identities(fetchMock)).size).toBe(1);
});

it('el límite de 50 llamadas incluye progreso y reintentos de transporte', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('respuesta perdida')).mockImplementation((_input, init) => Promise.resolve(progressResponse(init ?? {})));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_STEP_LIMIT');
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(50); expect(new Set(identities(fetchMock)).size).toBe(1);
  expect(console.log).not.toHaveBeenCalledWith('dux_cron_published', expect.anything());
});

it('acepta una publicación válida en la última llamada permitida sin pedir la 51', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => Promise.resolve(fetchMock.mock.calls.length === 50 ? publication() : progressResponse(init ?? {})));
  vi.stubGlobal('fetch', fetchMock);
  const result = expect(cron.scheduled(schedule, environment)).resolves.toBeUndefined();
  await vi.runAllTimersAsync(); await result;
  expect(fetchMock).toHaveBeenCalledTimes(50);
});

it('rechaza una respuesta final que termina fuera del deadline monotónico de siete minutos', async () => {
  let elapsed = 0; vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => { elapsed = 7 * 60_000 + 1; return Promise.resolve(publication()); });
  vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_DEADLINE');
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(console.log).not.toHaveBeenCalledWith('dux_cron_published', expect.anything());
});

it('no espera ni inicia otra lectura si el tiempo restante no cubre la pausa', async () => {
  let elapsed = 0; vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => { elapsed = 7 * 60_000 - 500; return Promise.resolve(progressResponse(init ?? {})); });
  vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_DEADLINE'); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('un JSON inválido con HTTP exitoso se rechaza sin repetir la operación', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response('incompleto', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled(schedule, environment)).rejects.toThrow('DUX_RELAY_RESPONSE_INVALID'); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('registra que el reloj llamó al Worker aunque falte su secreto, sin llamar a Pages', async () => {
  const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetchMock);
  await expect(cron.scheduled(schedule, {})).rejects.toThrow('DUX_CRON_SECRET_MISSING');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith('dux_cron_started', expect.objectContaining({ scheduledAt: '2026-10-22T15:02:00.000Z', cron: schedule.cron }));
  expect(console.error).toHaveBeenCalledWith('dux_cron_failed', expect.objectContaining({ requests: 0, code: 'DUX_CRON_SECRET_MISSING' }));
});
