import {
  ALL_CATEGORIES,
  filterProducts,
  formatProductPrice,
  getProductCategories,
  normalizeSearchText,
} from './catalog';
import {
  InvalidProductError,
  parseProduct,
  parseProducts,
} from './model';
import { catalogProductFixtures } from '../test/fixtures/catalog-products';

describe('modelo de producto', () => {
  it('acepta un producto válido y conserva la ausencia de precio', () => {
    const product = parseProduct({
      id: 'oregano',
      name: 'Orégano',
      category: 'Hierbas',
      presentation: 'Bolsa',
    });

    expect(product).toEqual({
      id: 'oregano',
      name: 'Orégano',
      category: 'Hierbas',
      presentation: 'Bolsa',
    });
    expect(formatProductPrice(product.price)).toBeNull();
  });

  it('acepta un precio válido en ARS', () => {
    const product = parseProduct({
      id: 'comino',
      name: 'Comino',
      category: 'Especias',
      presentation: 'Frasco',
      price: {
        amount: 1250,
        currency: 'ARS',
      },
    });

    expect(formatProductPrice(product.price)).toContain('1.250');
  });

  it('rechaza productos incompletos o con precios inválidos', () => {
    expect(() =>
      parseProduct({
        id: 'sin-nombre',
        name: ' ',
        category: 'Hierbas',
        presentation: 'Bolsa',
      }),
    ).toThrow(InvalidProductError);

    expect(() =>
      parseProduct({
        id: 'precio-invalido',
        name: 'Producto',
        category: 'Especias',
        presentation: 'Frasco',
        price: {
          amount: 0,
          currency: 'ARS',
        },
      }),
    ).toThrow(InvalidProductError);
  });

  it('rechaza identificadores duplicados', () => {
    expect(() =>
      parseProducts([
        {
          id: 'duplicado',
          name: 'Primero',
          category: 'Hierbas',
          presentation: 'Bolsa',
        },
        {
          id: 'duplicado',
          name: 'Segundo',
          category: 'Especias',
          presentation: 'Frasco',
        },
      ]),
    ).toThrow(InvalidProductError);
  });
});

describe('consulta del catálogo', () => {
  it('normaliza mayúsculas, espacios y acentos', () => {
    expect(normalizeSearchText('  PIMENTÓN   DULCE  ')).toBe('pimenton dulce');
  });

  it('deriva categorías únicas y ordenadas', () => {
    const products = parseProducts([
      ...catalogProductFixtures,
      {
        id: 'otra-hierba',
        name: 'Otra hierba',
        category: 'hierbas',
        presentation: 'Bolsa',
      },
    ]);

    expect(getProductCategories(products)).toEqual(['Especias', 'Hierbas']);
  });

  it('busca sin distinguir mayúsculas, espacios ni acentos', () => {
    expect(
      filterProducts(catalogProductFixtures, {
        query: '  PIMENTON   dulce ',
        category: ALL_CATEGORIES,
      }).map((product) => product.id),
    ).toEqual(['pimenton-dulce']);
  });

  it('combina búsqueda y categoría', () => {
    expect(
      filterProducts(catalogProductFixtures, {
        query: 'frasco',
        category: 'Especias',
      }).map((product) => product.id),
    ).toEqual(['pimenton-dulce']);

    expect(
      filterProducts(catalogProductFixtures, {
        query: 'menta',
        category: 'Especias',
      }),
    ).toEqual([]);
  });

  it('mantiene vacío un catálogo sin productos', () => {
    expect(
      filterProducts([], {
        query: 'cualquier búsqueda',
        category: ALL_CATEGORIES,
      }),
    ).toEqual([]);
    expect(getProductCategories([])).toEqual([]);
  });
});
