import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WebOrderRequestsPanel } from './WebOrderRequestsPanel';

const id = 'req_abcdefghijklmnopqrstuvwx';
const detail = { id, status: 'submitted', snapshot: { schemaVersion: 1, catalogVersion: 'a'.repeat(64), observedAt: '2026-09-08T12:00:00.000Z',
  quantityStatus: 'requires_confirmation', totalMinor: null, shippingMinor: 0,
  fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente de prueba', phone: '1234567890', address: '', locality: '', province: '', postalCode: '' },
  lines: [{ productId: 'dux-test', duxCode: 'TEST', name: 'Producto sintético', requestedQuantity: 2, observedUnitPriceMinor: 1000 }] } };
function list(status = 'submitted') { return { rows: [{ id, status, full_name: 'Cliente de prueba' }], hasMore: false }; }
afterEach(() => { vi.unstubAllGlobals(); });

it('consulta bajo demanda y exige confirmar la aceptación sin convertirla en pago', async () => {
  let status = 'submitted';
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/resolve')) { status = 'accepted'; return Promise.resolve(Response.json({ ...detail, status })); }
    return Promise.resolve(Response.json(url.includes('?offset=') ? list(status) : { ...detail, status }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const busy = vi.fn();
  render(<WebOrderRequestsPanel onUnauthorized={vi.fn()} onBusyChange={busy} />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar solicitudes web' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver solicitud WEB-abcdefghijklmnopqrstuvwx' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar para gestión' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('no confirma pago, stock ni total');
  expect(screen.getByRole('button', { name: 'Cancelar resolución' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar resolución' }));
  expect(await screen.findByRole('heading', { name: 'WEB-abcdefghijklmnopqrstuvwx · Aceptada para gestión' })).toBeVisible();
  expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  expect(busy).toHaveBeenCalledWith(true, 'Resolviendo solicitud web');
  expect(busy).toHaveBeenCalledWith(false, undefined);
});

it('un error de lectura no se informa como ausencia de solicitudes', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })));
  render(<WebOrderRequestsPanel onUnauthorized={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar solicitudes web' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar');
  expect(screen.queryByText('No hay solicitudes en esta página.')).not.toBeInTheDocument();
});

it('una sesión vencida no recibe la lista ni permite resolver', async () => {
  const unauthorized = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
  render(<WebOrderRequestsPanel onUnauthorized={unauthorized} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar solicitudes web' }));
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: 'Aceptar para gestión' })).not.toBeInTheDocument();
});
