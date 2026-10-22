import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MarketingCampaign } from '../commerce/marketing-contracts';
import { Announcements, PublicMarketingProvider } from './Announcements';

function campaign(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return { id: 'mkt_0000000000000001', type: 'announcement', code: null, title: 'Novedad autorizada de prueba', body: 'Texto de prueba local.',
    ctaLabel: 'Explorar catálogo', href: '/catalogo', placement: 'announcement', priority: 0, enabled: true,
    startsAt: null, endsAt: null, percentOff: null, minSubtotalMinor: 0, maxDiscountMinor: null,
    productCodes: [], maxRedemptions: null, redemptionCount: 0, updatedAt: '2026-10-22T12:00:00.000Z', ...overrides };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('muestra anuncios por ubicación y navega por enlaces internos reales', async () => {
  const navigate = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ announcements: [campaign(), campaign({ id: 'mkt_0000000000000002', title: 'Novedad de inicio', placement: 'home', ctaLabel: '', href: '' })], promotions: [] }))));
  render(<PublicMarketingProvider><Announcements placement="announcement" navigate={navigate} /><Announcements placement="home" navigate={navigate} /></PublicMarketingProvider>);
  expect(await screen.findByRole('complementary', { name: 'Anuncios de la tienda' })).toHaveTextContent('Novedad autorizada de prueba');
  expect(screen.getByRole('complementary', { name: 'Novedades y promociones' })).toHaveTextContent('Novedad de inicio');
  const link = screen.getByRole('link', { name: 'Explorar catálogo' });
  expect(link).toHaveAttribute('href', '/catalogo'); fireEvent.click(link); expect(navigate).toHaveBeenCalledWith('/catalogo');
});

it('explica el alcance, el mínimo total y los límites de una promoción automática', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ announcements: [], promotions: [campaign({ type: 'automatic', percentOff: 15, placement: 'home', minSubtotalMinor: 500000, maxDiscountMinor: 100000, productCodes: ['00123'] })] }))));
  render(<PublicMarketingProvider><Announcements placement="home" navigate={vi.fn()} /></PublicMarketingProvider>);
  const announcements = await screen.findByRole('complementary');
  expect(announcements).toHaveTextContent('Hasta 15% de descuento con una compra total mínima de');
  expect(announcements).toHaveTextContent('En los productos seleccionados. Sólo para retiro coordinado.');
  expect(announcements).toHaveTextContent('El descuento se confirma en el carrito.');
});

it('oculta campañas desactivadas, vencidas y cupones que nunca deberían ser públicos', async () => {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ announcements: [campaign({ enabled: false }), campaign({ id: 'mkt_0000000000000002', endsAt: '2020-01-01T00:00:00.000Z' })], promotions: [] })));
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<PublicMarketingProvider><Announcements placement="announcement" navigate={vi.fn()} /></PublicMarketingProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  rerender(<PublicMarketingProvider enabled={false}><Announcements placement="announcement" navigate={vi.fn()} /></PublicMarketingProvider>);
  fetchMock.mockImplementation(() => Promise.resolve(json({ announcements: [], promotions: [campaign({ type: 'coupon', code: 'PRIVADO', percentOff: 10 })] })));
  rerender(<PublicMarketingProvider><Announcements placement="announcement" navigate={vi.fn()} /></PublicMarketingProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('PRIVADO')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

it('un fallo de anuncios conserva el resto de la tienda y administración no los consulta', async () => {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ error: { message: 'Prueba sin configuración.' } }, 503)));
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<PublicMarketingProvider enabled={false}><p>Catálogo disponible</p><Announcements placement="home" navigate={vi.fn()} /></PublicMarketingProvider>);
  expect(fetchMock).not.toHaveBeenCalled();
  rerender(<PublicMarketingProvider><p>Catálogo disponible</p><Announcements placement="home" navigate={vi.fn()} /></PublicMarketingProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Catálogo disponible')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
