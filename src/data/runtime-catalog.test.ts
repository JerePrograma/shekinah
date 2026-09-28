describe('catálogo runtime autoritativo', () => {
  it('no carga una ficha manual desde archivos compilados aunque la API anterior declare legacy-bootstrap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      schemaVersion: 2, source: 'legacy-bootstrap', products: [], categories: [],
    }), { headers: { 'content-type': 'application/json' } })).mockResolvedValue(new Response(null, { status: 503 })));
    const runtime = await import('./runtime-catalog');
    await runtime.refreshRuntimeCatalog();
    await expect(runtime.loadRuntimeProductDetail('guayaba')).rejects.toThrow('No pudimos cargar el producto');
  });
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

  it('distingue una ficha ausente de una consulta de red fallida', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 404 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const runtime = await import('./runtime-catalog');
    expect(await runtime.loadRuntimeProductDetail('ausente')).toBeNull();
    await expect(runtime.loadRuntimeProductDetail('existente')).rejects.toThrow('Revisá tu conexión y reintentá');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/catalog/existente');
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['legacy-bootstrap','manual'])('rechaza productos manuales de una respuesta %s incluso con SKU y precio',async source=>{
    const product={id:'manual',slug:'manual',path:'/manual/',name:'Manual retirado',sku:'OLD',price:{amount:1000,currency:'ARS'},priceStatus:'usable',categorySlugs:[],categoryNames:[],images:[],variants:[]};
    window.localStorage.setItem('catalog',JSON.stringify([product]));
    vi.stubGlobal('fetch',vi.fn().mockImplementation(() => Promise.resolve(Response.json({schemaVersion:2,source,products:[product],product,categories:[]}))));
    const runtime=await import('./runtime-catalog');
    expect(await runtime.refreshRuntimeCatalog()).toEqual([]);await expect(runtime.loadRuntimeProductDetail('manual')).rejects.toThrow('No pudimos cargar el producto');
    window.localStorage.removeItem('catalog');
  });

  it.each([
    { schemaVersion: 2, priceStatus: 'missing_or_zero', expected: 1 },
    { schemaVersion: 2, priceStatus: undefined, expected: 0 },
    { schemaVersion: 999, priceStatus: 'missing_or_zero', expected: 0 },
  ])('valida versión $schemaVersion y estado $priceStatus del contrato nullable', async ({ schemaVersion, priceStatus, expected }) => {
    const product = {
      id: 'dux-nuevo', slug: 'dux-nuevo', path: '/dux-nuevo/', name: 'NUEVO EN DUX',
      categorySlugs: [], categoryNames: [], price: null, priceStatus, sku: 'DUX-NUEVO', images: [], variants: [],
      commerce: { source: 'dux', catalogVersion: 'b'.repeat(64), syncedAt: '2026-09-06T12:00:00.000Z',
        availabilityState: 'unavailable', checkoutEligible: false, mappingStatus: 'unmapped',
        quantitySemanticsStatus: 'unavailable_from_v2_items' },
    };
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      schemaVersion, products: [product], product, categories: [], source: 'dux',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const runtimeCatalog = await import('./runtime-catalog');
    const products = await runtimeCatalog.refreshRuntimeCatalog();
    expect(products).toHaveLength(expected);
    if (expected === 0) await expect(runtimeCatalog.loadRuntimeProductDetail(product.slug)).rejects.toThrow('No pudimos cargar el producto');
    else expect(await runtimeCatalog.loadRuntimeProductDetail(product.slug)).toMatchObject({ price: null, priceStatus, commerce: { checkoutEligible: false } });
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
      priceStatus: 'usable',
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
      schemaVersion: 2, products: [product],
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

  it('abre una ficha Dux directamente sin depender de categorías locales o de una carga previa', async () => {
    const product = {
      id: 'dux-categoria-nueva', slug: 'dux-categoria-nueva', path: '/dux-categoria-nueva/', name: 'PRODUCTO DUX',
      categorySlugs: ['dux-rubro-123'], categoryNames: ['RUBRO DUX NUEVO'],
      price: null, priceStatus: 'placeholder', sku: 'DUX-NUEVA-CATEGORIA', images: [], variants: [],
      commerce: { source: 'dux', catalogVersion: 'c'.repeat(64), syncedAt: '2026-09-06T12:00:00.000Z',
        availabilityState: 'unavailable', checkoutEligible: false, mappingStatus: 'unmapped',
        quantitySemanticsStatus: 'unavailable_from_v2_items' },
    };
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ schemaVersion: 2, product }), {
      headers: { 'content-type': 'application/json' },
    })));
    const runtimeCatalog = await import('./runtime-catalog');
    expect(runtimeCatalog.isRuntimeCatalogResolved()).toBe(false);
    expect(await runtimeCatalog.loadRuntimeProductDetail(product.slug)).toMatchObject({
      categorySlugs: ['dux-rubro-123'], price: null, priceStatus: 'placeholder',
    });
    await expect(runtimeCatalog.loadRuntimeProductDetail('otro-producto')).rejects.toThrow('No pudimos cargar el producto');
  });
});
