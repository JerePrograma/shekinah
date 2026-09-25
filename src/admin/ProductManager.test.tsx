import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProductManager } from './ProductManager';
import { duxApiFixture } from '../test/dux-api-fixture';

const product = {
  id: 'dux-test', slug: 'dux-test', path: '/dux-test/', name: 'Producto Dux', sku: 'DUX-1',
  price: { amount: 1000, currency: 'ARS' }, priceStatus: 'usable',
  categorySlugs: ['dux-rubro-1'], categoryNames: ['Rubro Dux'], images: [], variants: [], availability: 'unavailable',
  description: 'Descripción autorizada del producto de prueba.',
  commerce: {
    source: 'dux', catalogVersion: 'a'.repeat(64), syncedAt: '2026-09-08T12:01:00.000Z', stockSyncedAt: '2026-09-08T12:00:00.000Z',
    availabilityState: 'unavailable', checkoutEligible: false, mappingStatus: 'unmapped', quantitySemanticsStatus: 'unavailable_from_v2_items',
    observedStock: { real: 2.375, reserved: 0.125, available: 2.25 }, depositName: 'Principal',
  },
};
type FixtureProduct = typeof product & { publicationStatus?: 'published' | 'unpublished' };
const payload = duxApiFixture({ products: [product], imageStorageConfigured: true });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('actualiza el aviso del catálogo al vencer la lectura sin refrescar stock ni cambiar su fecha', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T12:14:59.000Z'));
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)); vi.stubGlobal('fetch', request);
  await act(async () => { render(<ProductManager />); await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole('heading', { name: 'Producto Dux' })).toBeVisible();
  fireEvent.click(screen.getByText('Stock y detalles', { selector: 'summary' }));
  expect(screen.queryByText(/El stock supera el objetivo/)).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByText(/El stock supera el objetivo/)).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(/El stock supera el objetivo/)).toBeVisible();
  expect(document.querySelector('time')).toHaveAttribute('datetime', product.commerce.stockSyncedAt);
  expect(request).toHaveBeenCalledTimes(1);
});

it('presenta descripción y stock plegados y conserva altas y stock en Dux', async () => {
  const api = installCatalogApi([product]);
  render(<ProductManager />);
  await screen.findByRole('heading', { name: product.name });
  const row = screen.getByRole('article', { name: product.name });
  const description = within(row).getByText('Descripción', { selector: 'summary' });
  expect(description.closest('details')).not.toHaveAttribute('open');
  expect(within(row).getByText(product.description)).not.toBeVisible();
  expect(within(row).getByText('Stock y detalles', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
  expect(within(row).getByText('Publicado', { exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Nuevo producto' })).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  fireEvent.click(description);
  expect(within(row).getByText(product.description)).toBeVisible();
  fireEvent.click(description);
  expect(within(row).getByText(product.description)).not.toBeVisible();
  fireEvent.click(within(row).getByText('Stock y detalles', { selector: 'summary' }));
  expect(within(row).getByText('Stock real')).toBeVisible();
  expect(within(row).getByText('Reservado')).toBeVisible();
  expect(api.mutations()).toHaveLength(0);
});

it.each([undefined, false])('rechaza respuestas antiguas aunque el indicador de retiro sea %s', async marker => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...payload, manualCatalogRetired: marker })));
  render(<ProductManager />);
  expect(await screen.findByRole('heading', { name: 'No pudimos cargar los productos' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nuevo producto' })).not.toBeInTheDocument();
});

it('rechaza un producto sin procedencia Dux incluso si la respuesta declara el retiro', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...payload, products: [{ ...product, commerce: undefined }] })));
  render(<ProductManager />);
  expect(await screen.findByRole('heading', { name: 'No pudimos cargar los productos' })).toBeVisible();
});

it('conserva búsqueda, categorías, reintento y productos sin precio ni contenido', async () => {
  const request = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: 'Temporal' } }, { status: 503 }))
    .mockResolvedValue(Response.json(duxApiFixture({ products: [product, {
      ...product, id: 'dux-vacio', slug: 'dux-vacio', path: '/dux-vacio/', sku: 'DUX-2', name: 'Sin precio',
      price: null, priceStatus: 'missing_or_zero', description: undefined,
    }], imageStorageConfigured: true })));
  vi.stubGlobal('fetch', request); render(<ProductManager />);
  expect(await screen.findByRole('heading', { name: 'No pudimos cargar los productos' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/u }));
  await screen.findByRole('heading', { name: 'Sin precio' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'DUX-2' } });
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Sin precio' })).toHaveTextContent('Consultar precio');
  fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'uncategorized' } });
  expect(screen.getByRole('heading', { name: 'No encontramos productos con estos filtros' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(screen.getAllByRole('article')).toHaveLength(2);
});

it.each(['name', 'category', 'price-asc', 'price-desc', 'stock-asc', 'stock-desc'])(
  'mantiene las bajas al final al ordenar por %s sin confundir publicación con disponibilidad Dux', async sort => {
    installCatalogApi([
      { ...product, id: 'baja-a', slug: 'baja-a', path: '/baja-a/', name: 'A baja', publicationStatus: 'unpublished', price: { amount: 10, currency: 'ARS' } },
      { ...product, id: 'baja-z', slug: 'baja-z', path: '/baja-z/', name: 'Z baja', publicationStatus: 'unpublished', price: { amount: 9000, currency: 'ARS' } },
      product,
    ]);
    render(<ProductManager />);
    await screen.findByRole('heading', { name: product.name });
    fireEvent.click(screen.getByText('Más filtros y orden', { selector: 'summary' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar' }), { target: { value: sort } });
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(product.name);
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'published' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: product.name })).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'unpublished' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('article', { name: product.name })).not.toBeInTheDocument();
  },
);

it('confirma una baja reversible, conserva la fila al final y vuelve a publicar el mismo producto', async () => {
  const other = { ...product, id: 'dux-otro', slug: 'dux-otro', path: '/dux-otro/', name: 'Z otro producto' };
  const api = installCatalogApi([product, other]);
  render(<ProductManager />);
  const trigger = await screen.findByRole('button', { name: `Dar de baja ${product.name}` });
  fireEvent.click(trigger);
  const confirmation = screen.getByRole('dialog', { name: `¿Dar de baja ${product.name}?` });
  expect(api.mutations()).toHaveLength(0);
  await waitFor(() => expect(within(confirmation).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  fireEvent.keyDown(confirmation, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
  const restore = await screen.findByRole('button', { name: `Volver a publicar ${product.name}` });
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getAllByRole('article')[1]).toHaveAccessibleName(product.name);
  expect(within(screen.getByRole('article', { name: product.name })).getByText('Dado de baja', { exact: true })).toBeVisible();
  expect(api.mutations()).toEqual([{ method: 'DELETE', path: '/api/admin/products/dux-test' }]);
  fireEvent.click(restore);
  await screen.findByRole('button', { name: `Dar de baja ${product.name}` });
  expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(product.name);
  expect(api.mutations()[1]).toEqual({ method: 'PATCH', path: '/api/admin/products/dux-test', body: { publicationStatus: 'published' } });
  expect(api.products()[0]).toMatchObject({ id: product.id, commerce: product.commerce, publicationStatus: 'published' });
});

it('devuelve el foco al control de publicación cuando termina un refresco público demorado', async () => {
  let finishRefresh: (() => void) | undefined;
  const refreshing = new Promise<void>(resolve => { finishRefresh = resolve; });
  installCatalogApi([product], { beforeRefresh: () => refreshing });
  render(<ProductManager />);
  fireEvent.click(await screen.findByRole('button', { name: `Dar de baja ${product.name}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
  const restore = await screen.findByRole('button', { name: `Volver a publicar ${product.name}` });
  expect(restore).toBeDisabled();
  await act(async () => { finishRefresh?.(); await refreshing; });
  await waitFor(() => expect(restore).toBeEnabled());
  await waitFor(() => expect(restore).toHaveFocus());
});

it('edita sólo descripción, evita guardados duplicados y comunica la operación activa', async () => {
  let complete: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const api = installCatalogApi([product], { beforeMutation: () => pending });
  const interaction = vi.fn();
  render(<ProductManager onInteractionStateChange={interaction} />);
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${product.name}` }));
  expect(screen.getByText('Editar descripción', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Editar descripción', { selector: 'summary' }));
  const description = screen.getByRole('textbox', { name: 'Descripción' });
  fireEvent.change(description, { target: { value: 'Descripción actualizada de prueba.' } });
  expect(screen.queryByRole('textbox', { name: 'Nombre' })).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(interaction).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true, busy: false }));
  const form = description.closest('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!); fireEvent.submit(form!);
  expect(api.mutations()).toHaveLength(1);
  expect(api.mutations()[0]).toEqual({ method: 'PATCH', path: '/api/admin/products/dux-test', body: { description: 'Descripción actualizada de prueba.' } });
  expect(screen.getByRole('button', { name: 'Cerrar editor' })).toBeDisabled();
  expect(interaction).toHaveBeenLastCalledWith(expect.objectContaining({ busy: true }));
  await act(async () => { complete?.(); await pending; });
  await waitFor(() => expect(interaction).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false, busy: false })));
  expect(description).toHaveValue('Descripción actualizada de prueba.');
  expect(api.products()[0]).toMatchObject({ name: product.name, price: product.price, commerce: product.commerce });
});

it('conserva el borrador y el error si falla el guardado y permite reintentarlo', async () => {
  const api = installCatalogApi([product], { failFirstMutation: true });
  const interaction = vi.fn();
  render(<ProductManager onInteractionStateChange={interaction} />);
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${product.name}` }));
  fireEvent.click(screen.getByText('Editar descripción', { selector: 'summary' }));
  const description = screen.getByRole('textbox', { name: 'Descripción' });
  fireEvent.change(description, { target: { value: 'Borrador que debe conservarse.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la prueba.');
  expect(description).toHaveValue('Borrador que debe conservarse.');
  expect(api.products()[0]?.description).toBe(product.description);
  expect(interaction).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true, busy: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(interaction).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false, busy: false })));
  expect(api.products()[0]?.description).toBe('Borrador que debe conservarse.');
});

it('protege el borrador al cerrar, cambiar de producto o salir y permite descartarlo explícitamente', async () => {
  const other = { ...product, id: 'dux-otro', slug: 'dux-otro', path: '/dux-otro/', name: 'Otro producto' };
  const api = installCatalogApi([product, other]);
  render(<ProductManager />);
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${product.name}` }));
  fireEvent.click(screen.getByText('Editar descripción', { selector: 'summary' }));
  const description = screen.getByRole('textbox', { name: 'Descripción' });
  fireEvent.change(description, { target: { value: 'Borrador sin guardar.' } });
  expect(screen.getByRole('button', { name: `Dar de baja ${product.name}` })).toBeDisabled();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar editor' }));
  const confirmation = screen.getByRole('dialog', { name: 'Hay cambios sin guardar' });
  expect(within(confirmation).getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
  fireEvent.keyDown(confirmation, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(description).toHaveValue('Borrador sin guardar.');
  fireEvent.click(screen.getByRole('button', { name: `Editar ${other.name}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(screen.getByRole('heading', { name: `Editar ${other.name}` })).toBeVisible();
  expect(api.mutations()).toHaveLength(0);
  const cleanUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false);
});

it('una baja fallida conserva el producto publicado y la confirmación para reintentar', async () => {
  const api = installCatalogApi([product], { failFirstMutation: true });
  render(<ProductManager />);
  fireEvent.click(await screen.findByRole('button', { name: `Dar de baja ${product.name}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la prueba.');
  expect(screen.getByRole('dialog', { name: `¿Dar de baja ${product.name}?` })).toBeVisible();
  expect(within(screen.getByRole('article', { name: product.name })).getByText('Publicado', { exact: true })).toBeVisible();
  expect(api.products()[0]?.publicationStatus).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar baja' }));
  expect(await screen.findByRole('button', { name: `Volver a publicar ${product.name}` })).toBeVisible();
});

function installCatalogApi(initialProducts: readonly FixtureProduct[], options: Readonly<{
  beforeMutation?: () => Promise<void>;
  beforeRefresh?: () => Promise<void>;
  failFirstMutation?: boolean;
}> = {}) {
  let products = structuredClone(initialProducts) as FixtureProduct[];
  const mutations: Array<{ method: string; path: string; body?: unknown }> = [];
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    if (path === '/api/catalog') await options.beforeRefresh?.();
    if (method === 'GET') return Response.json(duxApiFixture({
      products: path === '/api/catalog' ? products.filter(value => value.publicationStatus !== 'unpublished') : products,
      imageStorageConfigured: true,
    }));
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    mutations.push({ method, path, ...(body === undefined ? {} : { body }) });
    await options.beforeMutation?.();
    if (options.failFirstMutation === true && mutations.length === 1) {
      return Response.json({ error: { message: 'No se pudo guardar la prueba.' } }, { status: 503 });
    }
    const id = decodeURIComponent(path.split('/').at(-1) ?? '');
    const current = products.find(value => value.id === id);
    if (current === undefined) return Response.json({ error: { message: 'Producto inexistente.' } }, { status: 404 });
    const updated: FixtureProduct = method === 'DELETE'
      ? { ...current, publicationStatus: 'unpublished' }
      : { ...current, ...body as Partial<FixtureProduct> };
    products = products.map(value => value.id === id ? updated : value);
    return Response.json({ product: updated });
  });
  vi.stubGlobal('fetch', request);
  return { request, products: () => products, mutations: () => mutations };
}
