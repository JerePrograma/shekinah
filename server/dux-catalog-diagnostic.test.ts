import { readDuxCatalogSchemaDiagnostic } from './dux-catalog-diagnostic';
import type { DuxFetch } from './dux-api';
import type { Env } from './platform';

const env: Env = {
  DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'd'.repeat(40),
  DUX_COMPANY_ID: '12862',
  DUX_BRANCH_ID: '1',
  DUX_DEPOSIT_ID: '25566',
};

describe('diagnóstico estructural del catálogo Dux', () => {
  it('expone formas y referencias útiles sin filtrar productos, importes o URLs completas', async () => {
    const productCodeSentinel = 'PRODUCT-CODE-NEVER-RETURN';
    const productNameSentinel = 'PRODUCT-NAME-NEVER-RETURN';
    const priceSentinel = 1234.57;
    const imagePathSentinel = '/private/product-image-never-return.webp';
    const requestIdSentinel = 'provider-request-id-never-return';
    const fetchImplementation: DuxFetch = (input, init) => {
      const url = input instanceof URL
        ? input
        : input instanceof Request
          ? new URL(input.url)
          : new URL(input);
      expect(url.pathname).toBe('/WSERP/rest/services/v2/items');
      expect(url.searchParams.get('id_deposito')).toBe('25566');
      expect(url.searchParams.get('habilitado')).toBe('true');
      expect(url.searchParams.get('offset')).toBe('0');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${env.DUX_API_TOKEN}`);

      return Promise.resolve(new Response(JSON.stringify({
        datos: [
          {
            cod_item: productCodeSentinel,
            item: productNameSentinel,
            precios: [{
              id_lista_precio: 7,
              lista_precio: 'Minorista',
              precio: priceSentinel,
              moneda: 'ARS',
            }],
            rubro: { id_rubro: 3, rubro: 'Hierbas' },
            sub_rubro: null,
            imagen_url: `https://cdn.dux.test${imagePathSentinel}`,
            descripcion: 'Descripción que nunca debe devolverse.',
            stock: [],
          },
          {
            cod_item: 'SECOND-CODE',
            item: 'Second product',
            precios: [{
              id_lista_precio: 7,
              lista_precio: 'Minorista',
              precio: 999,
              moneda: 'ARS',
            }],
            rubro: { id_rubro: 4, rubro: 'Especias' },
            sub_rubro: { id_sub_rubro: 9, sub_rubro: 'Pimientas' },
            imagen_url: null,
            descripcion: null,
            stock: [],
          },
        ],
        paginacion: {
          total: 679,
          offset: 0,
          limit: 50,
          hay_mas: true,
        },
        id_solicitud: requestIdSentinel,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    };

    const diagnostic = await readDuxCatalogSchemaDiagnostic(env, fetchImplementation);

    expect(diagnostic).toMatchObject({
      endpoint: '/v2/items',
      offset: 0,
      limit: 50,
      dataLength: 2,
      pagination: {
        total: 679,
        offset: 0,
        limit: 50,
        hasMore: true,
      },
      prices: {
        itemCountWithEntries: 2,
        entryCount: 2,
        safeSamples: [{
          id_lista_precio: 7,
          lista_precio: 'Minorista',
          moneda: 'ARS',
          precio: '<number>',
        }],
      },
      category: {
        objectCount: 2,
        safeSamples: [
          { id_rubro: 3, rubro: 'Hierbas' },
          { id_rubro: 4, rubro: 'Especias' },
        ],
      },
      subcategory: {
        objectCount: 1,
        safeSamples: [{ id_sub_rubro: 9, sub_rubro: 'Pimientas' }],
      },
      imageUrl: {
        nonEmptyTextCount: 1,
        urlOrigins: ['https://cdn.dux.test'],
      },
      description: {
        nonEmptyTextCount: 1,
      },
    });

    expect(diagnostic.itemFieldKinds.map(({ field }) => field)).toEqual([
      'cod_item',
      'descripcion',
      'imagen_url',
      'item',
      'precios',
      'rubro',
      'stock',
      'sub_rubro',
    ]);

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain(productCodeSentinel);
    expect(serialized).not.toContain(productNameSentinel);
    expect(serialized).not.toContain(String(priceSentinel));
    expect(serialized).not.toContain(imagePathSentinel);
    expect(serialized).not.toContain(requestIdSentinel);
    expect(serialized).not.toContain(env.DUX_API_TOKEN ?? '');
    expect(serialized).not.toContain('Descripción que nunca debe devolverse.');
  });

  it('falla cerrado ante una respuesta HTTP no exitosa sin devolver el cuerpo', async () => {
    const providerValueSentinel = 'provider-error-body-never-return';
    const fetchImplementation: DuxFetch = () => Promise.resolve(new Response(
      providerValueSentinel,
      { status: 500 },
    ));

    await expect(
      readDuxCatalogSchemaDiagnostic(env, fetchImplementation),
    ).rejects.toMatchObject({
      status: 502,
      code: 'DUX_CATALOG_DIAGNOSTIC_PROVIDER_REJECTED',
    });
  });
});
