import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CartBenefits } from './CartBenefits';
import type { CartItem } from '../cart/model';
import type { MarketingQuote } from './marketing-contracts';

const items: readonly CartItem[] = [{ product: { id: 'producto', slug: 'producto', path: '/producto/',
  name: 'Producto de prueba', categorySlugs: [], categoryNames: [], price: { amount: 100, currency: 'ARS' },
  priceStatus: 'usable', commerce: { source: 'dux', catalogVersion: 'a'.repeat(64), checkoutEligible: false,
    syncedAt: '2026-10-22T12:00:00.000Z', availabilityState: 'verified', mappingStatus: 'mapped', quantitySemanticsStatus: 'verified' } },
  quantity: 2, unitPrice: 100, subtotal: 200 }];
const base: MarketingQuote = { campaignId: null, title: null, couponCode: null,
  subtotalMinor: 20_000, discountMinor: 0, totalMinor: 20_000,
  lines: [{ productId: 'producto', code: 'SKU-1', quantity: 2,
    baseUnitPriceMinor: 10_000, unitPriceMinor: 10_000, discountMinor: 0 }] };
const discounted: MarketingQuote = { ...base, campaignId: 'mkt_abcdefghijklmnop', title: 'Beneficio de prueba',
  couponCode: 'PRUEBA10', discountMinor: 2_000, totalMinor: 18_000,
  lines: [{ ...base.lines[0]!, unitPriceMinor: 9_000, discountMinor: 2_000 }] };
const callbacks = () => ({ onQuoteChange: vi.fn(), onCouponChange: vi.fn(), onBusyChange: vi.fn(), onBlockedChange: vi.fn() });

afterEach(() => { vi.unstubAllGlobals(); });

it('consulta precios del servidor, normaliza el cupón y envía solamente identidad y cantidades', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ quote: base }))
    .mockResolvedValueOnce(Response.json({ quote: discounted }))
    .mockResolvedValueOnce(Response.json({ quote: base }));
  vi.stubGlobal('fetch', fetchMock);
  const change = callbacks();
  render(<CartBenefits items={items} enabled disabled={false} {...change} />);
  await waitFor(() => expect(change.onQuoteChange).toHaveBeenLastCalledWith(base));
  fireEvent.change(screen.getByLabelText('¿Tenés un cupón?'), { target: { value: ' prueba10 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  await screen.findByText(/Cupón PRUEBA10 aplicado/);
  expect(change.onQuoteChange).toHaveBeenLastCalledWith(discounted);
  const sentBody = fetchMock.mock.calls[1]?.[1]?.body;
  if (typeof sentBody !== 'string') throw new Error('Falta la consulta de beneficios.');
  const body: unknown = JSON.parse(sentBody);
  expect(body).toEqual({ items: [{ productId: 'producto', quantity: 2, catalogVersion: 'a'.repeat(64) }], couponCode: 'PRUEBA10' });
  fireEvent.click(screen.getByRole('button', { name: 'Quitar cupón' }));
  await waitFor(() => expect(change.onCouponChange).toHaveBeenLastCalledWith(null));
  await waitFor(() => expect(change.onQuoteChange).toHaveBeenLastCalledWith(base));
});

it('bloquea el cupón rechazado hasta quitarlo o volver a validarlo', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ quote: base }))
    .mockResolvedValueOnce(Response.json({ error: { code: 'COUPON_EXPIRED', message: 'El cupón venció.' } }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ quote: base })));
  const change = callbacks();
  render(<CartBenefits items={items} enabled disabled={false} {...change} />);
  await waitFor(() => expect(change.onQuoteChange).toHaveBeenLastCalledWith(base));
  fireEvent.change(screen.getByLabelText('¿Tenés un cupón?'), { target: { value: 'VENCIDO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El cupón venció.');
  expect(change.onBlockedChange).toHaveBeenLastCalledWith(true);
  expect(change.onQuoteChange).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: 'Quitar cupón' }));
  await waitFor(() => expect(change.onBlockedChange).toHaveBeenLastCalledWith(false));
});

it('ignora una respuesta tardía de un carrito anterior y elimina beneficios al cambiar a envío', async () => {
  let resolveFirst!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })));
  const change = callbacks();
  const view = render(<CartBenefits items={items} enabled disabled={false} {...change} />);
  view.rerender(<CartBenefits items={items} enabled={false} disabled={false} {...change} />);
  await act(async () => { resolveFirst(Response.json({ quote: discounted })); await Promise.resolve(); });
  expect(change.onQuoteChange).toHaveBeenLastCalledWith(null);
  expect(change.onCouponChange).toHaveBeenLastCalledWith(null);
  expect(change.onBlockedChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByText(/retiro coordinado/)).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('rechaza cotizaciones para productos o cantidades diferentes', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ quote: {
    ...base, lines: [{ ...base.lines[0]!, productId: 'otro-producto' }],
  } })));
  const change = callbacks();
  render(<CartBenefits items={items} enabled disabled={false} {...change} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Los productos cambiaron');
  expect(change.onQuoteChange).not.toHaveBeenCalledWith(base);
});

it('explica un fallo de conexión y libera el estado ocupado al desmontar el carrito', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));
  const change = callbacks();
  const view = render(<CartBenefits items={items} enabled disabled={false} {...change} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar los beneficios. Volvé a intentarlo.');
  view.unmount();
  expect(change.onBusyChange).toHaveBeenLastCalledWith(false);
  expect(change.onBlockedChange).toHaveBeenLastCalledWith(false);
});
