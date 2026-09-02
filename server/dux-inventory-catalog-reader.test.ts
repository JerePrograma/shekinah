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

describe('captura comercial del reader Dux', () => {
  it('conserva en catálogo un item cuyo stock triple-null se excluye del snapshot cuantitativo', async () => {
    const fetchImplementation: DuxFetch = () => Promise.resolve(new Response(JSON.stringify({
      datos: [
        item('CUANTIFICADO', 5),
        item('NO-CUANTIFICADO', null),
      ],
      paginacion: {
        total: 2,
        offset: 0,
        limit: 50,
        hay_mas: false,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const reader = createDuxInventoryReader(env, fetchImplementation);
      const inventory = await reader.listItems({ warehouseId: 3, enabled: true });
      const catalog = reader.takeCatalogItems();

      expect(inventory.map(({ code }) => code)).toEqual(['CUANTIFICADO']);
      expect(catalog).toHaveLength(2);
      expect(catalog.find(({ code }) => code === 'NO-CUANTIFICADO')).toMatchObject({
        name: 'Producto NO-CUANTIFICADO',
        prices: [
          { id: 1, name: 'PRECIOS DEL NEGOCIO', amount: 1_000 },
          { id: 2, name: 'MERCADO LIBRE', amount: 1_500 },
        ],
        category: { id: 10, name: 'Hierbas' },
      });
      expect(() => reader.takeCatalogItems()).toThrow(
        'La lectura Dux no capturó todavía el catálogo completo.',
      );
    } finally {
      warning.mockRestore();
    }
  });
});

function item(code: string, quantity: number | null) {
  return {
    cod_item: code,
    codigo_externo: null,
    item: `Producto ${code}`,
    codigos_barra: null,
    habilitado: true,
    ctd_unidades_por_bulto: 1,
    precios: [
      { id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 1_000 },
      { id: 2, nombre: 'MERCADO LIBRE', precio: 1_500 },
    ],
    rubro: { id: 10, nombre: 'Hierbas' },
    sub_rubro: null,
    imagen_url: null,
    stock: [{
      id: 3,
      nombre: 'Principal',
      stock_real: quantity,
      stock_reservado: quantity === null ? null : 0,
      stock_disponible: quantity,
      id_det_item: null,
      cod_barra_detalle: null,
      talle: null,
      color: null,
    }],
  };
}
