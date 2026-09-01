import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import type { CatalogProductDetail } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { ProductManager } from './ProductManager';

const LEGACY_IMAGE = `/images/original/catalog/${'a'.repeat(64)}.jpg`;
const MANAGED_IMAGE = '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.webp';

describe('gestión visual de productos', () => {
  beforeEach(() => {
    class TestURL extends URL {
      static override createObjectURL = vi.fn(() => 'blob:product-preview');
      static override revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', TestURL);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prioriza el listado, resume, busca y filtra estados reales', async () => {
    installCatalogApi([
      product('arnica', 'Árnica', { image: true, sku: 'HERB-1', commerce: duxCommerce(8) }),
      product('producto-sin-categoria', 'Producto sin categoría', {
        categorized: false,
        commerce: duxCommerce(0),
      }),
      product('producto-pausado', 'Producto pausado', { availability: 'unavailable' }),
    ]);
    render(<ProductManager />);

    expect(await screen.findByRole('heading', { level: 4, name: 'Árnica' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 3, name: 'Nuevo producto' })).not.toBeInTheDocument();
    expect(summaryValue('Productos')).toHaveTextContent('3');
    expect(summaryValue('Disponibles para venta')).toHaveTextContent('1');
    expect(summaryValue('Pausados manualmente')).toHaveTextContent('1');
    expect(summaryValue('Sin stock')).toHaveTextContent('1');
    expect(screen.getByRole('img', { name: 'Árnica' })).toHaveAttribute('src', LEGACY_IMAGE);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'arnica herb-1' },
    });
    expect(screen.getByRole('heading', { level: 4, name: 'Árnica' })).toBeVisible();
    expect(screen.queryByText('Producto pausado')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'uncategorized' },
    });
    expect(screen.getByRole('heading', { level: 4, name: 'Producto sin categoría' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 4, name: 'Árnica' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'out-of-stock' } });
    expect(screen.getByText(/Disponible Dux: 0/u, { selector: '.admin-status-badge' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 producto encontrado');

    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Editar Árnica' }));
    expect(screen.getByLabelText('Reemplazar imagen')).toBeDisabled();
    expect(screen.getByText(/cuando se configure el almacenamiento administrativo/iu)).toBeVisible();
  }, 10_000);

  it('distingue un error de carga del catálogo del estado vacío y permite reintentar', async () => {
    installCatalogApi([product('recuperado', 'Producto recuperado')], { failListOnce: true });
    render(<ProductManager />);

    expect(await screen.findByRole('heading', { name: 'No pudimos cargar los productos' }))
      .toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Catálogo temporalmente no disponible.');
    expect(screen.getByText('0 productos encontrados')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));

    expect(await screen.findByRole('heading', { level: 4, name: 'Producto recuperado' }))
      .toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No pudimos cargar los productos' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeEnabled();
  });

  it('crea con slug automático y categorías múltiples sin enviar stock ni duplicar el submit', async () => {
    const api = installCatalogApi([], { deferCreate: true, imageStorageConfigured: true });
    render(<ProductManager />);
    await screen.findByRole('heading', { name: 'No hay productos cargados' });
    expect(screen.getByRole('heading', { name: 'No hay productos cargados' })).toBeVisible();
    expect(screen.getByText('Usá Nuevo producto para cargar el primero.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Té Verde Especial' },
    });
    expect(screen.getByText('Dirección pública: /te-verde-especial/')).toBeVisible();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio en pesos' }), {
      target: { value: '2500.50' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: category().name }));
    expect(screen.getByText(/Shekinah no guarda ni permite editar stock físico/iu)).toBeVisible();
    expect(screen.queryByRole('spinbutton', { name: 'Stock físico' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Opciones avanzadas'));
    const slug = screen.getByRole('textbox', { name: 'Identificador y dirección pública' });

    const submit = screen.getByRole('button', { name: 'Crear producto' });
    const form = submit.closest('form');
    if (form === null) throw new Error('No se encontró el formulario de producto.');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(slug).toBeDisabled();
    expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(1);
    api.releaseCreate();

    expect(await screen.findByText('Producto creado correctamente.')).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Editar Té Verde Especial' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Té Verde Especial');
    expect(screen.getByText('Todos los cambios están guardados.')).toBeVisible();
    const created = api.products().find(({ id }) => id === 'te-verde-especial');
    expect(created).toMatchObject({ price: { amount: 2500.5 } });
    expect(created).not.toHaveProperty('stockQuantity');
  });

  it('expone dirty y operación activa al shell y limpia el estado al desmontar', async () => {
    const api = installCatalogApi([], { deferCreate: true });
    const onInteractionStateChange = vi.fn();
    const { unmount } = render(
      <ProductManager onInteractionStateChange={onInteractionStateChange} />,
    );
    await screen.findByRole('heading', { name: 'No hay productos cargados' });
    expect(onInteractionStateChange).toHaveBeenLastCalledWith({ dirty: false, busy: false });

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Producto para estado del shell' },
    });
    expect(onInteractionStateChange).toHaveBeenLastCalledWith({ dirty: true, busy: false });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio en pesos' }), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: category().name }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(onInteractionStateChange).toHaveBeenLastCalledWith({
      dirty: true,
      busy: true,
      operationLabel: 'Guardando producto',
    });

    api.releaseCreate();
    expect(await screen.findByText('Producto creado correctamente.')).toBeVisible();
    await waitFor(() => {
      expect(onInteractionStateChange).toHaveBeenLastCalledWith({ dirty: false, busy: false });
    });
    unmount();
    expect(onInteractionStateChange).toHaveBeenLastCalledWith({ dirty: false, busy: false });
  });

  it('permite editar un legacy sin categorías y protege cambios sin guardar', async () => {
    const api = installCatalogApi([
      product('legacy-sin-categoria', 'Legacy sin categoría', { categorized: false }),
      product('segundo', 'Segundo producto'),
    ]);
    render(<ProductManager />);
    await screen.findByRole('heading', { level: 4, name: 'Legacy sin categoría' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Legacy sin categoría' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados correctamente.')).toBeVisible();
    expect(api.requests.filter(({ method }) => method === 'PUT')).toHaveLength(1);

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Legacy modificado' },
    });
    expect(screen.getByRole('button', {
      name: 'Quitar Legacy sin categoría del catálogo',
    })).toBeDisabled();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Segundo producto' }));
    const editSecondProduct = screen.getByRole('button', { name: 'Editar Segundo producto' });
    const discardDialog = screen.getByRole('dialog', { name: 'Hay cambios sin guardar' });
    expect(discardDialog).toBeVisible();
    expect(discardDialog).toHaveAccessibleDescription(
      'Si continuás, se perderán los cambios de este editor.',
    );
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    fireEvent.keyDown(discardDialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Hay cambios sin guardar' })).not.toBeInTheDocument();
    expect(editSecondProduct).toHaveFocus();

    fireEvent.click(editSecondProduct);
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Legacy modificado');
    expect(editSecondProduct).toHaveFocus();

    fireEvent.click(editSecondProduct);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Editar Segundo producto' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Editar Segundo producto' })).toHaveFocus();
  });

  it('no expone ningún control de stock en el editor de altas', async () => {
    installCatalogApi([]);
    render(<ProductManager />);
    await screen.findByRole('heading', { name: 'No hay productos cargados' });

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    expect(screen.getByText(/Inventario: Dux/iu)).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Controlar stock/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Stock físico' })).not.toBeInTheDocument();
  });

  it('no expone ajuste rápido aunque el producto todavía no tenga snapshot', async () => {
    const api = installCatalogApi([product('sin-control', 'Sin control de stock')]);
    render(<ProductManager />);
    await screen.findByRole('heading', { level: 4, name: 'Sin control de stock' });

    expect(screen.queryByRole('button', { name: 'Ajustar stock de Sin control de stock' }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/Sin snapshot Dux verificable/iu, {
      selector: '.admin-status-badge',
    })).toBeVisible();
    expect(api.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(0);
    expect(api.products()[0]).not.toHaveProperty('stockQuantity');
  });

  it('valida precio y categoría antes de crear', async () => {
    const api = installCatalogApi([]);
    render(<ProductManager />);
    await screen.findByRole('heading', { name: 'No hay productos cargados' });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Producto inválido' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio en pesos' }), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(screen.getByText('Ingresá un importe mayor que cero.')).toBeVisible();
    expect(screen.getByText('Seleccioná al menos una categoría.')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: category().name })).toHaveFocus();
    expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(0);
  });

  it('abre opciones avanzadas y enfoca el identificador cuando es el primer error', async () => {
    const api = installCatalogApi([]);
    render(<ProductManager />);
    await screen.findByRole('heading', { name: 'No hay productos cargados' });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Producto válido' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Precio en pesos' }), {
      target: { value: '1000' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: category().name }));
    fireEvent.click(screen.getByText('Opciones avanzadas'));
    const slug = screen.getByRole('textbox', { name: 'Identificador y dirección pública' });
    fireEvent.change(slug, { target: { value: 'Identificador inválido' } });
    fireEvent.click(screen.getByText('Opciones avanzadas'));
    expect(slug).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(slug).toBeVisible();
    expect(slug).toHaveFocus();
    expect(screen.getByText('Usá letras minúsculas, números y guiones.')).toBeVisible();
    expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(0);
  });

  it('actualiza sólo la pausa editorial por PATCH tras confirmación del servidor', async () => {
    const api = installCatalogApi([
      product('producto-pausado', 'Producto pausado', {
        availability: 'unavailable',
        commerce: duxCommerce(6),
      }),
    ], { deferPatch: true });
    render(<ProductManager />);
    await screen.findByRole('heading', { level: 4, name: 'Producto pausado' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Producto pausado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar Producto pausado' }));
    expect(screen.getByText('No disponible manualmente', {
      selector: '.admin-status-badge',
    })).toBeVisible();
    expect(api.requests.filter(({ method }) => method === 'PATCH')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar editor' })).toBeDisabled();

    api.releasePatch();
    expect(await screen.findByText('Producto pausado quedó disponible para venta.')).toBeVisible();
    expect(screen.getByText('Disponible manualmente')).toBeVisible();
    expect(screen.getByText(/Disponible Dux: 6/u)).toBeVisible();
    expect(screen.queryByRole('spinbutton', { name: 'Stock físico' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toBeEnabled();
  });

  it('mantiene la imagen anterior y permite reintentar si el upload falla', async () => {
    const api = installCatalogApi([
      product('con-imagen', 'Producto con imagen', { image: true }),
    ], { failUpload: true, imageStorageConfigured: true });
    render(<ProductManager />);
    await screen.findByRole('heading', { level: 4, name: 'Producto con imagen' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar Producto con imagen' }));

    const invalid = new File(['texto'], 'malicioso.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('Reemplazar imagen'), {
      target: { files: [invalid] },
    });
    expect(screen.getByText('Seleccioná una imagen JPEG, PNG o WebP.')).toBeVisible();

    const valid = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'producto.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText('Reemplazar imagen'), {
      target: { files: [valid] },
    });
    expect(screen.getByText(/producto\.jpg/iu)).toBeVisible();
    expect(screen.getByRole('img', { name: 'Vista previa de Producto con imagen' })).toHaveAttribute(
      'src',
      'blob:product-preview',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Los datos del producto se guardaron, pero la imagen no pudo actualizarse.',
    );
    expect(api.products()[0]?.primaryImage?.src).toBe(LEGACY_IMAGE);
    expect(screen.getByText(/producto\.jpg/iu)).toBeVisible();
    expect(api.requests.some(({ path, method }) => path.endsWith('/image') && method === 'PUT')).toBe(true);
  });

  it('mantiene separada la pausa editorial del estado autoritativo Dux', async () => {
    installCatalogApi([
      product('pausado-sin-stock', 'Pausado sin stock', {
        availability: 'unavailable',
        commerce: duxCommerce(0),
      }),
    ]);
    render(<ProductManager />);
    const row = await screen.findByRole('article', { name: 'Pausado sin stock' });
    expect(row).toHaveTextContent('No disponible manualmente');
    expect(row).toHaveTextContent('Disponible Dux: 0');

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar Pausado sin stock' }));

    expect(await screen.findByText(
      'La disponibilidad manual de Pausado sin stock quedó activa, pero la venta sigue bloqueada hasta que Dux la verifique.',
    )).toBeVisible();
    expect(row).toHaveTextContent('Disponible manualmente');
    expect(row).toHaveTextContent('Disponible Dux: 0');
  });

  it('muestra el inventario Dux sin redondear y oculta el ajuste manual de stock', async () => {
    installCatalogApi([
      product('dux-vinculado', 'Producto Dux', {
        commerce: {
          source: 'dux',
          catalogVersion: 'd'.repeat(64),
          syncedAt: '2026-08-26T12:30:45.000Z',
          availabilityState: 'unavailable',
          checkoutEligible: false,
          mappingStatus: 'mapped',
          quantitySemanticsStatus: 'unavailable_from_v2_items',
          observedStock: { real: 738.5, reserved: 36.4, available: 702.1 },
          unit: { name: 'Kilogramo', symbol: 'kg' },
          depositName: 'Casa central',
        },
      }),
    ]);
    render(<ProductManager />);

    const row = await screen.findByRole('article', { name: 'Producto Dux' });
    expect(row).toHaveTextContent('Inventario: Dux');
    expect(row).toHaveTextContent('Vínculo: Vinculado');
    expect(row).toHaveTextContent(
      'Stock observado: real 738.5 · reservado 36.4 · disponible 702.1',
    );
    expect(row).toHaveTextContent('Unidad: Kilogramo · kg');
    expect(row).toHaveTextContent('Depósito: Casa central');
    expect(row).toHaveTextContent('Última actualización:');
    expect(screen.queryByRole('button', { name: 'Ajustar stock de Producto Dux' }))
      .not.toBeInTheDocument();
  });

  it('maneja la confirmación de baja con foco seguro, Escape y retorno de foco', async () => {
    installCatalogApi([product('para-quitar', 'Producto para quitar')]);
    render(<ProductManager />);
    await screen.findByRole('heading', { level: 4, name: 'Producto para quitar' });
    const removeButton = screen.getByRole('button', {
      name: 'Quitar Producto para quitar del catálogo',
    });
    fireEvent.click(removeButton);

    let dialog = screen.getByRole('dialog', { name: '¿Quitar Producto para quitar?' });
    expect(dialog).toHaveAccessibleDescription(
      'Dejará de aparecer en el catálogo público. La baja lógica y su auditoría se conservarán.',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '¿Quitar Producto para quitar?' })).not.toBeInTheDocument();
    expect(removeButton).toHaveFocus();

    fireEvent.click(removeButton);
    dialog = screen.getByRole('dialog', { name: '¿Quitar Producto para quitar?' });
    expect(dialog).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));

    expect(await screen.findByText('Producto para quitar fue quitado del catálogo público.')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Productos' })).toHaveFocus();
    });
  });
});

function summaryValue(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const item = term.closest('div');
  if (item === null) throw new Error(`No se encontró el resumen ${label}.`);
  return item;
}

function category() {
  const value = authorizedCategories[0];
  if (value === undefined) throw new Error('No existe una categoría para pruebas.');
  return value;
}

function duxCommerce(available: number): NonNullable<CatalogProductDetail['commerce']> {
  return Object.freeze({
    source: 'dux' as const,
    catalogVersion: 'd'.repeat(64),
    syncedAt: '2026-09-01T12:00:00.000Z',
    availabilityState: available > 0 ? 'verified' as const : 'out_of_stock' as const,
    checkoutEligible: available > 0,
    mappingStatus: 'mapped' as const,
    quantitySemanticsStatus: 'verified' as const,
    observedStock: Object.freeze({ real: available, reserved: 0, available }),
    depositName: 'Principal',
  });
}

function product(
  id: string,
  name: string,
  options: Readonly<{
    availability?: 'available' | 'unavailable';
    categorized?: boolean;
    image?: boolean;
    sku?: string;
    commerce?: CatalogProductDetail['commerce'];
  }> = {},
): CatalogProductDetail {
  const selectedCategory = category();
  const categorized = options.categorized !== false;
  const images = options.image
    ? Object.freeze([{ src: LEGACY_IMAGE, alt: name }])
    : Object.freeze([]);
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name,
    categorySlugs: categorized ? Object.freeze([selectedCategory.slug]) : Object.freeze([]),
    categoryNames: categorized ? Object.freeze([selectedCategory.name]) : Object.freeze([]),
    presentation: '100 g',
    price: Object.freeze({ amount: 1_000, currency: 'ARS' }),
    ...(options.sku === undefined ? {} : { sku: options.sku }),
    availability: options.availability ?? 'available',
    ...(options.commerce === undefined ? {} : { commerce: options.commerce }),
    ...(images[0] === undefined ? {} : { primaryImage: images[0] }),
    images,
    variants: Object.freeze([]),
  });
}

function installCatalogApi(
  initial: readonly CatalogProductDetail[],
  options: Readonly<{
    deferCreate?: boolean;
    deferPatch?: boolean;
    failListOnce?: boolean;
    failUpload?: boolean;
    imageStorageConfigured?: boolean;
  }> = {},
) {
  let products = [...initial];
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  let releaseCreate: (() => void) | undefined;
  let releasePatch: (() => void) | undefined;
  let listAttempts = 0;

  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const path = requestPath(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : init?.body;
    requests.push({ method, path, ...(body === undefined ? {} : { body }) });

    if (path === '/api/catalog') return Promise.resolve(json({ products }));
    if (path === '/api/admin/products' && method === 'GET') {
      listAttempts += 1;
      if (options.failListOnce === true && listAttempts === 1) {
        return Promise.resolve(json({
          error: { message: 'Catálogo temporalmente no disponible.' },
        }, 503));
      }
      return Promise.resolve(json({
        imageStorageConfigured: options.imageStorageConfigured ?? false,
        products,
      }));
    }
    if (path === '/api/admin/products' && method === 'POST') {
      const created = JSON.parse(readBody(init?.body)) as CatalogProductDetail;
      const finish = () => {
        products = [...products, created];
        return json({ product: created }, 201);
      };
      if (!options.deferCreate) return Promise.resolve(finish());
      return new Promise<Response>((resolve) => {
        releaseCreate = () => resolve(finish());
      });
    }

    const imageMatch = /^\/api\/admin\/products\/([^/]+)\/image$/u.exec(path);
    if (imageMatch !== null && method === 'PUT') {
      if (options.failUpload) {
        return Promise.resolve(json({ error: { message: 'No se pudo guardar la imagen.' } }, 503));
      }
      const id = decodeURIComponent(imageMatch[1] ?? '');
      const current = requiredProduct(products, id);
      const image = Object.freeze({ src: MANAGED_IMAGE, alt: current.name });
      const updated = Object.freeze({ ...current, primaryImage: image, images: Object.freeze([image]) });
      products = products.map((candidate) => candidate.id === id ? updated : candidate);
      return Promise.resolve(json({ product: updated }));
    }
    if (imageMatch !== null && method === 'DELETE') {
      const id = decodeURIComponent(imageMatch[1] ?? '');
      const current = requiredProduct(products, id);
      const updated: CatalogProductDetail = Object.freeze({
        id: current.id,
        slug: current.slug,
        path: current.path,
        name: current.name,
        categorySlugs: current.categorySlugs,
        categoryNames: current.categoryNames,
        ...(current.presentation === undefined ? {} : { presentation: current.presentation }),
        price: current.price,
        ...(current.salePrice === undefined ? {} : { salePrice: current.salePrice }),
        ...(current.sku === undefined ? {} : { sku: current.sku }),
        ...(current.availability === undefined ? {} : { availability: current.availability }),
        ...(current.commerce === undefined ? {} : { commerce: current.commerce }),
        ...(current.shortDescription === undefined ? {} : { shortDescription: current.shortDescription }),
        ...(current.description === undefined ? {} : { description: current.description }),
        images: Object.freeze([]),
        variants: current.variants,
      });
      products = products.map((candidate) => candidate.id === id ? updated : candidate);
      return Promise.resolve(json({ product: updated }));
    }

    const match = /^\/api\/admin\/products\/([^/]+)$/u.exec(path);
    const id = decodeURIComponent(match?.[1] ?? '');
    if (match !== null && method === 'GET') {
      return Promise.resolve(json({ product: requiredProduct(products, id) }));
    }
    if (match !== null && method === 'PUT') {
      const updated = JSON.parse(readBody(init?.body)) as CatalogProductDetail;
      products = products.map((candidate) => candidate.id === id ? updated : candidate);
      return Promise.resolve(json({ product: updated }));
    }
    if (match !== null && method === 'PATCH') {
      const patch = JSON.parse(readBody(init?.body)) as {
        availability?: 'available' | 'unavailable';
      };
      const finish = () => {
        const current = requiredProduct(products, id);
        let updated = current;
        if (patch.availability !== undefined) {
          updated = Object.freeze({ ...updated, availability: patch.availability });
        }
        products = products.map((candidate) => candidate.id === id ? updated : candidate);
        return json({ product: updated });
      };
      if (!options.deferPatch) return Promise.resolve(finish());
      return new Promise<Response>((resolve) => {
        releasePatch = () => resolve(finish());
      });
    }
    if (match !== null && method === 'DELETE') {
      products = products.filter((candidate) => candidate.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    products: () => products,
    releaseCreate: () => {
      if (releaseCreate === undefined) throw new Error('No existe un alta pendiente.');
      act(releaseCreate);
    },
    releasePatch: () => {
      if (releasePatch === undefined) throw new Error('No existe un PATCH pendiente.');
      act(releasePatch);
    },
    requests,
  };
}

function requiredProduct(
  products: readonly CatalogProductDetail[],
  id: string,
): CatalogProductDetail {
  const value = products.find((productValue) => productValue.id === id);
  if (value === undefined) throw new Error(`No existe ${id}.`);
  return value;
}

function requestPath(input: RequestInfo | URL): string {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return value.startsWith('http') ? `${new URL(value).pathname}${new URL(value).search}` : value;
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
