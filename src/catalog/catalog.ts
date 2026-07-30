import type { Product, ProductPrice } from './model';

export const ALL_CATEGORIES = 'all';
export const CATALOG_PAGE_SIZE = 24;

export type CatalogFilter = Readonly<{
  query: string;
  categorySlug: string;
}>;

export type CatalogCategoryOption = Readonly<{
  slug: string;
  name: string;
}>;

export type CatalogPageResult = Readonly<{
  items: readonly Product[];
  page: number;
  totalPages: number;
}>;

const diacriticPattern = /\p{Diacritic}/gu;
const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(diacriticPattern, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-AR');
}

export function getProductCategories(
  products: readonly Product[],
): readonly CatalogCategoryOption[] {
  const categoriesBySlug = new Map<string, CatalogCategoryOption>();

  for (const product of products) {
    product.categorySlugs.forEach((slug, index) => {
      const name = product.categoryNames[index];
      if (name !== undefined && !categoriesBySlug.has(slug)) {
        categoriesBySlug.set(slug, Object.freeze({ slug, name }));
      }
    });
  }

  return Object.freeze(
    [...categoriesBySlug.values()].sort((left, right) =>
      left.name.localeCompare(right.name, 'es-AR', { sensitivity: 'base' }),
    ),
  );
}

export function filterProducts(
  products: readonly Product[],
  filter: CatalogFilter,
): readonly Product[] {
  const normalizedQuery = normalizeSearchText(filter.query);
  const queryTerms = normalizedQuery === '' ? [] : normalizedQuery.split(' ');

  return products.filter((product) => {
    if (
      filter.categorySlug !== ALL_CATEGORIES &&
      !product.categorySlugs.includes(filter.categorySlug)
    ) {
      return false;
    }

    if (queryTerms.length === 0) {
      return true;
    }

    const searchableText = normalizeSearchText(
      [
        product.name,
        ...product.categoryNames,
        product.presentation,
        product.sku,
        product.shortDescription,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' '),
    );

    return queryTerms.every((term) => searchableText.includes(term));
  });
}

export function paginateProducts(
  products: readonly Product[],
  requestedPage: number,
  pageSize = CATALOG_PAGE_SIZE,
): CatalogPageResult {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('El tamaño de página debe ser un entero positivo.');
  }

  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const page = Math.min(Math.max(Number.isInteger(requestedPage) ? requestedPage : 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return Object.freeze({
    items: Object.freeze(products.slice(start, start + pageSize)),
    page,
    totalPages,
  });
}

export function formatProductPrice(price: ProductPrice | undefined): string | null {
  return price === undefined ? null : arsFormatter.format(price.amount);
}

export function formatCapturedDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function formatAvailability(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value === 'available' ? 'Disponible' : value;
}
