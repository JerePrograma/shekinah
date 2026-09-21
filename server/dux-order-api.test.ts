import { DuxOrderApiClient, duxOrderMatchesRequest, parseDuxOrderEvidence } from './dux-order-api';
import type { DuxOrderRequest } from './dux-order-api';

const request: DuxOrderRequest = Object.freeze({
  id_empresa: 10, id_sucursal: 20, id_personal: 30, id_cliente: 40, id_deposito: 50,
  fecha: '2026-09-15', referencia: 'shekinah:web:req_test_order',
  items: [{ cod_item: 'TEST-1', ctd: 2, precio_uni: 100, porc_iva: 21, porc_desc: 0 as const }],
});
const lookup = { companyId: 10, branchId: 20, reference: request.referencia, dateFrom: '2026-09-15', dateTo: '2026-09-15' };
function order(overrides: Record<string, unknown> = {}) {
  return { id_pedido: 100, nro_pedido: 101, id_empresa: 10, id_sucursal_empresa: 20,
    referencia: request.referencia, anulado: false, total: 242, id_moneda: 1,
    estado_facturacion: 'PENDIENTE', estado_remito: 'PENDIENTE',
    detalles: [{ cod_item: 'TEST-1', id_det_item: null, ctd: 2, precio_uni: 100, porc_iva: 21, porc_desc: 0 }],
    ...overrides };
}
function page(datos: unknown[], extra: Record<string, unknown> = {}) {
  return { datos, paginacion: { total: datos.length, offset: 0, limit: 50, hay_mas: false, ...extra } };
}
function setup(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response()));
  const beforeRequest = vi.fn(() => Promise.resolve());
  const client = new DuxOrderApiClient({ accessToken: 'test-only-dux-order-token', fetch: fetchMock, beforeRequest });
  return { client, fetchMock, beforeRequest };
}

it('consulta una referencia sin reenviar un POST y no conserva datos personales del proveedor', async () => {
  const { client, fetchMock, beforeRequest } = setup(() => Response.json(page([
    order({ referencia: 'otro-prefijo' }), order({ cliente: 'Dato privado', cuit: 'Dato privado' }),
  ])));
  const result = await client.findOrder(lookup);
  expect(result).toMatchObject({ id: 100, number: 101, totalMinor: 24200, reference: request.referencia });
  expect(JSON.stringify(result)).not.toContain('Dato privado');
  expect(beforeRequest).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0] ?? [];
  expect(url instanceof URL ? url.href : url).toBe('https://erp.duxsoftware.com.ar/WSERP/rest/services/v2/pedidos?id_empresa=10&id_sucursal=20&referencia=shekinah%3Aweb%3Areq_test_order&fecha_desde=2026-09-15&fecha_hasta=2026-09-15&offset=0&limit=50');
  expect(options).toMatchObject({ method: 'GET', redirect: 'manual', cache: 'no-store' });
  expect(options?.body).toBeUndefined();
});

it('invoca el fetch nativo sin usar el cliente como receptor, como exige Cloudflare Workers', async () => {
  const nativeFetch = vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json(page([])));
  });
  vi.stubGlobal('fetch', nativeFetch);
  try {
    const client = new DuxOrderApiClient({ accessToken: 'test-only-token', beforeRequest: () => Promise.resolve() });
    expect(await client.findOrder(lookup)).toBeNull();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it('una referencia sin resultados no demuestra que sea seguro repetir la creación', async () => {
  const { client, fetchMock } = setup(() => Response.json(page([])));
  expect(await client.findOrder(lookup)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
});

it('recupera la referencia ASCII que Dux devuelve en mayúsculas sin cambiar la identidad enviada', async () => {
  const canonical = request.referencia.toUpperCase();
  const { client, fetchMock } = setup(() => Response.json(page([order({ referencia: canonical })])));
  const result = await client.findOrder(lookup);
  expect(result?.reference).toBe(canonical);
  expect(duxOrderMatchesRequest(result!, request)).toBe(true);
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('acepta la respuesta de creación normalizada por Dux sin un segundo POST', async () => {
  const { client, fetchMock } = setup(() => Response.json({ datos: order({ referencia: request.referencia.toUpperCase() }) }));
  expect((await client.createOrder(request)).number).toBe(101);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(request));
});

it.each(['SHEKINAH:WEB:REQ_TEST_ORDER_EXTRA', 'SHEKINAH:WEB:REQ-TEST-ORDER', ' SHEKINAH:WEB:REQ_TEST_ORDER'])(
'no confunde otra referencia con la normalización del proveedor: %s', async (reference) => {
  const { client } = setup(() => Response.json(page([order({ referencia: reference })])));
  expect(await client.findOrder(lookup)).toBeNull();
  expect(duxOrderMatchesRequest(parseDuxOrderEvidence(order({ referencia: reference })), request)).toBe(false);
});

it.each([
  ['duplicados', page([order(), order({ id_pedido: 102 })]), 'DUX_ORDER_REFERENCE_AMBIGUOUS'],
  ['duplicados tras normalización', page([order(), order({ id_pedido: 102, referencia: request.referencia.toUpperCase() })]), 'DUX_ORDER_REFERENCE_AMBIGUOUS'],
  ['otra empresa', page([order({ id_empresa: 11 })]), 'DUX_ORDER_RESPONSE_INVALID'],
  ['otra sucursal', page([order({ id_sucursal_empresa: 21 })]), 'DUX_ORDER_RESPONSE_INVALID'],
  ['paginación incompleta', page([order()], { hay_mas: true }), 'DUX_ORDER_RESPONSE_INVALID'],
  ['paginación inconsistente', page([order()], { total: 2 }), 'DUX_ORDER_RESPONSE_INVALID'],
])('rechaza recuperación con %s', async (_name, payload, code) => {
  const { client, fetchMock } = setup(() => Response.json(payload));
  await expect(client.findOrder(lookup)).rejects.toMatchObject({ code });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('crea exactamente una vez con referencia y depósito sin afirmar una reserva física', async () => {
  const { client, fetchMock, beforeRequest } = setup(() => Response.json({ datos: order() }, { status: 201 }));
  const result = await client.createOrder(request);
  expect(result.id).toBe(100);
  expect(result).not.toHaveProperty('reservationConfirmed');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(beforeRequest).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', redirect: 'manual', body: JSON.stringify(request) });
});

it.each([302, 400, 401, 429, 500, 503])('no reintenta una creación cuando Dux devuelve HTTP %s', async (status) => {
  const { client, fetchMock } = setup(() => new Response('respuesta privada', { status }));
  await expect(client.createOrder(request)).rejects.toMatchObject({ code: 'DUX_ORDER_RESULT_UNCERTAIN' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(['GET', 'POST'] as const)('diagnostica el rechazo HTTP de %s sin filtrar datos ni repetir la petición', async (method) => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const { client, fetchMock } = setup(() => new Response('cuerpo privado del proveedor', {
      status: 400, headers: { 'x-private': 'header privado' },
    }));
    await expect(method === 'GET' ? client.readItem('CODIGO-PRIVADO', 50) : client.createOrder(request))
      .rejects.toMatchObject({ code: method === 'GET' ? 'DUX_ORDER_QUERY_UNAVAILABLE' : 'DUX_ORDER_RESULT_UNCERTAIN' });
    expect(warning).toHaveBeenCalledExactlyOnceWith('dux_order_api_transport_failure', {
      endpoint: method === 'GET' ? '/v2/items' : '/v2/pedidos', method, providerStatus: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warning.mock.calls);
    for (const value of ['test-only-dux-order-token', 'CODIGO-PRIVADO', request.referencia, 'cuerpo privado', 'header privado']) {
      expect(logged).not.toContain(value);
    }
  } finally { warning.mockRestore(); }
});

it('distingue una falla de transporte sin registrar el mensaje privado de la excepción', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const { client, fetchMock } = setup(() => { throw new Error('token y URL privados'); });
    await expect(client.readItem('TEST-1', 50)).rejects.toMatchObject({ code: 'DUX_ORDER_QUERY_UNAVAILABLE' });
    expect(warning).toHaveBeenCalledExactlyOnceWith('dux_order_api_transport_failure', {
      endpoint: '/v2/items', method: 'GET', providerStatus: null, errorClass: 'fetch_exception',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally { warning.mockRestore(); }
});

it.each([
  ['conexión perdida', () => { throw new Error('respuesta privada'); }],
  ['JSON inválido', () => new Response('respuesta privada')],
  ['respuesta incompleta', () => Response.json({ datos: { id_pedido: 100 } })],
  ['otra referencia', () => Response.json({ datos: order({ referencia: 'otra' }) })],
])('conserva incertidumbre sin repetir POST ante %s', async (_name, response) => {
  const { client, fetchMock } = setup(response);
  await expect(client.createOrder(request)).rejects.toMatchObject({ code: 'DUX_ORDER_RESULT_UNCERTAIN' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('no llama al proveedor cuando el coordinador deniega acceso', async () => {
  const { client, fetchMock, beforeRequest } = setup(() => Response.json({ datos: order() }));
  beforeRequest.mockRejectedValue(new Error('DUX_BUSY'));
  await expect(client.createOrder(request)).rejects.toThrow('DUX_BUSY');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('persiste el intento después del turno Dux y no envía el POST si falla ese registro', async () => {
  const {client,fetchMock,beforeRequest}=setup(()=>Response.json({datos:order()}));
  const persist=vi.fn().mockRejectedValue(new Error('D1 claim unavailable'));
  await expect(client.createOrder(request,persist)).rejects.toThrow('D1 claim unavailable');
  expect(beforeRequest).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('compara líneas, cantidades, impuestos y referencia, sin confundir ids de proveedor con reserva', () => {
  const parsed = parseDuxOrderEvidence(order());
  expect(duxOrderMatchesRequest(parsed, request)).toBe(true);
  expect(duxOrderMatchesRequest({ ...parsed, cancelled: true }, request)).toBe(false);
  expect(duxOrderMatchesRequest({ ...parsed, lines: [{ ...parsed.lines[0]!, quantity: 3 }] }, request)).toBe(false);
  expect(duxOrderMatchesRequest({ ...parsed, lines: [{ ...parsed.lines[0]!, vatPercent: 10.5 }] }, request)).toBe(false);
  expect(duxOrderMatchesRequest({ ...parsed, lines: [{ ...parsed.lines[0]!, variantId: 2 }] }, request)).toBe(false);
});

it('lee precio Dux y stock decimal del depósito sin convertirlos a peso', async () => {
  const { client } = setup(() => Response.json(page([{
    cod_item: 'TEST-1', item: 'Producto de prueba', habilitado: true, porc_iva: 21,
    codigos_barra: [], ctd_unidades_por_bulto: null,
    precios: [{ id: 70, nombre: 'PRECIOS DEL NEGOCIO', precio: 3500 }],
    stock: [{ id: 50, nombre: 'Depósito de prueba', stock_real: 14.68, stock_reservado: 2,
      stock_disponible: 12.68, id_det_item: null }],
  }])));
  expect(await client.readItem('TEST-1', 50)).toEqual({ code: 'TEST-1', name: 'Producto de prueba',
    priceMinor: 350000, vatPercent: 21, realStock: 14.68, reservedStock: 2, availableStock: 12.68 });
});

it('rechaza cantidades fraccionarias y fechas inválidas antes de mutar Dux', async () => {
  const { client, fetchMock } = setup(() => Response.json({ datos: order() }));
  await expect(client.createOrder({ ...request, fecha: '2026-02-30' })).rejects.toMatchObject({ code: 'DUX_ORDER_RESPONSE_INVALID' });
  await expect(client.createOrder({ ...request, items: [{ ...request.items[0]!, ctd: 0.68 }] })).rejects.toMatchObject({ code: 'DUX_ORDER_RESPONSE_INVALID' });
  expect(fetchMock).not.toHaveBeenCalled();
});
