import { fireEvent, render, screen } from '@testing-library/react';

import { AddToCartButton } from './AddToCartButton';
import { CartProvider, useCart } from './CartContext';

const { product, trackAnalyticsEvent } = vi.hoisted(() => ({
  product: Object.freeze({
    id: 'producto-controlado',
    slug: 'producto-controlado',
    path: '/producto-controlado/',
    name: 'Producto controlado',
    categorySlugs: Object.freeze([]),
    categoryNames: Object.freeze([]),
    price: Object.freeze({ amount: 1_000, currency: 'ARS' as const }),
    availability: 'available' as const,
    stockQuantity: 2,
  }),
  trackAnalyticsEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../analytics/client', () => ({ trackAnalyticsEvent }));
vi.mock('../data/runtime-catalog', () => ({
  useRuntimeCatalogProducts: () => [product],
}));

describe('AddToCartButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    trackAnalyticsEvent.mockClear();
  });

  it('confirma visualmente cada agregado y deshabilita el CTA al alcanzar el stock real', () => {
    render(
      <CartProvider>
        <AddToCartButton
          className="button"
          product={product}
          productNamedLabel
        />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Agregar Producto controlado al carrito',
    }));

    expect(screen.getByText('Producto controlado: 1 unidad en el carrito.')).toBeVisible();
    expect(liveRegion()).toHaveTextContent(
      'Producto controlado se agregó al carrito. Ahora hay 1 unidad de este producto.',
    );
    expect(trackAnalyticsEvent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', {
      name: 'Agregar otra unidad de Producto controlado al carrito',
    }));

    const maximumButton = screen.getByRole('button', {
      name: 'Producto controlado: máximo de 2 unidades en el carrito',
    });
    expect(maximumButton).toBeDisabled();
    expect(maximumButton).toHaveTextContent('Máximo en el carrito');
    expect(screen.getByText(
      'Producto controlado: 2 unidades en el carrito. Alcanzaste el máximo disponible.',
    )).toBeVisible();
    expect(liveRegion()).toHaveTextContent(
      'Producto controlado se agregó al carrito. Ahora hay 2 unidades de este producto.',
    );

    fireEvent.click(maximumButton);
    expect(trackAnalyticsEvent).toHaveBeenCalledTimes(2);
  });

  it('reemplaza el contenido de la región viva para repetir un mismo anuncio', () => {
    render(
      <CartProvider>
        <FeedbackHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Agregar Producto controlado al carrito',
    }));
    const firstAnnouncement = liveRegion().firstElementChild;
    expect(firstAnnouncement).toHaveTextContent(
      'Producto controlado se agregó al carrito. Ahora hay 1 unidad de este producto.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar producto de prueba' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Agregar Producto controlado al carrito',
    }));

    const repeatedAnnouncement = liveRegion().firstElementChild;
    expect(repeatedAnnouncement).not.toBe(firstAnnouncement);
    expect(repeatedAnnouncement).toHaveTextContent(
      'Producto controlado se agregó al carrito. Ahora hay 1 unidad de este producto.',
    );
  });
});

function FeedbackHarness() {
  const { remove } = useCart();

  return (
    <>
      <AddToCartButton
        className="button"
        product={product}
        productNamedLabel
      />
      <button type="button" onClick={() => remove(product.id)}>
        Eliminar producto de prueba
      </button>
    </>
  );
}

function liveRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]');
  if (region === null) throw new Error('No se encontró la región viva del carrito.');
  return region;
}
