import categoryData from './generated/categories.json';
import productData from './generated/products.json';
import storeData from './generated/site.json';

export type EvidenceProvenance =
  | 'hostinger-original'
  | 'hostinger-public'
  | 'wordpress-reference'
  | 'repository-snapshot'
  | 'inferred'
  | 'unknown';

export interface EvidenceReference {
  source: string;
  sourceType: EvidenceProvenance;
  capturedAt: string;
  sha256?: string;
  note?: string;
}

export interface ProductImage {
  src: string;
  alt: string;
  originalUrl?: string;
  sha256?: string;
}

export interface Product {
  id: string;
  originalId: string | null;
  name: string;
  slug: string;
  path: string;
  originalPath: string;
  description: string | null;
  shortDescription: string | null;
  price: number | null;
  salePrice: number | null;
  currency: 'ARS' | string | null;
  unit: string | null;
  minimumFraction: number | null;
  sku: string | null;
  categoryIds: string[];
  images: ProductImage[];
  variants: Array<{ id: string; name: string; value: string }>;
  availability: string | null;
  capturedAt: string;
  provenance: EvidenceProvenance;
  evidence: EvidenceReference[];
  warnings: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  path: string;
  provenance: EvidenceProvenance;
}

export const categories = categoryData as Category[];
export const products = [...(productData as Product[])].sort((left, right) => left.id.localeCompare(right.id));

export const catalogRoutes = [
  '/tienda/',
  ...categories.map((category) => category.path),
  ...products.map((product) => product.path),
] as const;

export const verifiedStore = storeData as {
  originalDomain: string;
  storeIdMarker: string;
  whatsappNumber: string;
  whatsappVisible: string;
  locale: string;
  priceEvidenceDate: string;
  checkoutRecovered: boolean;
};

export function findProduct(pathValue: string): Product | undefined {
  const normalized = pathValue === '/' ? '/' : `/${pathValue.replace(/^\/+|\/+$/gu, '')}/`;
  return products.find((product) => product.path === normalized);
}

export function findCategory(pathValue: string): Category | undefined {
  const normalized = pathValue === '/' ? '/' : `/${pathValue.replace(/^\/+|\/+$/gu, '')}/`;
  return categories.find((category) => category.path === normalized);
}

export function categoryName(categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

export function formatPrice(product: Pick<Product, 'price' | 'currency'>): string | null {
  if (product.price === null || product.currency === null) return null;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: product.currency,
    maximumFractionDigits: 2,
  }).format(product.price);
}
