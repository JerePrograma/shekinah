import { readDuxStockSchemaDiagnostic } from './dux-schema-diagnostic';
import type { DuxFetch } from './dux-api';
import type { Env } from './platform';

const env: Env = {
  DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'd'.repeat(40),
  DUX_COMPANY_ID: '12862',
  DUX_BRANCH_ID: '1',
  DUX_DEPOSIT_ID: '25566',
};

describe('diagnóstico estructural Dux', () => {
  it('informa sólo tipos de cantidades inválidas y nunca valores del proveedor', async () => {
    const providerValueSentinel = 'provider-stock-value-never-return';
    const fetchImplementation: DuxFetch = (input, init) => {
      const url = input instanceof URL
        ? input
        : input instanceof Request
          ? new URL(input.url)
          : new URL(input);
      expect(url.pathname).toBe('/WSERP/rest/services/v2/items');
      expect(url.searchParams.get('id_deposito')).toBe('25566');
      expect(url.searchParams.get('habilitado')).toBe('true');
      expect(url.searchParams.get('offset')).toBe('650');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');

      return Promise.resolve(new Response(JSON.stringify({
        datos: [
          {
            stock: [{
              stock_real: 5,
              stock_reservado: 1,
              stock_disponible: 4,
            }],
          },
          {
            stock: [{
              stock_real: null,
              stock_reservado: providerValueSentinel,
              stock_disponible: null,
            }],
          },
        ],
        paginacion: {
          total: 747,
          offset: 650,
          limit: 50,
          hay_mas: true,
        },
        id_solicitud: 'provider-request-id-never-return',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    };

    const diagnostic = await readDuxStockSchemaDiagnostic(env, fetchImplementation);

    expect(diagnostic).toEqual({
      endpoint: '/v2/items',
      offset: 650,
      limit: 50,
      dataLength: 2,
      pagination: {
        total: 747,
        offset: 650,
        limit: 50,
        hasMore: true,
      },
      issues: [{
        itemIndex: 1,
        stockIndex: 0,
        stockKind: 'object',
        quantityFieldKinds: {
          stock_real: 'null',
          stock_reservado: 'string',
          stock_disponible: 'null',
        },
      }],
    });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain(providerValueSentinel);
    expect(serialized).not.toContain('provider-request-id-never-return');
    expect(serialized).not.toContain(env.DUX_API_TOKEN ?? '');
  });

  it('falla cerrado ante una respuesta HTTP no exitosa sin leer ni devolver el cuerpo', async () => {
    const providerValueSentinel = 'provider-error-body-never-return';
    const fetchImplementation: DuxFetch = () => Promise.resolve(new Response(
      providerValueSentinel,
      { status: 500 },
    ));

    await expect(readDuxStockSchemaDiagnostic(env, fetchImplementation)).rejects.toMatchObject({
      status: 502,
      code: 'DUX_DIAGNOSTIC_PROVIDER_REJECTED',
    });
  });
});
