import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WebOrderRequestSection } from './WebOrderRequestSection';
import type { CartItem } from '../cart/model';
import type { WebRequestReceipt } from './web-order-contracts';

const doubles = vi.hoisted(() => ({
  read: vi.fn(), create: vi.fn(), finish: vi.fn(), submit: vi.fn(), recover: vi.fn(), token: vi.fn(), checkout: vi.fn(), prepare: vi.fn(),
}));
vi.mock('./web-request-session', () => ({ readWebRequestIdentity: doubles.read, getOrCreateWebRequestIdentity: doubles.create, finishWebRequestIdentity: doubles.finish }));
vi.mock('./web-request-api', () => ({
  submitWebRequest: doubles.submit,
  recoverWebRequest: doubles.recover,
  readWebRequest: doubles.token,
  startWebRequestCheckout: doubles.checkout,
  prepareWebRequest: doubles.prepare,
}));
vi.mock('./env', () => ({ getAuthorizedWhatsappNumber: () => '5492236216559' }));
vi.mock('../analytics/client', () => ({ trackAnalyticsEvent: vi.fn() }));
const identity = { idempotencyKey: '00000000-0000-4000-8000-000000000000', ownerSecret: 'b'.repeat(64) };
const receipt: WebRequestReceipt = { reference: 'WEB-abcdefghijklmnopqrstuvwx', status: 'submitted',
  createdAt: '2026-09-08T12:00:00.000Z', updatedAt: '2026-09-08T12:00:00.000Z', publicToken: 'a'.repeat(64),
  paymentStatus: 'not_requested', paymentRequiresReview: false, reservationStatus: 'not_reserved', checkoutAvailable: false, totalMinor: null };
const fulfillment = { method: 'coordinated_pickup' as const, fullName: 'Cliente prueba', phone: '1234567890', address: '', locality: '', province: '', postalCode: '' };
const items: readonly CartItem[] = [{
  product: { id: 'producto-prueba', slug: 'producto-prueba', path: '/producto-prueba/',
    name: 'Producto de prueba', categorySlugs: [], categoryNames: [],
    price: { amount: 10, currency: 'ARS' }, priceStatus: 'usable' },
  quantity: 1, unitPrice: 10, subtotal: 10,
}];
function component(registrationEnabled = true) { return <WebOrderRequestSection registrationEnabled={registrationEnabled} items={items} fulfillment={fulfillment} disabled={false} onBusyChange={vi.fn()} onActiveChange={vi.fn()} />; }

beforeEach(() => {
  window.history.replaceState(null, '', '/carrito');
  for (const mock of Object.values(doubles)) mock.mockReset();
  doubles.read.mockResolvedValue(null); doubles.create.mockResolvedValue(identity); doubles.submit.mockResolvedValue(receipt);
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('avanza la compra directa sin aprobación humana y ofrece pago sólo tras confirmar el servidor', async () => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity);
  doubles.recover.mockResolvedValue({...receipt,preparationStatus:'preparing'});
  doubles.prepare.mockResolvedValue({...receipt,status:'accepted',preparationStatus:'prepared',reservationStatus:'confirmed',checkoutAvailable:true,totalMinor:350000});
  render(component());
  await act(async()=> { await Promise.resolve(); });
  expect(screen.queryByRole('button',{name:'Pagar con Mercado Pago'})).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Estamos verificando');
  await act(async()=> { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole('button',{name:'Pagar con Mercado Pago'})).toBeEnabled();
  expect(doubles.prepare).toHaveBeenCalledTimes(1);
  expect(doubles.submit).not.toHaveBeenCalled();
  expect(doubles.checkout).not.toHaveBeenCalled();
  await act(async()=> { await vi.advanceTimersByTimeAsync(15000); });
  expect(doubles.prepare).toHaveBeenCalledTimes(1);
});

it('comunica al resumen el total confirmado de la solicitud guardada', async () => {
  const onConfirmedTotalChange=vi.fn();
  doubles.read.mockResolvedValue(identity);
  doubles.recover.mockResolvedValue({...receipt,status:'accepted',reservationStatus:'confirmed',checkoutAvailable:true,totalMinor:123450});
  render(<WebOrderRequestSection registrationEnabled items={items} fulfillment={fulfillment} disabled={false}
    onBusyChange={vi.fn()} onActiveChange={vi.fn()} onConfirmedTotalChange={onConfirmedTotalChange}/>);
  await waitFor(()=>expect(onConfirmedTotalChange).toHaveBeenLastCalledWith(123450));
  expect(screen.getByText('Total confirmado:').parentElement).toHaveTextContent('1.234,5');
});

it('confirma el registro sin consentimiento ni apertura de WhatsApp y evita doble clic', async () => {
  render(component());
  const button = screen.getByRole('button', { name: 'Continuar con mi compra' });
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByRole('heading', { name: 'Solicitud registrada' })).toBeVisible();
  expect(doubles.submit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('Sin cobro ni reserva acreditados');
  expect(screen.getByRole('link', { name: 'Consultar por WhatsApp (opcional)' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Enlace protegido de esta solicitud' })).toHaveAttribute('href', `/carrito#solicitud=${receipt.publicToken}`);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('una respuesta perdida conserva la identidad y se recupera sin reenviar la creación', async () => {
  doubles.submit.mockRejectedValueOnce(new Error('Respuesta perdida.')); doubles.recover.mockResolvedValue(receipt);
  render(component()); fireEvent.click(screen.getByRole('button', { name: 'Continuar con mi compra' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Respuesta perdida');
  fireEvent.click(screen.getByRole('button', { name: 'Consultar estado de la solicitud' }));
  expect(await screen.findByRole('heading', { name: 'Solicitud registrada' })).toBeVisible();
  expect(doubles.submit).toHaveBeenCalledTimes(1); expect(doubles.recover).toHaveBeenCalledWith(identity);
  expect(doubles.finish).not.toHaveBeenCalled();
});

it('las altas cerradas no impiden recuperar la solicitud del navegador', async () => {
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  render(component(false));
  expect(await screen.findByRole('heading', { name: 'Solicitud registrada' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Continuar con mi compra' })).not.toBeInTheDocument();
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('sin alta habilitada ni intento previo no presenta una falsa capacidad', async () => {
  render(component(false));
  await waitFor(() => expect(doubles.read).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Tu pedido' })).not.toBeInTheDocument();
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('un enlace protegido no requiere el almacenamiento privado de otro navegador', async () => {
  window.history.replaceState(null, '', `/carrito#solicitud=${receipt.publicToken}`);
  doubles.read.mockRejectedValue(new Error('Sin almacenamiento.')); doubles.token.mockResolvedValue(receipt);
  render(component(false));
  expect(await screen.findByRole('heading', { name: 'Solicitud registrada' })).toBeVisible();
  expect(doubles.token).toHaveBeenCalledWith(receipt.publicToken); expect(doubles.read).not.toHaveBeenCalled();
});

it('no envía si el navegador no logra persistir la identidad', async () => {
  doubles.create.mockRejectedValue(new Error('Almacenamiento no disponible.'));
  render(component()); fireEvent.click(screen.getByRole('button', { name: 'Continuar con mi compra' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Almacenamiento no disponible');
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('muestra Mercado Pago sólo cuando el servidor confirma reserva y total', async () => {
  const ready: WebRequestReceipt = { ...receipt, status: 'accepted', reservationStatus: 'confirmed', checkoutAvailable: true, totalMinor: 123_400 };
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(ready);
  doubles.checkout.mockImplementation(() => new Promise(() => undefined));
  render(component());
  const pay = await screen.findByRole('button', { name: 'Pagar con Mercado Pago' });
  expect(screen.getByRole('status')).toHaveTextContent('Tu stock está reservado y el total está confirmado');
  const totalLabel = screen.getByText('Total confirmado:');
  expect(totalLabel.parentElement).toHaveTextContent(/1\.234/u);
  fireEvent.click(pay); fireEvent.click(pay);
  await waitFor(() => expect(doubles.checkout).toHaveBeenCalledTimes(1));
  expect(doubles.checkout).toHaveBeenCalledWith(ready.publicToken, ready.totalMinor);
  expect(screen.getByRole('button', { name: 'Preparando pago…' })).toBeDisabled();
});

it('un pago pendiente o aprobado se muestra y nunca ofrece otro botón de pago', async () => {
  const approved: WebRequestReceipt = { ...receipt, status: 'accepted', reservationStatus: 'confirmed',
    paymentStatus: 'approved', paymentRequiresReview: true, checkoutAvailable: false, totalMinor: 123_400 };
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(approved);
  render(component());
  expect(await screen.findByRole('status')).toHaveTextContent('Pago recibido. No vuelvas a pagar');
  expect(screen.queryByRole('button', { name: 'Pagar con Mercado Pago' })).not.toBeInTheDocument();
  expect(doubles.checkout).not.toHaveBeenCalled();
});

it('no permite abrir otro intento mientras una solicitud aceptada sigue activa', async () => {
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue({ ...receipt, status: 'accepted' });
  render(component());
  expect(await screen.findByRole('heading', { name: 'Solicitud registrada' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Preparar otra solicitud' })).not.toBeInTheDocument();
});

it('sólo prepara otra solicitud después de volver a consultar una resolución terminal segura', async () => {
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue({ ...receipt, status: 'rejected' });
  render(component());
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar otra solicitud' }));
  await waitFor(() => expect(doubles.finish).toHaveBeenCalledWith(identity.idempotencyKey));
  expect(doubles.recover).toHaveBeenCalledTimes(2);
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('actualiza la reserva y habilita Mercado Pago sin pedir otra carga de datos ni consulta manual', async () => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  doubles.token.mockResolvedValue({ ...receipt, status: 'accepted', reservationStatus: 'confirmed',
    checkoutAvailable: true, totalMinor: 123_400 });
  doubles.checkout.mockImplementation(() => new Promise(() => undefined));
  render(component(false));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole('button', { name: 'Pagar con Mercado Pago' })).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  const pay = screen.getByRole('button', { name: 'Pagar con Mercado Pago' });
  expect(pay).toBeEnabled();
  expect(screen.getByText('Total confirmado:').parentElement).toHaveTextContent('1.234');
  expect(doubles.recover).toHaveBeenCalledTimes(1);
  expect(doubles.submit).not.toHaveBeenCalled();
  expect(doubles.checkout).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
  fireEvent.click(pay); fireEvent.click(pay);
  expect(doubles.checkout).toHaveBeenCalledTimes(1);
  expect(doubles.checkout).toHaveBeenCalledWith(receipt.publicToken, 123_400);
});

it('espacia y limita las lecturas automáticas sin cambiar cuotas ni reenviar el alta', async () => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  doubles.token.mockResolvedValue(receipt);
  render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
  expect(doubles.token).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(doubles.token).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(doubles.token).toHaveBeenCalledTimes(8);
  expect(screen.getByText(/La actualización automática terminó por ahora/u)).toBeVisible();
  expect(doubles.submit).not.toHaveBeenCalled();
  expect(doubles.checkout).not.toHaveBeenCalled();
});

it('pausa las lecturas en una pestaña oculta y retoma al volver a estar visible', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  doubles.token.mockResolvedValue(receipt);
  render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(75_000); });
  expect(doubles.token).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
});

it('un fallo detiene la consulta automática y permite recuperar el mismo intento', async () => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  doubles.token.mockRejectedValueOnce(new Error('Límite de consultas.')).mockResolvedValue(receipt);
  render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/No pudimos actualizar el estado/u)).toBeVisible();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Consultar estado de la solicitud' })); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(doubles.recover).toHaveBeenCalledTimes(2);
  expect(doubles.token).toHaveBeenCalledTimes(2);
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('una respuesta automática antigua no pisa la recuperación manual más reciente', async () => {
  vi.useFakeTimers();
  let resolveRead: (value: WebRequestReceipt) => void = () => { throw new Error('Lectura no iniciada.'); };
  doubles.token.mockImplementation(() => new Promise<WebRequestReceipt>((resolve) => { resolveRead = resolve; }));
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValueOnce(receipt)
    .mockResolvedValue({ ...receipt, status: 'rejected' });
  render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  const signal = doubles.token.mock.calls[0]?.[1] as AbortSignal;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Consultar estado de la solicitud' })); await Promise.resolve(); });
  expect(signal.aborted).toBe(true);
  await act(async () => { resolveRead(receipt); await Promise.resolve(); });
  expect(screen.getByRole('status')).toHaveTextContent('Rechazada');
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
});

it('cancela la lectura pendiente al salir de la página y no solapa peticiones', async () => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(receipt);
  doubles.token.mockImplementation(() => new Promise(() => undefined));
  const view = render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(doubles.token).toHaveBeenCalledTimes(1);
  const signal = doubles.token.mock.calls[0]?.[1] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(doubles.checkout).not.toHaveBeenCalled();
});

it.each([
  { status: 'rejected' as const },
  { paymentStatus: 'approved' as const },
  { paymentStatus: 'refunded' as const },
  { paymentRequiresReview: true },
  { reservationStatus: 'released' as const },
  { reservationStatus: 'finalized' as const },
  { reservationStatus: 'requires_review' as const },
])('no consulta automáticamente una resolución terminal o con incidencia: %j', async (state) => {
  vi.useFakeTimers();
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue({ ...receipt, ...state });
  render(component());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(900_000); });
  expect(doubles.token).not.toHaveBeenCalled();
  expect(doubles.checkout).not.toHaveBeenCalled();
});
