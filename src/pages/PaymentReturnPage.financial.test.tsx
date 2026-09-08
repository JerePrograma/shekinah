import { fireEvent, render, screen } from '@testing-library/react';
import { PaymentReturnPage } from './PaymentReturnPage';

const doubles = vi.hoisted(() => ({ clear: vi.fn(), forget: vi.fn(), status: vi.fn() }));
vi.mock('../cart/CartContext', () => ({ useCart: () => ({ clear: doubles.clear, items: [] }) }));
vi.mock('../commerce/api', () => ({ getPublicOrderStatus: doubles.status }));
vi.mock('../commerce/checkout-session', () => ({
  clearRememberedCheckoutOrder: doubles.forget,
  readRememberedCheckoutOrder: () => null,
  shouldClearCartAfterApproval: () => true,
}));
const base = { status: 'pending', currency: 'ARS', totalMinor: 10000, itemCount: 1, updatedAt: '2026-09-08T12:00:00.000Z' };

beforeEach(() => {
  doubles.clear.mockReset(); doubles.forget.mockReset(); doubles.status.mockReset();
  window.history.replaceState(null, '', `/pago/pendiente?order=${'a'.repeat(64)}`);
});

it('muestra el cobro recibido con incidencia y no lo oculta si falla una consulta posterior', async () => {
  doubles.status.mockResolvedValueOnce({ ...base, payment: { status: 'approved', requiresReview: true, updatedAt: base.updatedAt } })
    .mockRejectedValueOnce(new Error('La consulta no está disponible.'));
  render(<PaymentReturnPage expected="failure" navigate={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Pago recibido. Pedido en revisión' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('No vuelvas a pagar');
  expect(doubles.clear).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar verificación' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El pago está registrado.');
  expect(screen.getByRole('heading', { name: 'Pago recibido. Pedido en revisión' })).toBeVisible();
});

it('una aprobación sin evidencia financiera no anuncia pago ni vacía el carrito', async () => {
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'none', requiresReview: false, updatedAt: null } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Pago no confirmado' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('no significa que esté pagado');
  expect(doubles.clear).not.toHaveBeenCalled();
});

it('rechaza un estado financiero mal formado antes de usarlo para limpiar el carrito', async () => {
  doubles.status.mockResolvedValue({ ...base, status: 'approved', payment: { status: 'approved', requiresReview: 'false', updatedAt: null } });
  render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('estado financiero inválido');
  expect(doubles.clear).not.toHaveBeenCalled();
});
