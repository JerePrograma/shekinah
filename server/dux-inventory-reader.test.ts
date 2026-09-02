import { createDuxInventoryReader } from './dux-inventory-reader';
import type { DuxFetch } from './dux-api';
import type { Env } from './platform';

const env: Env = Object.freeze({
  DUX_API_ENABLED: 'true',
  DUX_API_TOKEN: 'test-only-dux-access-token-not-a-secret',
  DUX_COMPANY_ID: '1',
  DUX_BRANCH_ID: '2',
  DUX_DEPOSIT_ID: '3',
});

describe('reader cuantitativo de inventario Dux', () => {
  it('excluye triple null sin convertirlo a cero y conserva un faltante real para fail-closed', async () => {
    const excludedSentinel = 'provider-unquantified-name-never-log';
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImplementation: DuxFetch = (input) => {
      const url = inputUrl(input);
      expect(url.pathname).toBe('/WSERP/rest/services/v2/items');
      expect(url.searchParams.get('id_deposito')).toBe('3');
      expect(url.searchParams.get('habilitado')).toBe('true');
      return Promise.resolve(jsonResponse(page([
        item('CUANTIFICADO', [stock(3, 5)]),
        item('NO-CUANTIFICADO', [unquantifiedStock(3)], excludedSentinel),
        item('SIN-DEPOSITO', [stock(99, 8)]),
      ])));
    };

    try {
      const reader = createDuxInventoryReader(env, fetchImplementation);
      const items = await reader.listItems({ warehouseId: 3, enabled: true });

      expect(items.map((entry) => entry.code)).toEqual(['CUANTIFICADO', 'SIN-DEPOSITO']);
      expect(items[0]?.stocks[0]?.availableQuantity).toBe(5);
      expect(items[1]?.stocks[0]?.warehouseId).toBe(99);
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        'dux_inventory_unquantified_stock',
        {
          version: 1,
          endpoint: '/v2/items',
          excludedItems: 1,
          unquantifiedStockEntries: 1,
        },
      );
      expect(JSON.stringify(warning.mock.calls)).not.toContain(excludedSentinel);
    } finally {
      warning.mockRestore();
    }
  });

  it('preserva el cero numérico como stock cuantificado', async () => {
    const reader = createDuxInventoryReader(env, () => Promise.resolve(jsonResponse(page([
      item('CERO', [stock(3, 0)]),
    ]))));

    const items = await reader.listItems({ warehouseId: 3, enabled: true });

    expect(items).toHaveLength(1);
    expect(items[0]?.stocks[0]).toMatchObject({
      warehouseId: 3,
      realQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
    });
  });

  it.each([
    ['null parcial', { ...unquantifiedStock(3), stock_reservado: 0 }],
    ['id inválido', { ...unquantifiedStock(3), id: '3' }],
    ['texto numérico', { ...stock(3, 5), stock_disponible: '5' }],
  ])('mantiene fail-closed ante %s', async (_caseName, invalidStock) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reader = createDuxInventoryReader(env, () => Promise.resolve(jsonResponse(page([
      item('INVALIDO', [invalidStock]),
    ]))));

    try {
      await expect(reader.listItems({ warehouseId: 3, enabled: true })).rejects.toMatchObject({
        code: 'DUX_RESPONSE_INVALID',
      });
    } finally {
      warning.mockRestore();
    }
  });
});

function item(code: string, stocks: readonly unknown[], name = `Item ${code}`) {
  return {
    cod_item: code,
    codigo_externo: null,
    item: name,
    codigos_barra: null,
    habilitado: true,
    ctd_unidades_por_bulto: 1,
    stock: stocks,
  };
}

function stock(warehouseId: number, quantity: number) {
  return {
    id: warehouseId,
    nombre: `Depósito ${warehouseId}`,
    stock_real: quantity,
    stock_reservado: 0,
    stock_disponible: quantity,
    id_det_item: null,
    cod_barra_detalle: null,
    talle: null,
    color: null,
  };
}

function unquantifiedStock(warehouseId: number) {
  return {
    ...stock(warehouseId, 0),
    stock_real: null,
    stock_reservado: null,
    stock_disponible: null,
  };
}

function page(data: readonly unknown[]) {
  return {
    datos: data,
    paginacion: {
      total: data.length,
      offset: 0,
      limit: 50,
      hay_mas: false,
    },
    id_solicitud: 'request-never-exposed',
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function inputUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}
