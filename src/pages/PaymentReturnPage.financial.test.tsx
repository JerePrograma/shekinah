import { fireEvent, render, screen } from '@testing-library/react';
import { PaymentReturnPage } from './PaymentReturnPage';

const doubles = vi.hoisted(() => ({ clear: vi.fn(), forget: vi.fn(), status: vi.fn(), track: vi.fn(), whatsapp: vi.fn() }));
vi.mock('../analytics/client', () => ({ trackAnalyticsEvent: doubles.track }));
vi.mock('../commerce/env', () => ({ getAuthorizedWhatsappNumber: doubles.whatsapp }));
vi.mock('../cart/CartContext', () => ({ useCart: () => ({ clear: doubles.clear, items: [] }) }));
vi.mock('../commerce/api', () => ({ getPublicOrderStatus: doubles.status }));
vi.mock('../commerce/checkout-session', () => ({
  clearRememberedCheckoutOrder: doubles.forget,
  readRememberedCheckoutOrder: () => null,
  shouldClearCartAfterApproval: () => true,
}));
const base = { orderNumber: 'SHK-12AB34CD', status: 'pending', currency: 'ARS', totalMinor: 10000, itemCount: 1, updatedAt: '2026-09-08T12:00:00.000Z' };

beforeEach(() => {
  doubles.clear.mockReset(); doubles.forget.mockReset(); doubles.status.mockReset();
  doubles.track.mockReset(); doubles.whatsapp.mockReturnValue('5492236216559');
  window.history.replaceState(null, '', `/pago/pendiente?order=${'a'.repeat(64)}`);
});

it('confirma el pago verificado con número comercial y WhatsApp opcional, sin detalles internos', async () => {
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'approved', requiresReview: false, updatedAt: base.updatedAt } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: '¡Compra confirmada!' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Tu pedido es SHK-12AB34CD.');
  expect(screen.getByText('Pronto nos pondremos en contacto para coordinar la entrega.')).toBeVisible();
  const whatsapp = screen.getByRole('link', { name: 'Enviar mensaje por WhatsApp' });
  const url = new URL(whatsapp.getAttribute('href') ?? '');
  expect(url.origin).toBe('https://wa.me');
  expect(url.pathname).toBe('/5492236216559');
  expect(url.searchParams.get('text')).toBe('Hola, realicé la compra SHK-12AB34CD en Shekinah. Quedo a la espera para coordinar la entrega.');
  expect(whatsapp).toHaveAttribute('target', '_blank');
  expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
  fireEvent.click(whatsapp);
  expect(doubles.track).toHaveBeenCalledExactlyOnceWith('whatsapp_open', { path: '/pago/exito' });
  for (const text of ['Estado del pedido', 'Estado del pago', 'WEB-', 'Dux', 'Enlace protegido', 'publicToken']) {
    expect(document.body).not.toHaveTextContent(text);
  }
  expect(screen.queryByRole('button', { name: 'Reintentar verificación' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Retomar mi compra' })).not.toBeInTheDocument();
  expect(doubles.clear).toHaveBeenCalledTimes(1);
  expect(doubles.status).toHaveBeenCalledTimes(1);
});

it('no inventa un contacto si el mecanismo autorizado no devuelve un número', async () => {
  doubles.whatsapp.mockReturnValue(null);
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'approved', requiresReview: false, updatedAt: base.updatedAt } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  await screen.findByRole('heading', { name: '¡Compra confirmada!' });
  expect(screen.queryByRole('link', { name: 'Enviar mensaje por WhatsApp' })).not.toBeInTheDocument();
});

it.each([
  ['pending', 'Estamos confirmando tu pago', false],
  ['rejected', 'El pago no se completó', true],
  ['cancelled', 'El pago fue cancelado', true],
  ['refunded', 'Pago reintegrado o revertido', false],
] as const)('conserva %s aunque el navegador anuncie éxito y no vacía el carrito', async (payment, title, canResume) => {
  window.history.replaceState(null, '', `/pago/exito?order=${'a'.repeat(64)}&status=approved`);
  doubles.status.mockResolvedValue({ ...base, payment: { status: payment, requiresReview: false, updatedAt: base.updatedAt } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  await screen.findByText(payment === 'pending'
    ? 'Tu pedido está registrado. No vuelvas a pagar mientras verificamos la acreditación.'
    : payment === 'rejected' ? 'Podés retomar tu compra para consultar las opciones de pago disponibles.'
      : payment === 'cancelled' ? 'Podés retomar tu compra cuando quieras continuar.'
        : 'Se registró el reintegro o la reversión de tu pago. Si necesitás coordinar una devolución, contactanos.');
  expect(screen.getByRole('heading', { name: title })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '¡Compra confirmada!' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Enviar mensaje por WhatsApp' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Retomar mi compra' }) !== null).toBe(canResume);
  expect(doubles.clear).not.toHaveBeenCalled();
  expect(doubles.forget).not.toHaveBeenCalled();
});

it('un retorno sin pedido identificable no anuncia aprobación ni consulta un token inventado', async () => {
  window.history.replaceState(null, '', '/pago/exito?status=approved');
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo identificar el pedido');
  expect(screen.queryByRole('heading', { name: '¡Compra confirmada!' })).not.toBeInTheDocument();
  expect(doubles.status).not.toHaveBeenCalled();
  expect(doubles.clear).not.toHaveBeenCalled();
});

it('muestra el cobro recibido con incidencia y no lo oculta si falla una consulta posterior', async () => {
  doubles.status.mockResolvedValueOnce({ ...base, payment: { status: 'approved', requiresReview: true, updatedAt: base.updatedAt } })
    .mockRejectedValueOnce(new Error('La consulta no está disponible.'));
  render(<PaymentReturnPage expected="failure" navigate={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Recibimos tu pago' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('No vuelvas a pagar');
  expect(screen.queryByRole('heading', { name: '¡Compra confirmada!' })).not.toBeInTheDocument();
  expect(screen.queryByText('Pronto nos pondremos en contacto para coordinar la entrega.')).not.toBeInTheDocument();
  expect(doubles.clear).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar verificación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Tu pedido está en revisión. No vuelvas a pagar.');
  expect(screen.getByRole('heading', { name: 'Recibimos tu pago' })).toBeVisible();
});

it('una aprobación sin evidencia financiera no anuncia pago ni vacía el carrito', async () => {
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'none', requiresReview: false, updatedAt: null } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Pago no confirmado' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Todavía no recibimos la confirmación de tu pago');
  expect(doubles.clear).not.toHaveBeenCalled();
});

it('rechaza un estado financiero mal formado antes de usarlo para limpiar el carrito', async () => {
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'approved', requiresReview: 'false', updatedAt: null } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar tu compra');
  expect(doubles.clear).not.toHaveBeenCalled();
});
