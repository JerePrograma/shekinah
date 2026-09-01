import { catalogProductFixtures } from '../test/fixtures/catalog-products';
import {
  ALL_CATEGORIES,
  CATALOG_PAGE_SIZE,
  filterProducts,
  formatAvailability,
  formatProductPrice,
  getProductCategories,
  normalizeSearchText,
  paginateProducts,
} from './catalog';
import {
  InvalidProductError,
  isManagedCatalogImagePath,
  isProductEffectivelyAvailable,
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

  it('rechaza importes y monedas inválidos', () => {
    expect(() => parseProduct({ ...baseProduct, price: { amount: 0, currency: 'ARS' } })).toThrow(
      InvalidProductError,
    );
    expect(() =>
      parseProduct({ ...baseProduct, price: { amount: Number.POSITIVE_INFINITY, currency: 'ARS' } }),
    ).toThrow(InvalidProductError);
    expect(() => parseProduct({ ...baseProduct, price: { amount: 10, currency: 'USD' } })).toThrow(
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

  it('rechaza stock local y sólo Dux puede habilitar disponibilidad efectiva', () => {
    const legacy = parseProduct(baseProduct);
    const duxVerified = parseProduct({
      ...baseProduct,
      commerce: {
        source: 'dux',
        catalogVersion: 'd'.repeat(64),
        syncedAt: '2026-09-01T12:00:00.000Z',
        availabilityState: 'verified',
        checkoutEligible: true,
        mappingStatus: 'mapped',
        quantitySemanticsStatus: 'verified',
        observedStock: { real: 3, reserved: 0, available: 3 },
      },
    });

    expect(Object.hasOwn(legacy, 'stockQuantity')).toBe(false);
    expect(isProductEffectivelyAvailable(legacy)).toBe(false);
    expect(isProductEffectivelyAvailable(duxVerified)).toBe(true);
    expect(isProductEffectivelyAvailable({ ...duxVerified, availability: 'unavailable' })).toBe(false);

    for (const stockQuantity of [3, 0, -1, 1.5, Number.NaN, null]) {
      expect(() => parseProduct({ ...baseProduct, stockQuantity }))
        .toThrow(/exclusivamente a Dux/u);
    }
  });

  it('explica la causa efectiva de indisponibilidad sin contradicciones', () => {
    expect(formatAvailability('available', 0)).toBe('Agotado');
    expect(formatAvailability('unavailable', 8)).toBe('No disponible');
    expect(formatAvailability('available', 8)).toBe('Disponibilidad pendiente de Dux');
    expect(formatAvailability('available', 8, 'verified')).toBe('8 unidades disponibles');
    expect(formatAvailability('available', 1, 'verified')).toBe('1 unidad disponible');
    expect(formatAvailability('unavailable', undefined, 'updating')).toBe('Actualizando disponibilidad');
    expect(formatAvailability('unavailable', undefined, 'unavailable')).toBe('Disponibilidad temporalmente no verificable');
    expect(formatAvailability(undefined)).toBeNull();
  });

  it('acepta una referencia runtime segura sin exponer IDs del proveedor', () => {
    const product = parseProduct({
      ...baseProduct,
      commerce: {
        source: 'mercadolibre',
        catalogVersion: 'a'.repeat(64),
        syncedAt: '2026-08-24T10:00:00.000Z',
        availabilityState: 'verified',
        checkoutEligible: true,
      },
    });

    expect(product.commerce).toEqual({
      source: 'mercadolibre',
      catalogVersion: 'a'.repeat(64),
      syncedAt: '2026-08-24T10:00:00.000Z',
      availabilityState: 'verified',
      checkoutEligible: true,
    });
    expect(product.commerce).not.toHaveProperty('itemId');
    expect(product.commerce).not.toHaveProperty('variationId');
  });

  it('conserva exactamente el stock decimal y negativo observado en Dux', () => {
    const product = parseProduct({
      ...baseProduct,
      availability: 'unavailable',
      commerce: {
        source: 'dux',
        catalogVersion: 'b'.repeat(64),
        syncedAt: '2026-08-26T12:30:45.000Z',
        availabilityState: 'unavailable',
        checkoutEligible: false,
        mappingStatus: 'mapped',
        quantitySemanticsStatus: 'unavailable_from_v2_items',
        observedStock: {
          real: 738.5,
          reserved: 36.4,
          available: -2.44,
        },
        unit: { id: '7', name: 'Kilogramo', symbol: 'kg' },
        depositName: 'Casa central',
      },
    });

    expect(product.commerce).toMatchObject({
      source: 'dux',
      observedStock: { real: 738.5, reserved: 36.4, available: -2.44 },
      unit: { id: '7', name: 'Kilogramo', symbol: 'kg' },
    });
    expect(Object.hasOwn(product, 'stockQuantity')).toBe(false);
    expect(isProductEffectivelyAvailable(product)).toBe(false);
    expect(Object.isFrozen(product.commerce)).toBe(true);
    expect(Object.isFrozen(product.commerce?.source === 'dux'
      ? product.commerce.observedStock
      : undefined)).toBe(true);
  });

  it('rechaza números Dux no finitos, estados incoherentes y doble autoridad de stock', () => {
    const duxCommerce = {
      source: 'dux',
      catalogVersion: 'c'.repeat(64),
      syncedAt: '2026-08-26T12:30:45.000Z',
      availabilityState: 'verified',
      checkoutEligible: false,
      mappingStatus: 'mapped',
      quantitySemanticsStatus: 'verified',
      observedStock: { real: 10.5, reserved: 1.25, available: 9.25 },
    } as const;

    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => parseProduct({
        ...baseProduct,
        commerce: {
          ...duxCommerce,
          observedStock: { ...duxCommerce.observedStock, available: invalid },
        },
      })).toThrow(/números finitos/u);
    }

    expect(() => parseProduct({
      ...baseProduct,
      stockQuantity: 10,
      commerce: duxCommerce,
    })).toThrow(/stock local/u);
    expect(() => parseProduct({
      ...baseProduct,
      commerce: {
        ...duxCommerce,
        checkoutEligible: true,
        mappingStatus: 'unmapped',
      },
    })).toThrow(/no confirmó/u);
  });

  it('acepta sólo rutas administradas con UUID v4 exacto', () => {
    const source = '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.webp';
    expect(isManagedCatalogImagePath(source)).toBe(true);
    expect(parseProduct({
      ...baseProduct,
      primaryImage: { src: source, alt: 'Orégano' },
    }).primaryImage?.src).toBe(source);
    expect(isManagedCatalogImagePath('/api/catalog-images/../secreto.webp')).toBe(false);
    expect(isManagedCatalogImagePath('/api/catalog-images/123e4567-e89b-12d3-a456-426614174000.webp')).toBe(false);
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

  it('formatea precios para Argentina', () => {
    expect(formatProductPrice(baseProduct.price)).toContain('1.500');
  });
});
