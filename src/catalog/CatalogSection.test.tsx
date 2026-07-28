import { fireEvent, render, screen, within } from '@testing-library/react';

import { catalogProductFixtures } from '../test/fixtures/catalog-products';
import { CatalogSection } from './CatalogSection';

describe('CatalogSection', () => {
  it('muestra un estado vacío sin controles inútiles', () => {
    render(<CatalogSection products={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Todavía no hay productos publicados',
    );
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(document.querySelector('[data-product]')).not.toBeInTheDocument();
  });

  it('renderiza tarjetas sin imágenes ni precios inventados', () => {
    render(<CatalogSection products={catalogProductFixtures} />);

    expect(document.querySelectorAll('[data-product]')).toHaveLength(2);
    expect(document.querySelector('.catalog-grid img')).not.toBeInTheDocument();

    const mentaCard = screen.getByRole('heading', { name: 'Menta seca' }).closest('article');
    const pimentonCard = screen
      .getByRole('heading', { name: 'Pimentón dulce' })
      .closest('article');

    expect(mentaCard).not.toBeNull();
    expect(pimentonCard).not.toBeNull();

    expect(within(mentaCard as HTMLElement).queryByText('Precio')).not.toBeInTheDocument();
    expect(within(pimentonCard as HTMLElement).getByText('Precio')).toBeVisible();
  });

  it('filtra por búsqueda normalizada y categoría', () => {
    render(<CatalogSection products={catalogProductFixtures} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '  PIMENTON  ' },
    });

    expect(screen.getByRole('heading', { name: 'Pimentón dulce' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Menta seca' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Hierbas' },
    });

    expect(screen.getByRole('heading', { name: 'Menta seca' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Pimentón dulce' })).not.toBeInTheDocument();
  });

  it('informa cuando una combinación no produce resultados', () => {
    render(<CatalogSection products={catalogProductFixtures} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'menta' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Especias' },
    });

    expect(screen.getByText('No se encontraron productos')).toBeVisible();
    expect(document.querySelector('[data-product]')).not.toBeInTheDocument();
  });
});
