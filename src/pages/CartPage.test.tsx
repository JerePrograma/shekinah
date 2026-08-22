import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CartProvider } from '../cart/CartContext';
import { CART_STORAGE_KEY } from '../cart/model';
import { CartPage } from './CartPage';

const {
  commerceState,
  createCheckoutPreference,
  createWhatsappOrder,
  getOrCreateWhatsappOrderIdempotencyKey,
  product,
  refreshRuntimeCatalog,
  trackAnalyticsEvent,
} = vi.hoisted(() => ({
  commerceState: { enabled: false },
  createCheckoutPreference: vi.fn(),
  createWhatsappOrder: vi.fn(),
  getOrCreateWhatsappOrderIdempotencyKey: vi.fn(() => Promise.resolve('whatsapp-test-key')),
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
  refreshRuntimeCatalog: vi.fn(),
  trackAnalyticsEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../analytics/client', () => ({ trackAnalyticsEvent }));
vi.mock('../data/runtime-catalog', () => ({
  refreshRuntimeCatalog,
  useRuntimeCatalogProducts: () => [product],
}));
vi.mock('../commerce/env', () => ({
  getAuthorizedMercadoPagoPaymentLink: () => null,
  getAuthorizedWhatsappNumber: () => '5492236216559',
  isCommerceClientEnabled: () => commerceState.enabled,
}));
vi.mock('../commerce/api', () => ({ createCheckoutPreference, createWhatsappOrder }));
vi.mock('../commerce/checkout-session', () => ({
  getOrCreateCheckoutIdempotencyKey: () => Promise.resolve('checkout-test-key'),
  getOrCreateWhatsappOrderIdempotencyKey,
  rememberCheckoutOrder: vi.fn(),
}));

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
    createWhatsappOrder.mockReset();
    getOrCreateWhatsappOrderIdempotencyKey.mockClear();
    refreshRuntimeCatalog.mockReset().mockResolvedValue([product]);
    commerceState.enabled = false;
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

    fireEvent.click(screen.getByRole('button', { name: 'Pedir por WhatsApp' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completá o corregí todos los datos antes de continuar por WhatsApp.',
    );
    expect(screen.getByRole('textbox', { name: /^Celular/u })).toHaveFocus();
    expect(createWhatsappOrder).not.toHaveBeenCalled();
  });

  it('conserva una modalidad de entrega cambiada hasta completar sus datos', () => {
    renderCart();
    fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad' }), {
      target: { value: 'correo_argentino' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pedir por WhatsApp' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Completá o corregí todos los datos antes de continuar por WhatsApp.',
    );
    expect(screen.getByRole('textbox', { name: /^Nombre completo/u })).toHaveFocus();
    expect(createWhatsappOrder).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeDisabled();
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

  it('mantiene WhatsApp disponible si Mercado Pago rechaza el inicio', async () => {
    commerceState.enabled = true;
    createCheckoutPreference.mockRejectedValueOnce(new Error('Mercado Pago no pudo iniciar el pago.'));
    renderCart();
    fillFulfillment();

    fireEvent.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mercado Pago no pudo iniciar el pago.',
    );
    expect(screen.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeEnabled();
  });

  it('registra una sola vez antes de ofrecer WhatsApp y usa el snapshot autoritativo', async () => {
    let resolveOrder: ((value: ReturnType<typeof whatsappOrderFixture>) => void) | undefined;
    createWhatsappOrder.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOrder = resolve;
    }));
    renderCart();
    fillFulfillment();

    const createOrder = screen.getByRole('button', { name: 'Pedir por WhatsApp' });
    fireEvent.click(createOrder);
    fireEvent.click(createOrder);

    expect(screen.getByRole('button', { name: 'Creando pedido…' })).toBeDisabled();
    expect(screen.getByText(/registrando el pedido y reservando las unidades/u)).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: `Cantidad de ${product.name}` })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Abrir WhatsApp' })).not.toBeInTheDocument();
    expect(trackAnalyticsEvent).not.toHaveBeenCalledWith('whatsapp_open', expect.anything());
    await waitFor(() => expect(createWhatsappOrder).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveOrder?.(whatsappOrderFixture());
      await Promise.resolve();
    });

    const resultTitle = screen.getByRole('heading', { name: 'Pedido registrado' });
    expect(resultTitle).toBeVisible();
    await waitFor(() => expect(resultTitle).toHaveFocus());
    expect(screen.getByText(/quedó pendiente de aprobación/u)).toHaveTextContent(
      whatsappOrderFixture().orderId,
    );
    expect(screen.getByRole('heading', { name: product.name })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pedir por WhatsApp' })).not.toBeInTheDocument();
    expect(getOrCreateWhatsappOrderIdempotencyKey).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ fullName: 'Cliente de prueba' }),
    );
    expect(createWhatsappOrder).toHaveBeenCalledWith(
      expect.any(Array),
      'whatsapp-test-key',
      expect.objectContaining({ fullName: 'Cliente de prueba' }),
    );
    expect(refreshRuntimeCatalog).toHaveBeenCalledTimes(1);
    expect(trackAnalyticsEvent).not.toHaveBeenCalledWith('whatsapp_open', expect.anything());

    const whatsappLink = screen.getByRole('link', { name: 'Abrir WhatsApp' });
    const href = whatsappLink.getAttribute('href');
    expect(href).not.toBeNull();
    const message = new URL(href ?? '').searchParams.get('text');
    expect(message).toContain(whatsappOrderFixture().orderId);
    expect(message).toContain('Nombre autoritativo');
    expect(message).toContain('Total registrado');
    whatsappLink.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(whatsappLink);
    expect(trackAnalyticsEvent).toHaveBeenCalledWith('whatsapp_open', { path: '/carrito' });

    fireEvent.click(screen.getByRole('button', {
      name: `Aumentar cantidad de ${product.name}`,
    }));
    expect(screen.queryByRole('heading', { name: 'Pedido registrado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeEnabled();
    expect(screen.getByText('2 unidades en el carrito.')).toBeVisible();
  });

  it('conserva carrito y no ofrece WhatsApp cuando el servidor rechaza la reserva', async () => {
    createWhatsappOrder.mockRejectedValueOnce(
      new Error('Algunos productos ya no tienen la cantidad solicitada.'),
    );
    renderCart();
    fillFulfillment();

    fireEvent.click(screen.getByRole('button', { name: 'Pedir por WhatsApp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algunos productos ya no tienen la cantidad solicitada.',
    );
    expect(screen.getByRole('button', { name: 'Pedir por WhatsApp' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: product.name })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Abrir WhatsApp' })).not.toBeInTheDocument();
    expect(trackAnalyticsEvent).not.toHaveBeenCalledWith('whatsapp_open', expect.anything());
    expect(refreshRuntimeCatalog).not.toHaveBeenCalled();
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

function whatsappOrderFixture() {
  return {
    orderId: `ord_${'w'.repeat(24)}`,
    status: 'pending' as const,
    currency: 'ARS' as const,
    totalMinor: 100_000,
    itemCount: 1,
    createdAt: '2026-08-12T12:00:00.000Z',
    items: [{
      productId: product.id,
      name: 'Nombre autoritativo',
      presentation: '100 g',
      quantity: 1,
      unitPriceMinor: 100_000,
      subtotalMinor: 100_000,
    }],
  };
}
