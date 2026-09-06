import { render, screen } from '@testing-library/react';

import { parseProduct, parseProductDetail } from '../catalog/model';
import { ProductPage } from './ProductPage';

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
