import { catalogProductFixtures } from '../test/fixtures/catalog-products';
import {
  ALL_CATEGORIES,
  CATALOG_PAGE_SIZE,
  filterProducts,
  formatCapturedDate,
  formatProductPrice,
  getProductCategories,
  normalizeSearchText,
  paginateProducts,
} from './catalog';
import {
  InvalidProductError,
  parseCategories,
  parseProduct,
  parseProductDetail,
  parseProducts,
} from './model';

const baseProduct = {
  id: 'oregano',
  slug: 'oregano',
  path: '/oregano/',
  name: 'Orégano',
  categorySlugs: ['hierbas'],
  categoryNames: ['Hierbas'],
  price: { amount: 1500, currency: 'ARS' },
  capturedAt: '2026-07-23',
} as const;

describe('modelo de producto', () => {
  it('acepta campos opcionales ausentes y conserva objetos inmutables', () => {
    const product = parseProduct(baseProduct);

    expect(product).toEqual(baseProduct);
    expect(product.presentation).toBeUndefined();
    expect(product.sku).toBeUndefined();
    expect(Object.isFrozen(product)).toBe(true);
    expect(Object.isFrozen(product.price)).toBe(true);
  });

  it('acepta precio promocional, imagen, detalle y variante sanitizados', () => {
    const product = parseProduct({
      ...baseProduct,
      salePrice: { amount: 1200, currency: 'ARS' },
      primaryImage: {
        src: '/images/original/catalog/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp',
        alt: 'Orégano seco',
      },
      sku: 'ORE-001',
    });
    const detail = parseProductDetail(product, {
      description: 'Descripción segura',
      images: [product.primaryImage],
      variants: [
        {
          title: 'Bolsa grande',
          price: { amount: 2500, currency: 'ARS' },
          available: true,
          options: [{ name: 'Tamaño', value: 'Grande' }],
        },
      ],
    });

    expect(formatProductPrice(product.salePrice)).toContain('1.200');
    expect(detail.description).toBe('Descripción segura');
    expect(detail.variants[0]?.options[0]).toEqual({ name: 'Tamaño', value: 'Grande' });
  });

  it('rechaza importes, monedas y fechas inválidos', () => {
    expect(() => parseProduct({ ...baseProduct, price: { amount: 0, currency: 'ARS' } })).toThrow(
      InvalidProductError,
    );
    expect(() =>
      parseProduct({ ...baseProduct, price: { amount: Number.POSITIVE_INFINITY, currency: 'ARS' } }),
    ).toThrow(InvalidProductError);
    expect(() => parseProduct({ ...baseProduct, price: { amount: 10, currency: 'USD' } })).toThrow(
      InvalidProductError,
    );
    expect(() => parseProduct({ ...baseProduct, capturedAt: '23/07/2026' })).toThrow(
      InvalidProductError,
    );
  });

  it('rechaza IDs, slugs y paths duplicados', () => {
    expect(() => parseProducts([baseProduct, { ...baseProduct, name: 'Otro' }])).toThrow(
      InvalidProductError,
    );
    expect(() => parseProduct({ ...baseProduct, path: '/otra-ruta/' })).toThrow(
      InvalidProductError,
    );
  });

  it('rechaza categorías inexistentes e imágenes no locales', () => {
    const categories = parseCategories([
      {
        slug: 'especias',
        path: '/tienda/categoria/especias/',
        name: 'Especias',
        productCount: 1,
      },
    ]);

    expect(() => parseProducts([baseProduct], categories)).toThrow(/no existe/u);
    expect(() =>
      parseProduct({
        ...baseProduct,
        primaryImage: { src: '/images/inexistente.jpg', alt: 'Imagen' },
      }),
    ).toThrow(/ruta local autorizada/u);
  });
});

describe('consulta del catálogo', () => {
  it('normaliza mayúsculas, espacios y acentos', () => {
    expect(normalizeSearchText('  PIMENTÓN   DULCE  ')).toBe('pimenton dulce');
  });

  it('deriva categorías por slug y las ordena por nombre', () => {
    expect(getProductCategories(catalogProductFixtures)).toEqual([
      { slug: 'especias', name: 'Especias' },
      { slug: 'hierbas', name: 'Hierbas' },
    ]);
  });

  it('busca por nombre con acentos y espacios repetidos', () => {
    expect(
      filterProducts(catalogProductFixtures, {
        query: '  PIMENTON   dulce ',
        categorySlug: ALL_CATEGORIES,
      }).map(({ slug }) => slug),
    ).toEqual(['pimenton-dulce']);
  });

  it('busca por SKU, categoría, presentación y descripción corta', () => {
    for (const query of ['PIM-DULCE', 'especias', 'frasco', 'aromática']) {
      expect(
        filterProducts(catalogProductFixtures, {
          query,
          categorySlug: ALL_CATEGORIES,
        }).map(({ slug }) => slug),
      ).toEqual(['pimenton-dulce']);
    }
  });

  it('combina búsqueda y categoría', () => {
    expect(
      filterProducts(catalogProductFixtures, {
        query: 'pimenton',
        categorySlug: 'especias',
      }),
    ).toHaveLength(1);
    expect(
      filterProducts(catalogProductFixtures, {
        query: 'menta',
        categorySlug: 'especias',
      }),
    ).toEqual([]);
  });

  it('pagina de a 24 sin renderizar la colección completa', () => {
    const products = Array.from({ length: 50 }, (_, index) => ({
      ...catalogProductFixtures[0]!,
      id: `menta-${index}`,
      slug: `menta-${index}`,
      path: `/menta-${index}/`,
    }));

    expect(paginateProducts(products, 1).items).toHaveLength(CATALOG_PAGE_SIZE);
    expect(paginateProducts(products, 2).items).toHaveLength(CATALOG_PAGE_SIZE);
    expect(paginateProducts(products, 3).items).toHaveLength(2);
    expect(paginateProducts(products, 99)).toMatchObject({ page: 3, totalPages: 3 });
  });

  it('formatea precio y fecha para Argentina', () => {
    expect(formatProductPrice(baseProduct.price)).toContain('1.500');
    expect(formatCapturedDate('2026-07-23')).toBe('23/07/2026');
  });
});
