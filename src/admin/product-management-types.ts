import type { CatalogProductDetail } from '../catalog/model';

export const ALL_FILTERS = 'all';
export const UNCATEGORIZED_FILTER = 'uncategorized';

export type ProductFormState = Readonly<{
  slug: string;
  name: string;
  categorySlugs: readonly string[];
  presentation: string;
  price: string;
  salePrice: string;
  sku: string;
  availability: 'available' | 'unavailable';
  shortDescription: string;
  description: string;
  images: CatalogProductDetail['images'];
  variants: string;
}>;

export type ProductFieldName =
  | 'slug'
  | 'name'
  | 'categorySlugs'
  | 'price'
  | 'salePrice'
  | 'image';

export type ProductFieldErrors = Partial<Record<ProductFieldName, string>>;
export type AvailabilityFilter = 'all' | 'available' | 'unavailable';
export type StockFilter = 'all' | 'in-stock' | 'out-of-stock' | 'unverified';
export type ProductSort =
  | 'name'
  | 'category'
  | 'price-asc'
  | 'price-desc'
  | 'stock-asc'
  | 'stock-desc';
export type PendingNavigation =
  | Readonly<{ kind: 'new' }>
  | Readonly<{ kind: 'close' }>
  | Readonly<{ kind: 'edit'; product: CatalogProductDetail }>;
export type ProductOperation =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'saving'; stage: 'product' | 'image' }>
  | Readonly<{ kind: 'quick'; productId: string; action: 'availability' }>
  | Readonly<{ kind: 'deleting'; productId: string }>;

export type CatalogSummary = Readonly<{
  total: number;
  available: number;
  manuallyUnavailable: number;
  outOfStock: number;
}>;
