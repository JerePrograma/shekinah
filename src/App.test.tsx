import { render, screen, within } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  it('muestra la estructura principal sin inventar información comercial', () => {
    render(<App />);

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
      '#inicio',
    );
    expect(within(mainNavigation).getByRole('link', { name: 'Enfoque' })).toHaveAttribute(
      'href',
      '#enfoque',
    );
    expect(within(mainNavigation).getByRole('link', { name: 'Catálogo' })).toHaveAttribute(
      'href',
      '#catalogo',
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Todavía no hay productos publicados',
    );
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-product]')).not.toBeInTheDocument();

    const internalLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
    expect(internalLinks.length).toBeGreaterThan(0);
    expect(
      internalLinks.every((link) => link.getAttribute('href')?.startsWith('#')),
    ).toBe(true);

    expect(screen.getByText(`© ${new Date().getFullYear()} Shekinah.`)).toBeVisible();
  });
});
