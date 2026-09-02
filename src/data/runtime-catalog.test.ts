describe('catálogo runtime autoritativo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('no reconstruye el catálogo local cuando la API autoritativa no responde', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 503 })));
    const runtimeCatalog = await import('./runtime-catalog');

    const products = await runtimeCatalog.refreshRuntimeCatalog();

    expect(products).toEqual([]);
    expect(runtimeCatalog.isRuntimeCatalogResolved()).toBe(false);
  });

  it('acepta productos y categorías Dux publicados por la API first-party', async () => {
    const category = {
      slug: 'dux-rubro-272740',
      path: '/tienda/categoria/dux-rubro-272740/',
      name: 'ESPECIAS Y SECOS',
      productCount: 1,
    };
    const product = {
      id: 'dux-anis-1234567890abcdef',
      slug: 'dux-anis-1234567890abcdef',
      path: '/dux-anis-1234567890abcdef/',
      name: 'ANIS EN GRANO 100GR',
      categorySlugs: [category.slug],
      categoryNames: [category.name],
      price: { amount: 1_250, currency: 'ARS' },
      sku: '799000179',
      availability: 'unavailable',
      commerce: {
        source: 'dux',
        catalogVersion: 'a'.repeat(64),
        syncedAt: '2026-09-02T20:00:00.000Z',
        availabilityState: 'unavailable',
        checkoutEligible: false,
        mappingStatus: 'unmapped',
        quantitySemanticsStatus: 'unavailable_from_v2_items',
      },
    };
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      products: [product],
      categories: [category],
      source: 'dux',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    const runtimeCatalog = await import('./runtime-catalog');

    const products = await runtimeCatalog.refreshRuntimeCatalog();

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ name: product.name, sku: product.sku });
    expect(runtimeCatalog.getRuntimeCatalogCategory(category.slug)).toEqual(category);
    expect(runtimeCatalog.isRuntimeCatalogResolved()).toBe(true);
  });
});
