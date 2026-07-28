import type { Product, ProductPrice } from './model';

export const ALL_CATEGORIES = 'all';

export type CatalogFilter = Readonly<{
  query: string;
  category: string;
}>;

const diacriticPattern = /\p{Diacritic}/gu;

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(diacriticPattern, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-AR');
}

export function getProductCategories(products: readonly Product[]): readonly string[] {
  const categoriesByKey = new Map<string, string>();

  for (const product of products) {
    const category = product.category.trim();
    const key = normalizeSearchText(category);

    if (!categoriesByKey.has(key)) {
      categoriesByKey.set(key, category);
    }
  }

  return Object.freeze(
    [...categoriesByKey.values()].sort((left, right) =>
      left.localeCompare(right, 'es-AR', { sensitivity: 'base' }),
    ),
  );
}

export function filterProducts(
  products: readonly Product[],
  filter: CatalogFilter,
): readonly Product[] {
  const normalizedQuery = normalizeSearchText(filter.query);
  const queryTerms = normalizedQuery === '' ? [] : normalizedQuery.split(' ');
  const normalizedCategory = normalizeSearchText(filter.category);

  return products.filter((product) => {
    const matchesCategory =
      filter.category === ALL_CATEGORIES ||
      normalizeSearchText(product.category) === normalizedCategory;

    if (!matchesCategory) {
      return false;
    }

    if (queryTerms.length === 0) {
      return true;
    }

    const searchableText = normalizeSearchText(
      [product.name, product.category, product.presentation].join(' '),
    );

    return queryTerms.every((term) => searchableText.includes(term));
  });
}

export function formatProductPrice(price: ProductPrice | undefined): string | null {
  return price === undefined ? null : arsFormatter.format(price.amount);
}
