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

afterEach(() => { vi.unstubAllGlobals(); });

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

it('una sesión vencida no expone estado administrativo', async () => {
  const unauthorized = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
  render(<AssistedCheckoutAdminPanel requestId={requestId} onUnauthorized={unauthorized} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar preparación de cobro' }));
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Precio Dux actual:/u)).not.toBeInTheDocument();
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
