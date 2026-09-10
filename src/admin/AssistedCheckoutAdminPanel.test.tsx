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
  expect(await screen.findByText('Existe una incidencia que requiere revisión antes de continuar.')).toBeVisible();
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
  expect(await screen.findByRole('alert')).toHaveTextContent('El estado financiero cambió');
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

function parseRequestBody(call: readonly unknown[] | undefined): unknown {
  const init = call?.[1];
  if (typeof init !== 'object' || init === null || !('body' in init)) {
    throw new Error('El request de prueba no contiene opciones válidas.');
  }
  const body = init.body;
  if (typeof body !== 'string') throw new Error('El request de prueba no contiene un body JSON string.');
  return JSON.parse(body) as unknown;
}
