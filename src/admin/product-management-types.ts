import type { CatalogProductDetail } from '../catalog/model';

export const ALL_FILTERS = 'all';
export const UNCATEGORIZED_FILTER = 'uncategorized';

export type AvailabilityFilter = 'all' | 'published' | 'unpublished';
export type StockFilter = 'all' | 'in-stock' | 'out-of-stock' | 'unverified';
export type ProductSort =
  | 'name'
  | 'category'
  | 'price-asc'
  | 'price-desc'
  | 'stock-asc'
  | 'stock-desc';
export type PendingNavigation =
  | Readonly<{ kind: 'close' }>
  | Readonly<{ kind: 'edit'; product: CatalogProductDetail }>;
export type ProductOperation =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'saving'; stage: 'product' | 'image' }>
  | Readonly<{ kind: 'quick'; productId: string; action: 'availability' }>
  | Readonly<{ kind: 'deleting'; productId: string }>;
