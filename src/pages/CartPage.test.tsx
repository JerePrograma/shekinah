import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CartProvider } from '../cart/CartContext';
import { CART_STORAGE_KEY } from '../cart/model';
import { CartPage } from './CartPage';

const { commerceState, createCheckoutPreference, product, trackAnalyticsEvent } = vi.hoisted(() => ({
  commerceState: { enabled: false },
  createCheckoutPreference: vi.fn(),
  product: Object.freeze({
    id: 'producto-carrito',
    slug: 'producto-carrito',
    path: '/producto-carrito/',
    name: 'Producto del carrito',
    categorySlugs: Object.freeze([]),
    categoryNames: Object.freeze([]),
    presentation: '100 g',
    price: Object.freeze({ amount: 1_000, currency: 'ARS' as const }),
    availability: 'available' as const,
    stockQuantity: 3,
  }),
  trackAnalyticsEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../analytics/client', () => ({ trackAnalyticsEvent }));
vi.mock('../data/runtime-catalog', () => ({
  useRuntimeCatalogProducts: () => [product],
}));
vi.mock('../commerce/env', () => ({
  getAuthorizedMercadoPagoPaymentLink: () => null,
  getAuthorizedWhatsappNumber: () => '5492236216559',
  isCommerceClientEnabled: () => commerceState.enabled,
}));
vi.mock('../commerce/api', () => ({ createCheckoutPreference }));
vi.mock('../commerce/checkout-session', () => ({
  getOrCreateCheckoutIdempotencyKey: () => Promise.resolve('checkout-test-key'),
  rememberCheckoutOrder: vi.fn(),
}));

const openMock = vi.fn();

describe('CartPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      version: 1,
      items: [{ productId: product.id, quantity: 1 }],
      updatedAt: '2026-08-12T00:00:00.000Z',
    }));
    trackAnalyticsEvent.mockClear();
    createCheckoutPreference.mockReset();
    commerceState.enabled = false;
    openMock.mockClear();
    vi.stubGlobal('open', openMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rechaza cero sin borrar silenciosamente y permite ajustar dentro del stock', () => {
    renderCart();
    const quantity = screen.getByRole('spinbutton', { name: `Cantidad de ${product.name}` });

    fireEvent.change(quantity, { target: { value: '0' } });

    expect(screen.getByText(/Para quitar el producto, usá Eliminar/u)).toBeVisible();
    expect(screen.getByRole('heading', { name: product.name })).toBeVisible();
    expect(screen.getByText('1 unidad en el carrito.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: `Aumentar cantidad de ${product.name}` }));
    expect(quantity).toHaveValue(2);
    expect(screen.getByText('2 unidades en el carrito.')).toBeVisible();
  });

  it('confirma el vaciado con contexto, Escape cancela y el resultado queda explícito', async () => {
    renderCart();
    const clearButton = screen.getByRole('button', { name: 'Vaciar carrito' });

    fireEvent.click(clearButton);
    const dialog = screen.getByRole('alertdialog', { name: 'Vaciar el carrito' });
    expect(dialog).toHaveTextContent('Se eliminarán 1 unidad');
    expect(screen.getByRole('button', { name: 'Seguir con el carrito' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(clearButton).toHaveFocus();

    fireEvent.click(clearButton);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, vaciar carrito' }));
    expect(screen.getByRole('heading', { name: 'El carrito está vacío' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'El carrito está vacío' })).toHaveFocus();
    });
  });

  it('no descarta silenciosamente datos de entrega incompletos al abrir WhatsApp', () => {
    renderCart();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre completo' }), {
      target: { value: 'Ana' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar carrito por WhatsApp' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completá o corregí los datos de entrega antes de enviarlos por WhatsApp.',
    );
    expect(screen.getByRole('textbox', { name: /^Celular/u })).toHaveFocus();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('conserva una modalidad de entrega cambiada hasta completar sus datos', () => {
    renderCart();
    fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad' }), {
      target: { value: 'correo_argentino' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar carrito por WhatsApp' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completá o corregí los datos de entrega antes de enviarlos por WhatsApp.',
    );
    expect(screen.getByRole('textbox', { name: /^Nombre completo/u })).toHaveFocus();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('bloquea duplicados y cambios del carrito mientras prepara el checkout', async () => {
    commerceState.enabled = true;
    let rejectCheckout: ((reason: Error) => void) | undefined;
    createCheckoutPreference.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectCheckout = reject;
    }));
    renderCart();
    fillFulfillment();

    const checkout = screen.getByRole('button', { name: 'Pagar con Mercado Pago' });
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }));
    expect(screen.getByRole('alertdialog', { name: 'Vaciar el carrito' })).toBeVisible();
    fireEvent.click(checkout);
    fireEvent.click(checkout);

    expect(screen.queryByRole('alertdialog', { name: 'Vaciar el carrito' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparando pago…' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: `Cantidad de ${product.name}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Eliminar ${product.name} del carrito` })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar carrito por WhatsApp' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cuando esté listo, te redirigiremos a Mercado Pago.',
    );
    await waitFor(() => expect(createCheckoutPreference).toHaveBeenCalledTimes(1));

    await act(async () => {
      rejectCheckout?.(new Error('Mercado Pago no respondió. Intentá nuevamente.'));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Mercado Pago no respondió. Intentá nuevamente.',
    );
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: `Cantidad de ${product.name}` })).toBeEnabled();
  });
});

function renderCart() {
  return render(
    <CartProvider>
      <CartPage navigate={vi.fn()} />
    </CartProvider>,
  );
}

function fillFulfillment() {
  const values: readonly [string, string][] = [
    ['Nombre completo', 'Cliente de prueba'],
    ['Celular', '5491100000000'],
    ['Dirección', 'Calle de prueba 123'],
    ['Localidad', 'Mar del Plata'],
    ['Provincia', 'Buenos Aires'],
    ['Código postal', 'B7600'],
  ];
  for (const [name, value] of values) {
    fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
  }
}
