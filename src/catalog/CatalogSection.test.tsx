import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';

import { CartProvider } from '../cart/CartContext';
import { authorizedProducts } from '../data/authorized-commercial-data';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';
import { catalogProductFixtures } from '../test/fixtures/catalog-products';
import { CatalogSection } from './CatalogSection';

function renderCatalog(element: ReactElement) {
  return render(<CartProvider>{element}</CartProvider>);
}

describe('CatalogSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('informa 510 resultados y renderiza sólo la primera página de 24', () => {
    renderCatalog(
      <CatalogSection
        navigate={vi.fn()}
        products={authorizedProducts}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('510 productos encontrados. Página 1 de 22.');
    expect(document.querySelectorAll('[data-product]')).toHaveLength(24);
    expect(screen.getByText('Página 1 de 22')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    expect(document.querySelector('.catalog-notices')).not.toBeInTheDocument();
  });

  it('renderiza imagen local, ausencia de imagen y acceso a la ficha', () => {
    const navigate = vi.fn();
    renderCatalog(<CatalogSection navigate={navigate} products={catalogProductFixtures} />);

    expect(screen.getByRole('img', { name: 'Pimentón dulce' })).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(screen.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();

    const productLink = screen.getByRole('link', { name: 'Pimentón dulce' });
    expect(productLink).toHaveAttribute('href', '/pimenton-dulce/');
    fireEvent.click(productLink);
    expect(navigate).toHaveBeenCalledWith('/pimenton-dulce/');
  });

  it('filtra por búsqueda normalizada y categoría', () => {
    renderCatalog(<CatalogSection navigate={vi.fn()} products={catalogProductFixtures} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '  PIMENTON  ' },
    });
    expect(screen.getByRole('heading', { name: 'Pimentón dulce' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Menta seca' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hierbas' } });
    expect(screen.getByRole('heading', { name: 'Menta seca' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pimentón dulce' })).not.toBeInTheDocument();
  });

  it('reinicia la página cuando cambia la búsqueda', () => {
    const products = Array.from({ length: 30 }, (_, index) => ({
      ...catalogProductFixtures[0]!,
      id: `menta-${index}`,
      slug: `menta-${index}`,
      path: `/menta-${index}/`,
      name: `Menta ${index}`,
    }));
    renderCatalog(<CatalogSection navigate={vi.fn()} products={products} />);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 2')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Página 2 de 2');
    expect(screen.getByRole('link', { name: 'Menta 24' })).toHaveFocus();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'menta 1' } });
    expect(screen.getByText('Página 1 de 1')).toBeVisible();
  });

  it('mantiene fija la categoría de una ruta pública', () => {
    renderCatalog(
      <CatalogSection
        fixedCategorySlug="especias"
        headingLevel={1}
        navigate={vi.fn()}
        products={catalogProductFixtures}
        title="Especias"
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Especias' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 producto encontrado');
    const card = screen.getByRole('heading', { name: 'Pimentón dulce' }).closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('Precio')).toBeVisible();
    expect(within(card as HTMLElement).queryByText('Precio registrado')).not.toBeInTheDocument();
  });

  it('anuncia una combinación sin resultados', () => {
    renderCatalog(<CatalogSection navigate={vi.fn()} products={catalogProductFixtures} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'menta' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'especias' } });

    expect(screen.getByText('No se encontraron productos')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('0 productos encontrados');
    expect(document.querySelector('[data-product]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda y categoría' }));
    expect(screen.getByRole('heading', { name: 'Menta seca' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pimentón dulce' })).toBeVisible();
  });

  it('distingue un catálogo realmente vacío de filtros sin coincidencias', () => {
    renderCatalog(<CatalogSection navigate={vi.fn()} products={[]} />);

    expect(screen.getByRole('heading', { name: 'No hay productos disponibles' })).toBeVisible();
    expect(screen.getByText('El catálogo no tiene productos disponibles en este momento.'))
      .toBeVisible();
    expect(screen.queryByRole('button', { name: /Limpiar/u })).not.toBeInTheDocument();
  });

  it('muestra en la tarjeta la cantidad agregada tras confirmar el catálogo runtime', async () => {
    const product = {
      ...authorizedProducts[0]!,
      availability: 'available' as const,
      commerce: {
        source: 'dux' as const,
        catalogVersion: 'd'.repeat(64),
        syncedAt: '2026-09-01T12:00:00.000Z',
        availabilityState: 'verified' as const,
        checkoutEligible: true,
        mappingStatus: 'mapped' as const,
        quantitySemanticsStatus: 'verified' as const,
        observedStock: { real: 2, reserved: 0, available: 2 },
      },
    };
    const runtimeProducts = [product, ...authorizedProducts.slice(1)];
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      products: runtimeProducts,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await act(async () => {
      await refreshRuntimeCatalog();
    });
    renderCatalog(<CatalogSection navigate={vi.fn()} products={[product]} />);

    const card = document.querySelector<HTMLElement>(`[data-product="${product.slug}"]`);
    if (card === null) throw new Error('No se encontró la tarjeta del producto.');
    fireEvent.click(within(card).getByRole('button', {
      name: `Agregar ${product.name} al carrito`,
    }));

    expect(within(card).getByText(
      `${product.name}: 1 unidad en el carrito.`,
    )).toBeVisible();
    expect(within(card).getByRole('button', {
      name: `Agregar otra unidad de ${product.name} al carrito`,
    })).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
