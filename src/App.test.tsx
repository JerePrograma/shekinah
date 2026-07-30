import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import { App } from './App';
import {
  authorizedCategories,
  authorizedContact,
  authorizedProducts,
} from './data/authorized-commercial-data';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('muestra inicio y navega al catálogo completo', () => {
    render(<App />);

    expect(document.title).toBe('Shekinah | Hierbas y especias');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Catálogo de productos.' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('510 productos encontrados');
    expect(document.querySelectorAll('[data-product]')).toHaveLength(24);

    const mainNavigation = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    const catalogLink = within(mainNavigation).getByRole('link', { name: 'Catálogo' });
    fireEvent.click(catalogLink);

    expect(window.location.pathname).toBe('/catalogo');
    expect(document.title).toBe('Catálogo | Shekinah');
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo de productos.' })).toBeVisible();
    expect(catalogLink).toHaveAttribute('aria-current', 'page');
    expect(authorizedProducts).toHaveLength(510);
    expect(authorizedCategories).toHaveLength(16);
    expect(authorizedContact).toBeNull();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
  });

  it('carga una ficha histórica con detalle diferido y texto seguro', async () => {
    window.history.replaceState(null, '', '/guayaba/');
    render(<App />);

    expect(document.title).toBe('Guayaba hojas x 50 gr | Shekinah');
    expect(screen.getByRole('heading', { level: 1, name: 'Guayaba hojas x 50 gr' })).toBeVisible();
    expect(screen.getByText('Precio registrado')).toBeVisible();
    expect(screen.getByText('Disponibilidad registrada')).toBeVisible();
    expect(screen.getByText('23/07/2026')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: 'Descripción' })).toBeVisible();
    expect(document.querySelector('[dangerouslySetInnerHTML]')).not.toBeInTheDocument();
  });

  it('conserva la ausencia histórica de imagen y descripción', async () => {
    window.history.replaceState(null, '', '/caldo-sin-sal-en-polvo/');
    const { unmount } = render(<App />);

    expect(screen.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Caldo sin sal en polvo' })).toBeVisible();
    unmount();

    window.history.replaceState(null, '', '/pomelo-deshidratado-x-250-gr/');
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText('Cargando información detallada…')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Descripción' })).not.toBeInTheDocument();
  });

  it('resuelve una categoría histórica como catálogo filtrado', () => {
    window.history.replaceState(null, '', '/tienda/categoria/hierbas-medicinales/');
    render(<App />);

    expect(document.title).toBe('Hierbas Medicinales | Catálogo Shekinah');
    expect(screen.getByRole('heading', { level: 1, name: 'Hierbas Medicinales' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('205 productos encontrados');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Catálogo' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('mantiene privacidad y ausencia de contacto', () => {
    window.history.replaceState(null, '', '/privacidad');
    render(<App />);

    expect(document.title).toBe('Privacidad | Shekinah');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacidad clara, sin funciones ocultas.' })).toBeVisible();
    expect(screen.getByText(/no integra analítica, publicidad, trackers/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('resuelve una ruta desconocida con una vista 404 accesible', () => {
    window.history.replaceState(null, '', '/ruta-inexistente');
    render(<App />);

    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' })).toBeVisible();
    expect(screen.getByText('/ruta-inexistente')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
