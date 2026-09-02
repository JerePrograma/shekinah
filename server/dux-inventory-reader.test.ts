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

  it('mantiene la paginación original al excluir stock no cuantificado en una página intermedia', async () => {
    const offsets: number[] = [];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImplementation: DuxFetch = (input) => {
      const url = inputUrl(input);
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      if (offset === 0) {
        const data = Array.from({ length: 50 }, (_, index) => (
          index === 24
            ? item('NO-CUANTIFICADO', [unquantifiedStock(3)])
            : item(`ITEM-${index}`, [stock(3, index + 1)])
        ));
        return Promise.resolve(jsonResponse(pageAt(data, 51, 0, true)));
      }
      if (offset === 50) {
        return Promise.resolve(jsonResponse(pageAt([
          item('ITEM-50', [stock(3, 51)]),
        ], 51, 50, false)));
      }
      throw new Error(`Offset inesperado: ${offset}`);
    };

    try {
      const reader = createDuxInventoryReader(env, fetchImplementation);
      const items = await reader.listItems({ warehouseId: 3, enabled: true });

      expect(offsets).toEqual([0, 50]);
      expect(items).toHaveLength(50);
      expect(items.some((entry) => entry.code === 'NO-CUANTIFICADO')).toBe(false);
      expect(items.at(-1)?.code).toBe('ITEM-50');
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        'dux_inventory_unquantified_stock',
        {
          version: 1,
          endpoint: '/v2/items',
          excludedItems: 1,
          unquantifiedStockEntries: 1,
        },
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('conserva un stock cuantificado del depósito aunque otra variante del mismo item venga no cuantificada', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reader = createDuxInventoryReader(env, () => Promise.resolve(jsonResponse(page([
      item('MIXTO', [
        { ...unquantifiedStock(3), id_det_item: 10 },
        { ...stock(3, 7), id_det_item: 11 },
      ]),
    ]))));

    try {
      const items = await reader.listItems({ warehouseId: 3, enabled: true });

      expect(items).toHaveLength(1);
      expect(items[0]?.code).toBe('MIXTO');
      expect(items[0]?.stocks).toHaveLength(1);
      expect(items[0]?.stocks[0]).toMatchObject({
        warehouseId: 3,
        variantDetailId: 11,
        availableQuantity: 7,
      });
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        'dux_inventory_unquantified_stock',
        {
          version: 1,
          endpoint: '/v2/items',
          excludedItems: 0,
          unquantifiedStockEntries: 1,
        },
      );
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
  return pageAt(data, data.length, 0, false);
}

function pageAt(
  data: readonly unknown[],
  total: number,
  offset: number,
  hasMore: boolean,
) {
  return {
    datos: data,
    paginacion: {
      total,
      offset,
      limit: 50,
      hay_mas: hasMore,
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
