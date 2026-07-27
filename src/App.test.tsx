import { render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  it('muestra la identidad mínima autorizada', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Shekinah' })).toBeVisible();
    expect(screen.getByText('Hierbas y especias')).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Shekinah, hierbas y especias' }),
    ).toHaveAttribute('src', '/assets/logo-shekinah.png');
  });
});
