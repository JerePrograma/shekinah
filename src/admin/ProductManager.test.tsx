import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { CatalogProductDetail } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { ProductManager } from './ProductManager';

describe('ABM de productos', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lista, busca, carga una edición y cancela el formulario', async () => {
    installCatalogApi([product('producto-uno', 'Producto uno')]);
    render(<ProductManager />);

    expect(await screen.findByText('Producto uno')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto para editar' }), {
      target: { value: 'no coincide' },
    });
    expect(screen.getByText('0 productos')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto para editar' }), {
      target: { value: 'producto uno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('textbox', { name: 'Slug / ID' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Producto uno');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar / nuevo' }));
    expect(screen.getByRole('textbox', { name: 'Slug / ID' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('');
  });

  it('crea, actualiza y elimina sin permitir doble submit', async () => {
    const api = installCatalogApi([product('producto-uno', 'Producto uno')]);
    render(<ProductManager />);
    expect(await screen.findByText('Producto uno')).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: 'Slug / ID' }), {
      target: { value: 'producto-nuevo' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Producto nuevo' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio ARS' }), {
      target: { value: '2500' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: category().name }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent('Producto creado.');
    expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(1);

    const createdRow = screen.getByText('Producto nuevo').closest('tr');
    if (createdRow === null) throw new Error('No se encontró el producto creado.');
    fireEvent.click(within(createdRow).getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio ARS' }), {
      target: { value: '2750' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Producto actualizado.');
    });
    expect(api.requests.filter(({ method }) => method === 'PUT')).toHaveLength(1);

    const updatedRow = screen.getByText('Producto nuevo').closest('tr');
    if (updatedRow === null) throw new Error('No se encontró el producto actualizado.');
    fireEvent.click(within(updatedRow).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Producto eliminado del catálogo.');
    });
    expect(screen.queryByText('Producto nuevo')).not.toBeInTheDocument();
    expect(api.requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1);
  });

  it('muestra errores de variantes y de la API sin persistir datos inválidos', async () => {
    const api = installCatalogApi([], true);
    render(<ProductManager />);
    await waitFor(() => expect(screen.queryByText('Cargando productos…')).not.toBeInTheDocument());

    fillRequiredProduct('producto-invalido');
    fireEvent.change(screen.getByRole('textbox', { name: 'Variantes (JSON)' }), {
      target: { value: '{' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Variantes:');
    expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Variantes (JSON)' }), {
      target: { value: '[]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La migración del catálogo administrativo todavía no fue aplicada.',
    );
  });
});

function fillRequiredProduct(id: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Slug / ID' }), {
    target: { value: id },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
    target: { value: `Producto ${id}` },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio ARS' }), {
    target: { value: '1000' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: category().name }));
}

function category() {
  const value = authorizedCategories[0];
  if (value === undefined) throw new Error('No existe una categoría para pruebas.');
  return value;
}

function product(id: string, name: string): CatalogProductDetail {
  const selectedCategory = category();
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name,
    categorySlugs: Object.freeze([selectedCategory.slug]),
    categoryNames: Object.freeze([selectedCategory.name]),
    presentation: '100 g',
    price: Object.freeze({ amount: 1_000, currency: 'ARS' }),
    availability: 'available',
    images: Object.freeze([]),
    variants: Object.freeze([]),
  });
}

function installCatalogApi(initial: readonly CatalogProductDetail[], failCreate = false) {
  let products = [...initial];
  const requests: Array<{ method: string; path: string }> = [];
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    requests.push({ method, path });
    if (path === '/api/catalog') {
      return Promise.resolve(json({ products }));
    }
    if (path === '/api/admin/products' && method === 'GET') {
      return Promise.resolve(json({ products }));
    }
    if (path === '/api/admin/products' && method === 'POST') {
      if (failCreate) {
        return Promise.resolve(json({
          error: {
            code: 'CATALOG_MIGRATION_REQUIRED',
            message: 'La migración del catálogo administrativo todavía no fue aplicada.',
          },
        }, 503));
      }
      const created = JSON.parse(readBody(init?.body)) as CatalogProductDetail;
      products = [...products, created];
      return Promise.resolve(json({ product: created }, 201));
    }
    const match = /^\/api\/admin\/products\/([^/]+)$/u.exec(path);
    const id = match?.[1];
    if (id !== undefined && method === 'PUT') {
      const updated = JSON.parse(readBody(init?.body)) as CatalogProductDetail;
      products = products.map((candidate) => candidate.id === id ? updated : candidate);
      return Promise.resolve(json({ product: updated }));
    }
    if (id !== undefined && method === 'DELETE') {
      products = products.filter((candidate) => candidate.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests };
}

function readBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') throw new Error('La prueba esperaba un cuerpo JSON.');
  return body;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
