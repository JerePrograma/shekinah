import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssistedCheckoutAdminPanel } from './AssistedCheckoutAdminPanel';

const requestId = `req_${'a'.repeat(24)}`;
const preview = {
  state: 'preview',
  preview: {
    requestId,
    catalogVersion: 'a'.repeat(64),
    catalogObservedAt: '2026-09-10T14:00:00.000Z',
    lines: [{ productId: 'producto', duxCode: 'DUX-1', name: 'Producto Dux', quantity: 2, unitPriceMinor: 10_000, subtotalMinor: 20_000 }],
    itemCount: 2,
    productsTotalMinor: 20_000,
    deliveryMethod: 'coordinated_pickup',
    shippingMinor: 0,
    totalMinor: 20_000,
  },
};
const prepared = {
  state: 'prepared',
  prepared: {
    orderId: `ord_${'b'.repeat(24)}`,
    requestId,
    duxOrderNumber: 'PED-1',
    duxOrderId: null,
    catalogVersion: 'a'.repeat(64),
    itemCount: 2,
    productsTotalMinor: 20_000,
    shippingMinor: 0,
    totalMinor: 20_000,
    reservationStatus: 'confirmed',
    paymentStatus: 'none',
    paymentRequiresReview: false,
  },
};
const reservationReview = { code: 'DUX-1', quantity: 2, duxOrderId: 100, duxOrderNumber: 200,
  before: { realStock: 9, reservedStock: 0, availableStock: 9 },
  after: { realStock: 7, reservedStock: 2, availableStock: 5 },
  beforeObservedAt: '2026-09-21T18:58:50.364Z', afterObservedAt: '2026-09-30T13:13:21.000Z' };

afterEach(() => { vi.unstubAllGlobals(); });

it('recupera una preparación directa por el servidor sin pedir otra reserva manual',async()=>{
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({state:'direct_preparing',requestId,
    preparationStatus:'uncertain',duxReference:`shekinah:web:${requestId}`,errorCode:'DUX_ORDER_RESULT_UNCERTAIN'}))
    .mockResolvedValueOnce(Response.json(prepared));
  vi.stubGlobal('fetch',fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Consultar preparación de cobro'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Todavía no pudimos confirmar la reserva');
  expect(screen.getByText('DUX_ORDER_RESULT_UNCERTAIN')).not.toBeVisible();
  fireEvent.click(await screen.findByRole('button',{name:'Continuar verificación Dux'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Pedido preparado'));
  expect(fetchMock.mock.calls[1]).toEqual([`/api/admin/web-order-requests/${requestId}/resume`,{method:'POST',credentials:'same-origin',redirect:'error'}]);
  expect(screen.queryByRole('button',{name:'Preparar cobro'})).not.toBeInTheDocument();
});

it('muestra precios Dux de sólo lectura y prepara una reserva confirmada', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json({ created: true }, { status: 201 }))
    .mockResolvedValueOnce(Response.json(prepared));
  vi.stubGlobal('fetch', fetchMock);
  const busy = vi.fn();
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={busy} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByText(/Precio Dux actual:/u)).toHaveTextContent(/100/u);
  expect(screen.queryByRole('textbox', { name: /precio/iu })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Número de pedido Dux' }), { target: { value: 'PED-1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/iu }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cobro' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('no crea ni modifica el pedido en Dux');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar preparación' }));
  expect(await screen.findByRole('status')).toHaveTextContent('PED-1');
  const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
  expect(post).toBeDefined();
  expect(parseRequestBody(post)).toEqual({
    duxOrderNumber: 'PED-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true,
  });
  expect(busy).toHaveBeenCalledWith(true, 'Preparando cobro asistido');
});

it('exige una cotización final positiva para correo y la envía en minor units', async () => {
  const correo = { ...preview, preview: { ...preview.preview, deliveryMethod: 'correo_argentino', shippingMinor: null, totalMinor: null } };
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(correo))
    .mockResolvedValueOnce(Response.json({ created: true }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ ...prepared, prepared: { ...prepared.prepared, shippingMinor: 250_000, totalMinor: 270_000 } }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  const shipping = await screen.findByRole('spinbutton', { name: 'Cotización final de Correo Argentino (ARS)' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Número de pedido Dux' }), { target: { value: 'PED-CORREO' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/iu }));
  fireEvent.change(shipping, { target: { value: '2500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cobro' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar preparación' }));
  await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1));
  const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
  expect(parseRequestBody(post)).toMatchObject({ duxOrderNumber: 'PED-CORREO', shippingMinor: 250_000 });
});

it('recupera una preparación existente sin ofrecer campos para recrearla', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(prepared)));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByRole('status')).toHaveTextContent('PED-1');
  expect(screen.queryByRole('textbox', { name: 'Número de pedido Dux' })).not.toBeInTheDocument();
});

it('permite registrar una liberación ya hecha en Dux y exige releer el estado persistido', async () => {
  const released = { ...prepared, prepared: { ...prepared.prepared, reservationStatus: 'released' } };
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(prepared))
    .mockResolvedValueOnce(Response.json({ action: 'release', changed: true, reservationStatus: 'released' }))
    .mockResolvedValueOnce(Response.json(released));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar liberación en Dux' }));
  expect(screen.getByRole('alertdialog', { name: 'Confirmar liberación Dux' }))
    .toHaveTextContent('Shekinah no ejecutará esta operación en Dux');
  fireEvent.click(screen.getByRole('button', { name: 'Sí, ya está liberado en Dux' }));
  expect(await screen.findByText(/Reserva: liberada/u)).toBeVisible();
  const lifecyclePost = fetchMock.mock.calls.find((call) =>
    typeof call[0] === 'string' && call[0].includes('/dux-lifecycle'));
  expect(parseRequestBody(lifecyclePost)).toEqual({ action: 'release', confirmedInDux: true });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('con pago aprobado ofrece finalizar y nunca liberar', async () => {
  const approved = { ...prepared, prepared: { ...prepared.prepared, paymentStatus: 'approved' } };
  const finalized = { ...approved, prepared: { ...approved.prepared, reservationStatus: 'finalized' } };
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(approved))
    .mockResolvedValueOnce(Response.json({ action: 'finalize', changed: true, reservationStatus: 'finalized' }))
    .mockResolvedValueOnce(Response.json(finalized));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByRole('button', { name: 'Confirmar finalización en Dux' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirmar liberación en Dux' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar finalización en Dux' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sí, ya está finalizado en Dux' }));
  expect(await screen.findByText(/Reserva: finalizada/u)).toBeVisible();
  const lifecyclePost = fetchMock.mock.calls.find((call) =>
    typeof call[0] === 'string' && call[0].includes('/dux-lifecycle'));
  expect(parseRequestBody(lifecyclePost)).toEqual({ action: 'finalize', confirmedInDux: true });
});

it('no ofrece un cierre Dux mientras el pago está pendiente o hay una incidencia financiera', async () => {
  const pending = { ...prepared, prepared: { ...prepared.prepared, paymentStatus: 'pending' } };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(pending)));
  const first = render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByText(/Pago: pendiente/u)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Confirmar (?:liberación|finalización) en Dux/u })).not.toBeInTheDocument();
  first.unmount();

  const review = { ...prepared, prepared: { ...prepared.prepared, paymentStatus: 'approved', paymentRequiresReview: true } };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(review)));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByText(/Revisá el pago en Mercado Pago y la reserva en Dux/u)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Confirmar (?:liberación|finalización) en Dux/u })).not.toBeInTheDocument();
});

it('un conflicto server-side no se convierte en liberación exitosa local', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(prepared))
    .mockResolvedValueOnce(Response.json({
      error: { code: 'ASSISTED_RELEASE_PAYMENT_BLOCKED', message: 'El estado financiero cambió y ya no permite liberar la reserva.' },
    }, { status: 409 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar liberación en Dux' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sí, ya está liberado en Dux' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El pedido tiene un pago aprobado o pendiente. No liberes la reserva');
  expect(screen.queryByText(/El estado financiero cambió/u)).not.toBeInTheDocument();
  expect(screen.getByText(/Reserva: confirmada/u)).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('una sesión vencida no expone estado administrativo', async () => {
  const unauthorized = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={unauthorized} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Precio Dux actual:/u)).not.toBeInTheDocument();
});

it.each([
  ['Preparar cobro', preview],
  ['Confirmar liberación en Dux', prepared],
  ['Confirmar finalización en Dux', { ...prepared, prepared: { ...prepared.prepared, paymentStatus: 'approved' } }],
] as const)('permite cancelar %s con Escape y recupera el foco sin mutar', async (triggerName, initialState) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(initialState));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  if (triggerName === 'Preparar cobro') {
    fireEvent.change(await screen.findByRole('textbox', { name: 'Número de pedido Dux' }), { target: { value: 'PED-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/u }));
  }
  fireEvent.click(await screen.findByRole('button', { name: triggerName }));
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: triggerName })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: triggerName })).toHaveFocus());
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});

it('distingue una revisión necesaria de una preparación en curso', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    state: 'direct_preparing', requestId, preparationStatus: 'requires_review',
    duxReference: `shekinah:web:${requestId}`, errorCode: 'DIRECT_RESERVATION_UNVERIFIED',
  })));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByRole('status')).toHaveTextContent('La compra necesita revisión');
  expect(screen.getByRole('status')).toHaveTextContent('el cobro no está habilitado');
  expect(screen.queryByRole('button', { name: 'Continuar verificación Dux' })).not.toBeInTheDocument();
  expect(screen.getByText('DIRECT_RESERVATION_UNVERIFIED')).not.toBeVisible();
  fireEvent.click(screen.getByText('Datos para revisar el pedido en Dux'));
  expect(screen.getByText('DIRECT_RESERVATION_UNVERIFIED')).toBeVisible();
});

it('muestra las lecturas incompatibles y recarga la revisión persistida tras un avance fallido', async () => {
  const review = { state: 'direct_preparing', requestId, preparationStatus: 'requires_review',
    duxReference: `shekinah:web:${requestId}`, errorCode: 'DIRECT_RESERVATION_UNVERIFIED', reservationReview };
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(review))
    .mockResolvedValueOnce(Response.json({ error: { code: 'DIRECT_RESERVATION_UNVERIFIED' } }, { status: 409 }))
    .mockResolvedValueOnce(Response.json(review));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  await screen.findByRole('status');
  expect(screen.getByText('Lecturas de stock que requieren revisión')).not.toBeVisible();
  fireEvent.click(screen.getByText('Datos para revisar el pedido en Dux'));
  expect(screen.getByRole('table', { name: 'Lecturas de stock que requieren revisión' })).toBeVisible();
  expect(screen.getByText(/Pedido Dux 200 \(ID 100\)/u)).toBeVisible();
  expect(screen.getByText(/El stock real cambió entre ambas lecturas/u)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar verificación Dux' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.getByRole('status')).toHaveTextContent('La compra necesita revisión');
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(fetchMock.mock.calls[2]?.[1]?.method).toBeUndefined();
  expect(screen.queryByRole('button', { name: 'Preparar cobro' })).not.toBeInTheDocument();
});

it('rechaza el diagnóstico inválido antes de permitir continuar la verificación', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    state: 'direct_preparing', requestId, preparationStatus: 'requires_review',
    duxReference: `shekinah:web:${requestId}`, errorCode: 'DIRECT_RESERVATION_UNVERIFIED',
    reservationReview: { ...reservationReview, quantity: -1 },
  })));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Continuar verificación Dux' })).not.toBeInTheDocument();
});

it('recupera un pedido preparado tras un fallo sin exponer errores ni repetir la preparación', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json({ error: { code: 'UNKNOWN_FAILURE', message: 'D1 table trace privado' } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json(prepared));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Número de pedido Dux' }), { target: { value: 'PED-1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cobro' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar preparación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Actualizá el estado antes de repetirla');
  expect(screen.queryByText(/D1 table trace/u)).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Número de pedido Dux' })).toHaveValue('PED-1');
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
  expect(await screen.findByRole('status')).toHaveTextContent('SHK-BBBBBBBB');
  expect(screen.getByRole('status')).not.toHaveTextContent(prepared.prepared.orderId);
  expect(screen.getByText(/Pago: sin pago confirmado/u)).toBeVisible();
  expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  expect(fetchMock.mock.calls[2]?.[1]?.method).toBeUndefined();
});

it('al actualizar precios conserva los datos pero requiere volver a confirmar la reserva', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json(preview)));
  vi.stubGlobal('fetch', fetchMock);
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Número de pedido Dux' }), { target: { value: 'PED-1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/u }));
  expect(screen.getByRole('button', { name: 'Preparar cobro' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /Confirmo que verifiqué en Dux/u })).not.toBeChecked());
  expect(screen.getByRole('textbox', { name: 'Número de pedido Dux' })).toHaveValue('PED-1');
  expect(screen.getByRole('button', { name: 'Preparar cobro' })).toBeDisabled();
  expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
});

it('conserva el pedido preparado si actualizar falla y oculta detalles técnicos', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(prepared))
    .mockRejectedValueOnce(new Error('SQL internal private trace')));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  expect(await screen.findByRole('status')).toHaveTextContent('SHK-BBBBBBBB');
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar el pedido. Reintentá');
  expect(screen.getByRole('status')).toHaveTextContent('SHK-BBBBBBBB');
  expect(screen.queryByText(/SQL internal/u)).not.toBeInTheDocument();
});

function parseRequestBody(call: readonly unknown[] | undefined): unknown {
  const init = call?.[1];
  if (typeof init !== 'object' || init === null || !('body' in init)) {
    throw new Error('El request de prueba no contiene opciones válidas.');
  }
  const body = init.body;
  if (typeof body !== 'string') throw new Error('El request de prueba no contiene un body JSON string.');
  return JSON.parse(body) as unknown;
}
