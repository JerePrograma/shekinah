import { fireEvent, render, screen, within } from '@testing-library/react';

import { App } from './App';
import {
  authorizedContact,
  authorizedProducts,
} from './data/authorized-commercial-data';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('muestra inicio y navega al catálogo mediante una ruta interna', () => {
    render(<App />);

    expect(document.title).toBe('Shekinah | Hierbas y especias');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Una experiencia simple para descubrir nuevos sabores.',
      }),
    ).toBeVisible();

    expect(
      screen.getByRole('img', { name: 'Shekinah, hierbas y especias' }),
    ).toHaveAttribute('src', '/assets/logo-shekinah.png');

    const mainNavigation = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });

    expect(within(mainNavigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(mainNavigation).getByRole('link', { name: 'Enfoque' })).toHaveAttribute(
      'href',
      '/enfoque',
    );
    const catalogLink = within(mainNavigation).getByRole('link', { name: 'Catálogo' });
    expect(catalogLink).toHaveAttribute('href', '/catalogo');

    fireEvent.click(catalogLink);

    expect(window.location.pathname).toBe('/catalogo');
    expect(document.title).toBe('Catálogo | Shekinah');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Información comercial en preparación.',
      }),
    ).toBeVisible();
    expect(catalogLink).toHaveAttribute('aria-current', 'page');

    expect(authorizedProducts).toHaveLength(0);
    expect(authorizedContact).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Todavía no hay productos publicados',
    );
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-product]')).not.toBeInTheDocument();
  });

  it('muestra la vista de privacidad sin afirmar recolección inexistente', () => {
    window.history.replaceState(null, '', '/privacidad');

    render(<App />);

    expect(document.title).toBe('Privacidad | Shekinah');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Privacidad clara, sin funciones ocultas.',
      }),
    ).toBeVisible();
    expect(screen.getByText(/No existen formularios, cuentas, carrito, pagos/i)).toBeVisible();
    expect(screen.getByText(/no integra analítica, publicidad, trackers/i)).toBeVisible();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('resuelve una ruta desconocida con una vista 404 accesible', () => {
    window.history.replaceState(null, '', '/ruta-inexistente');

    render(<App />);

    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(screen.getByText('/ruta-inexistente')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('mantiene el año dinámico en la navegación compartida', () => {
    render(<App />);

    expect(screen.getByText(`© ${new Date().getFullYear()} Shekinah.`)).toBeVisible();
  });
});
