import { render, screen } from '@testing-library/react';

import { parseProduct, parseProductDetail } from '../catalog/model';
import { ProductPage } from './ProductPage';

it.each(['verified', 'updating', 'out_of_stock'] as const)('muestra stock real Dux con decimales, reservas y fecha (%s) sin habilitar compras', async (availabilityState) => {
  const summary = parseProduct({
    id: 'dux-stock-real', slug: 'dux-stock-real', path: '/dux-stock-real/', name: 'DUX CON STOCK',
    categorySlugs: [], categoryNames: [], price: { amount: 100, currency: 'ARS' }, priceStatus: 'usable', sku: 'REAL',
    availability: 'unavailable',
    commerce: { source: 'dux', catalogVersion: 'a'.repeat(64), syncedAt: '2026-09-07T19:00:00.000Z',
      stockSyncedAt: '2026-09-07T18:59:00.000Z', availabilityState, checkoutEligible: false,
      mappingStatus: 'unmapped', quantitySemanticsStatus: 'unavailable_from_v2_items',
      observedStock: { real: 738.512345, reserved: 0.25, available: availabilityState === 'out_of_stock' ? -0.5 : 738.262345 } },
  });
  loadDetail.mockResolvedValue(parseProductDetail(summary, { images: [], variants: [] }));
  render(<ProductPage navigate={vi.fn()} productSlug={summary.slug} />);
  expect(await screen.findByRole('heading', { name: 'DUX CON STOCK' })).toBeVisible();
  const stock = screen.getByRole('region', { name: 'Existencias en Dux' });
  expect(stock).toHaveTextContent('Stock real738,512345');
  expect(stock).toHaveTextContent('Reservado0,25');
  expect(stock).toHaveTextContent(availabilityState === 'out_of_stock' ? 'Disponible-0,5' : 'Disponible738,262345');
  expect(stock.querySelector('time')).toHaveAttribute('datetime', '2026-09-07T18:59:00.000Z');
  expect(stock).not.toHaveTextContent(/kilogramos|unidades/iu);
  if (availabilityState === 'updating') expect(stock).toHaveTextContent('necesita actualizarse');
  expect(screen.getByRole('button', { name: 'Producto no disponible' })).toBeDisabled();
});

const { loadDetail, add } = vi.hoisted(() => ({ loadDetail: vi.fn(), add: vi.fn() }));
vi.mock('../data/runtime-catalog', () => ({ loadRuntimeProductDetail: loadDetail, getRuntimeCatalogProduct: () => undefined }));
vi.mock('../cart/CartContext', () => ({ useCart: () => ({ add, storedItems: [] }) }));

it.each(['placeholder', 'missing_or_zero', 'invalid'])('la ficha Dux %s explica el precio ausente y bloquea el carrito', async (priceStatus) => {
  const summary = parseProduct({
    id: 'dux-sin-precio', slug: 'dux-sin-precio', path: '/dux-sin-precio/', name: 'PRODUCTO DUX',
    categorySlugs: [], categoryNames: [], price: null, priceStatus, sku: 'DUX-123',
    commerce: {
      source: 'dux', catalogVersion: 'a'.repeat(64), syncedAt: '2026-09-06T12:00:00.000Z',
      availabilityState: 'unavailable', checkoutEligible: false, mappingStatus: 'unmapped',
      quantitySemanticsStatus: 'unavailable_from_v2_items',
    },
  });
  loadDetail.mockResolvedValue(parseProductDetail(summary, { images: [], variants: [] }));
  render(<ProductPage navigate={vi.fn()} productSlug={summary.slug} />);
  expect(await screen.findByRole('heading', { name: 'PRODUCTO DUX' })).toBeVisible();
  expect(screen.getByText('Consultar precio')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Producto no disponible' })).toBeDisabled();
  expect(document.querySelector('.product-facts')?.textContent).not.toContain('$');
  expect(add).not.toHaveBeenCalled();
});
