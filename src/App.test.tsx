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

const forbiddenPublicCopy = [
  'Información comercial capturada el 23/07/2026',
  'Los precios y la disponibilidad no se actualizan en tiempo real',
  'La información reproduce el catálogo comercial recuperado',
  'Precio registrado',
  'Precio promocional registrado',
  'Disponibilidad registrada',
  'Datos comerciales capturados',
  'Variantes registradas',
  'productos registrados en esta categoría',
  'Ver el enfoque',
  'Diseñado para orientarte con facilidad',
  'Orientación inmediata',
  'Contenido verificable',
  'Experiencia adaptable',
] as const;

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('muestra la portada comercial y navega al catálogo completo', () => {
    render(<App />);

    expect(document.title).toBe('Shekinah | Hierbas y especias');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sabores naturales para todos los días.' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nuestros productos.' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('510 productos encontrados');
    expect(document.querySelectorAll('[data-product]')).toHaveLength(24);

    const mainNavigation = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    expect(within(mainNavigation).getAllByRole('link').map(({ textContent }) => textContent)).toEqual([
      'Inicio',
      'Catálogo',
    ]);
    expect(screen.queryByRole('link', { name: 'Enfoque' })).not.toBeInTheDocument();

    const catalogAction = screen.getByRole('link', { name: 'Ver catálogo' });
    fireEvent.click(catalogAction);

    expect(window.location.pathname).toBe('/catalogo');
    expect(document.title).toBe('Catálogo | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nuestros productos.' }),
    ).toBeVisible();
    expect(authorizedProducts).toHaveLength(510);
    expect(authorizedCategories).toHaveLength(16);
    expect(authorizedContact).toBeNull();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
  });

  it('carga una ficha comercial con detalle diferido y texto seguro', async () => {
    window.history.replaceState(null, '', '/guayaba/');
    render(<App />);

    expect(document.title).toBe('Guayaba hojas x 50 gr | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Guayaba hojas x 50 gr' }),
    ).toBeVisible();
    expect(screen.getByText('Precio', { exact: true })).toBeVisible();
    expect(screen.getByText('Disponibilidad', { exact: true })).toBeVisible();
    expect(screen.queryByText('23/07/2026')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Descripción' }),
    ).toBeVisible();
    expect(document.querySelector('[dangerouslySetInnerHTML]')).not.toBeInTheDocument();
  });

  it('conserva el producto sin imagen y el producto sin descripción', async () => {
    window.history.replaceState(null, '', '/caldo-sin-sal-en-polvo/');
    const { unmount } = render(<App />);

    expect(screen.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Caldo sin sal en polvo' }),
    ).toBeVisible();
    unmount();

    window.history.replaceState(null, '', '/pomelo-deshidratado-x-250-gr/');
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText('Cargando información detallada…')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Descripción' })).not.toBeInTheDocument();
  });

  it('resuelve una categoría como catálogo filtrado', () => {
    window.history.replaceState(null, '', '/tienda/categoria/hierbas-medicinales/');
    render(<App />);

    expect(document.title).toBe('Hierbas Medicinales | Catálogo Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hierbas Medicinales' }),
    ).toBeVisible();
    expect(screen.getByText('205 productos en esta categoría.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('205 productos encontrados');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Catálogo' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('mantiene privacidad en lenguaje comercial normal y ausencia de contacto', () => {
    window.history.replaceState(null, '', '/privacidad');
    render(<App />);

    expect(document.title).toBe('Privacidad | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacidad.' }),
    ).toBeVisible();
    expect(screen.getByText(/no utilizamos analítica, publicidad ni rastreadores/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('resuelve /enfoque como una vista 404 normal', () => {
    window.history.replaceState(null, '', '/enfoque');
    render(<App />);

    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(screen.getByText('/enfoque')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Enfoque' })).not.toBeInTheDocument();
  });

  it('no renderiza ninguna frase retirada en la portada y el catálogo', () => {
    render(<App />);

    for (const text of forbiddenPublicCopy) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
  });

  it('resuelve una ruta desconocida con una vista 404 accesible', () => {
    window.history.replaceState(null, '', '/ruta-inexistente');
    render(<App />);

    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(screen.getByText('/ruta-inexistente')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
