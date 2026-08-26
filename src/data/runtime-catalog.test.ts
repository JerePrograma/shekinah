describe('catálogo runtime autoritativo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('mantiene el fallback estático fuera de venta aunque los flags legacy estén apagados', async () => {
    vi.stubEnv('VITE_COMMERCE_ENABLED', 'false');
    vi.stubEnv('VITE_MERCADO_LIBRE_CATALOG_ENABLED', 'false');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 503 })));
    const runtimeCatalog = await import('./runtime-catalog');

    const products = await runtimeCatalog.refreshRuntimeCatalog();

    expect(products.length).toBeGreaterThan(0);
    expect(products.every(({ availability }) => availability === 'unavailable')).toBe(true);
    expect(runtimeCatalog.isRuntimeCatalogResolved()).toBe(false);
  });
});
