import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WebOrderRequestSection } from './WebOrderRequestSection';
import type { CartItem } from '../cart/model';
import type { WebRequestReceipt } from './web-order-contracts';

const doubles = vi.hoisted(() => ({
  read: vi.fn(), create: vi.fn(), finish: vi.fn(), submit: vi.fn(), recover: vi.fn(), token: vi.fn(), checkout: vi.fn(),
}));
vi.mock('./web-request-session', () => ({ readWebRequestIdentity: doubles.read, getOrCreateWebRequestIdentity: doubles.create, finishWebRequestIdentity: doubles.finish }));
vi.mock('./web-request-api', () => ({
  submitWebRequest: doubles.submit,
  recoverWebRequest: doubles.recover,
  readWebRequest: doubles.token,
  startWebRequestCheckout: doubles.checkout,
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

it('confirma el registro sin consentimiento ni apertura de WhatsApp y evita doble clic', async () => {
  render(component());
  const button = screen.getByRole('button', { name: 'Registrar solicitud web' });
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
  render(component()); fireEvent.click(screen.getByRole('button', { name: 'Registrar solicitud web' }));
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
  expect(screen.queryByRole('button', { name: 'Registrar solicitud web' })).not.toBeInTheDocument();
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('sin alta habilitada ni intento previo no presenta una falsa capacidad', async () => {
  render(component(false));
  await waitFor(() => expect(doubles.read).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Solicitud desde la página' })).not.toBeInTheDocument();
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
  render(component()); fireEvent.click(screen.getByRole('button', { name: 'Registrar solicitud web' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Almacenamiento no disponible');
  expect(doubles.submit).not.toHaveBeenCalled();
});

it('muestra Mercado Pago sólo cuando el servidor confirma reserva y total', async () => {
  const ready: WebRequestReceipt = { ...receipt, status: 'accepted', reservationStatus: 'confirmed', checkoutAvailable: true, totalMinor: 123_400 };
  doubles.read.mockResolvedValue(identity); doubles.recover.mockResolvedValue(ready);
  doubles.checkout.mockImplementation(() => new Promise(() => undefined));
  render(component());
  const pay = await screen.findByRole('button', { name: 'Pagar con Mercado Pago' });
  expect(screen.getByRole('status')).toHaveTextContent('La reserva Dux y el total están confirmados');
  expect(screen.getByText(/Total confirmado:/u)).toHaveTextContent('$ 1.234');
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
