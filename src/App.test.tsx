import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import { App } from './App';
import { CartProvider } from './cart/CartContext';
import {
  authorizedCategories,
  authorizedContact,
  authorizedProducts,
} from './data/authorized-commercial-data';
import { refreshRuntimeCatalog } from './data/runtime-catalog';

const dynamicProduct = {
  id: 'producto-creado-desde-backoffice',
  slug: 'producto-creado-desde-backoffice',
  path: '/producto-creado-desde-backoffice/',
  name: 'Producto creado desde backoffice',
  categorySlugs: [authorizedCategories[0]?.slug ?? 'agroecologicos'],
  categoryNames: [authorizedCategories[0]?.name ?? 'Agroecologicos'],
  presentation: '100 g',
  price: { amount: 2_500, currency: 'ARS' as const },
  availability: 'available' as const,
  description: 'Detalle persistido en D1.',
  images: [],
  variants: [],
};

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

function renderApp() {
  return render(
    <CartProvider>
      <App />
    </CartProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mantiene el backoffice fuera del consentimiento analítico público', async () => {
    vi.stubEnv('VITE_ANALYTICS_ENABLED', 'true');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      authenticated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    window.history.replaceState(null, '', '/admin');

    renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: 'Acceso administrativo' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Analítica opcional' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar analítica' })).not.toBeInTheDocument();
  });

  it('confirma por API un slug dinámico antes de renderizar su ficha', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = requestUrl(input);
      if (path === '/api/catalog') {
        return Promise.resolve(new Response(JSON.stringify({
          products: [...authorizedProducts, dynamicProduct],
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (path.endsWith('/api/catalog/producto-creado-desde-backoffice')) {
        return Promise.resolve(new Response(JSON.stringify({ product: dynamicProduct }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/producto-creado-desde-backoffice/');
    const rendered = renderApp();

    expect(screen.getByRole('heading', { level: 1, name: 'Cargando producto…' })).toBeVisible();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Producto creado desde backoffice',
      }),
    ).toBeVisible();
    expect(document.title).toBe('Producto creado desde backoffice | Shekinah');
    expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([input]) =>
      requestUrl(input) === '/api/catalog')).toHaveLength(1);

    rendered.unmount();
    await restoreRuntimeCatalog();
  });

  it('convierte en 404 la URL de un producto canónico con tombstone runtime', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      products: authorizedProducts.filter(({ id }) => id !== 'guayaba'),
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await act(async () => {
      await refreshRuntimeCatalog();
    });
    window.history.replaceState(null, '', '/guayaba/');
    const rendered = renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(document.title).toBe('Página no encontrada | Shekinah');

    rendered.unmount();
    await restoreRuntimeCatalog();
  });

  it('muestra la portada, el carrito accesible y navega al catálogo completo', () => {
    renderApp();
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
    expect(within(mainNavigation).getAllByRole('link')).toHaveLength(3);
    expect(within(mainNavigation).getByRole('link', { name: 'Inicio' })).toBeVisible();
    expect(within(mainNavigation).getByRole('link', { name: 'Catálogo' })).toBeVisible();
    expect(
      within(mainNavigation).getByRole('link', { name: 'Carrito, 0 productos' }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Enfoque' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Ver catálogo' }));
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

  it('agrega un producto y actualiza contador y ruta del carrito', () => {
    renderApp();
    const firstCard = document.querySelector<HTMLElement>('[data-product]');
    if (firstCard === null) throw new Error('No se encontró una tarjeta de producto.');
    fireEvent.click(within(firstCard).getByRole('button', { name: /Agregar .* al carrito/u }));
    const cartLink = screen.getByRole('link', { name: 'Carrito, 1 producto' });
    expect(cartLink).toBeVisible();
    fireEvent.click(cartLink);
    expect(window.location.pathname).toBe('/carrito');
    expect(screen.getByRole('heading', { level: 1, name: 'Tu carrito.' })).toBeVisible();
    expect(screen.getByText('1 unidad en el carrito.')).toBeVisible();
  });

  it('carga una ficha comercial con detalle diferido y CTA de carrito', async () => {
    window.history.replaceState(null, '', '/guayaba/');
    renderApp();
    expect(document.title).toBe('Guayaba hojas x 50 gr | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Guayaba hojas x 50 gr' }),
    ).toBeVisible();
    expect(screen.getByText('Precio', { exact: true })).toBeVisible();
    expect(screen.getByText('Disponibilidad', { exact: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeVisible();
    expect(screen.queryByText('23/07/2026')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Descripción' }),
    ).toBeVisible();
    expect(document.querySelector('[dangerouslySetInnerHTML]')).not.toBeInTheDocument();
  });

  it('conserva el producto sin imagen y el producto sin descripción', async () => {
    window.history.replaceState(null, '', '/caldo-sin-sal-en-polvo/');
    const { unmount } = renderApp();
    expect(screen.getByRole('img', { name: 'Imagen no disponible' })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Caldo sin sal en polvo' }),
    ).toBeVisible();
    unmount();
    window.history.replaceState(null, '', '/pomelo-deshidratado-x-250-gr/');
    renderApp();
    await waitFor(() => {
      expect(screen.queryByText('Cargando información detallada…')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Descripción' })).not.toBeInTheDocument();
  });

  it('resuelve una categoría como catálogo filtrado', () => {
    window.history.replaceState(null, '', '/tienda/categoria/hierbas-medicinales/');
    renderApp();
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

  it('mantiene privacidad fiel al carrito, pagos y analítica consentida', () => {
    window.history.replaceState(null, '', '/privacidad');
    renderApp();
    expect(document.title).toBe('Privacidad | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacidad.' }),
    ).toBeVisible();
    expect(screen.getByText(/analítica first-party permanece inactiva hasta un consentimiento explícito/i)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Carrito y pagos' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Analítica first-party opcional' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /contacto/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('resuelve /enfoque como una vista 404 normal', () => {
    window.history.replaceState(null, '', '/enfoque');
    renderApp();
    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(screen.getByText('/enfoque')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Enfoque' })).not.toBeInTheDocument();
  });

  it('no renderiza frases retiradas y mantiene una 404 accesible', async () => {
    const { unmount } = renderApp();
    for (const text of forbiddenPublicCopy) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
    unmount();
    window.history.replaceState(null, '', '/ruta-inexistente');
    renderApp();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página no encontrada.' }),
    ).toBeVisible();
    expect(document.title).toBe('Página no encontrada | Shekinah');
    expect(screen.getByText('/ruta-inexistente')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

async function restoreRuntimeCatalog(): Promise<void> {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
    products: authorizedProducts,
  }), { status: 200, headers: { 'content-type': 'application/json' } })));
  await act(async () => {
    await refreshRuntimeCatalog();
    await refreshRuntimeCatalog();
  });
  vi.unstubAllGlobals();
}
