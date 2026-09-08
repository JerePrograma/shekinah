import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommerceAttentionPanel } from './CommerceAttentionPanel';

afterEach(() => { vi.unstubAllGlobals(); });

it('carga bajo demanda y muestra el pago separado de la tarea Dux sin ofrecer mutaciones', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ rows: [{
    id: 'ord_123456789012345678901234', payment_status: 'approved',
    reservation_state: 'uncertain', dux_reference: 'shekinah:example', next_action: 'payment_review',
  }], hasMore: false })));
  vi.stubGlobal('fetch', fetchMock);
  render(<CommerceAttentionPanel />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pendientes comerciales' }));
  expect(await screen.findByText(/No solicitar otro pago/)).toBeVisible();
  expect(screen.getByText(/Pago: Pago recibido. Dux: Resultado incierto/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /liberar|finalizar|reembolsar/iu })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
});

it('no muestra como vacío un error de lectura y permite reintentar', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [], hasMore: false }))));
  render(<CommerceAttentionPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pendientes comerciales' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar');
  expect(screen.queryByText('No hay pendientes en esta página.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar pendientes' }));
  expect(await screen.findByText('No hay pendientes en esta página.')).toBeVisible();
});

it('respeta el vencimiento de sesión', async () => {
  const unauthorized = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
  render(<CommerceAttentionPanel onUnauthorized={unauthorized} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pendientes comerciales' }));
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('alert')).toHaveTextContent('sesión administrativa venció');
});

it('rechaza una acción desconocida sin mostrar instrucciones no validadas', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ rows: [{
    id: 'ord_123456789012345678901234', payment_status: 'approved',
    reservation_state: 'confirmed', dux_reference: null, next_action: 'invented_action',
  }], hasMore: false }))));
  render(<CommerceAttentionPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pendientes comerciales' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('respuesta de pendientes no es válida');
  expect(screen.queryByText('No hay pendientes en esta página.')).not.toBeInTheDocument();
});
