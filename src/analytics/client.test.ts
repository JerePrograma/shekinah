import {
  getAnalyticsConsent,
  grantAnalyticsConsent,
  sanitizePath,
  trackAnalyticsEvent,
  withdrawAnalyticsConsent,
} from './client';

describe('cliente analítico consentido', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubEnv('VITE_ANALYTICS_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('no envía antes de aceptar, sanitiza y se detiene al retirar', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await trackAnalyticsEvent('page_view', { path: '/catalogo?utm_source=x#detalle' });
    expect(fetchMock).not.toHaveBeenCalled();

    await grantAnalyticsConsent();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await trackAnalyticsEvent('product_view', {
      path: '/producto-prueba?utm_source=x#detalle',
      productId: 'producto-prueba',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[1]?.[1];
    if (request === undefined || typeof request.body !== 'string') {
      throw new Error('No se capturó el evento analítico.');
    }
    expect(JSON.parse(request.body)).toMatchObject({
      eventName: 'product_view',
      path: '/producto-prueba',
      productId: 'producto-prueba',
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(withdrawAnalyticsConsent()).resolves.toBe('remote-deleted');
    expect(getAnalyticsConsent()).toBe('rejected');
    const callCount = fetchMock.mock.calls.length;
    await trackAnalyticsEvent('page_view', { path: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(callCount);
  });

  it('permanece cerrada cuando el flag público está deshabilitado', async () => {
    vi.stubEnv('VITE_ANALYTICS_ENABLED', 'false');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await grantAnalyticsConsent();
    await trackAnalyticsEvent('page_view', { path: '/' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza rutas sin query, fragmento ni barras duplicadas', () => {
    expect(sanitizePath('catalogo//hierbas?utm_source=x#detalle')).toBe('/catalogo/hierbas');
  });
});
