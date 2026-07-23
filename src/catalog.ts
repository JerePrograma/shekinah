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

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  isAvailable: boolean;
  manageInventory: boolean;
  options: Array<Record<string, unknown>>;
  price: number | null;
  salePrice: number | null;
  currency: string | null;
}

export interface Product {
  id: string;
  originalId: string | null;
  name: string;
  slug: string;
  path: string;
  originalPath: string;
  description: string | null;
  descriptionHtml?: string | null;
  shortDescription: string | null;
  subtitle?: string | null;
  price: number | null;
  salePrice: number | null;
  currency: 'ARS' | string | null;
  unit: string | null;
  minimumFraction: number | null;
  minimumFractionUnit?: string | null;
  sku: string | null;
  categoryIds: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  availability: string | null;
  purchasable?: boolean;
  ribbonText?: string | null;
  type?: string | null;
  sourceOrder?: number;
  sourceUpdatedAt?: string | null;
  capturedAt: string;
  provenance: EvidenceProvenance;
  evidence: EvidenceReference[];
  warnings: string[];
}

export interface Category {
  id: string;
  originalId?: string;
  name: string;
  slug: string;
  path: string;
  provenance: EvidenceProvenance;
  createdAt?: string | null;
  updatedAt?: string | null;
  image?: string | null;
  sourceOrder?: number;
}

export const categories = categoryData as Category[];
export const products = productData as Product[];

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
  catalogCount?: number;
  catalogSourceWatermark?: string;
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
