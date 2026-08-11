import {
  getAnalyticsConsent,
  grantAnalyticsConsent,
  rejectAnalyticsConsent,
  sanitizePath,
  trackAnalyticsEvent,
  withdrawAnalyticsConsent,
} from './client';

describe('cliente analítico consentido', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
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

  it('permanece en cero después de rechazar el consentimiento', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    rejectAnalyticsConsent();
    await trackAnalyticsEvent('page_view', { path: '/' });
    expect(getAnalyticsConsent()).toBe('rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emite manual_payment_click sin monto, carrito ni PII', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await grantAnalyticsConsent();
    fetchMock.mockClear();

    await trackAnalyticsEvent('manual_payment_click', { path: '/carrito' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    if (request === undefined || typeof request.body !== 'string') {
      throw new Error('No se capturó el evento manual.');
    }
    const payload = JSON.parse(request.body) as Record<string, unknown>;
    expect(payload).toMatchObject({
      eventName: 'manual_payment_click',
      path: '/carrito',
      consentVersion: '1',
    });
    expect(Object.keys(payload).sort()).toEqual([
      'consentVersion',
      'deviceClass',
      'eventId',
      'eventName',
      'path',
      'sessionId',
      'source',
    ]);
    for (const forbiddenKey of ['fullName', 'phone', 'address', 'amount', 'items', 'fulfillment']) {
      expect(payload).not.toHaveProperty(forbiddenKey);
    }
  });

  it('descarta toda actividad administrativa incluso al aceptar', async () => {
    window.history.replaceState(null, '', '/admin');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await grantAnalyticsConsent();
    await trackAnalyticsEvent('page_view', { path: '/admin/auditoria' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('normaliza rutas sin query, fragmento ni barras duplicadas', () => {
    expect(sanitizePath('catalogo//hierbas?utm_source=x#detalle')).toBe('/catalogo/hierbas');
  });
});
