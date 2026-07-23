import categoryData from './generated-public/categories.json';
import productData from './generated-public/products.json';
import storeData from './generated/site.json';

export interface ProductImage {
  src: string;
  alt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  path: string;
  description: string | null;
  shortDescription: string | null;
  price: number | null;
  currency: 'ARS' | string | null;
  unit: string | null;
  sku: string | null;
  categoryIds: string[];
  images: ProductImage[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  path: string;
}

export const categories = categoryData as Category[];
export const products = productData as Product[];

export const catalogRoutes = [
  '/tienda/',
  ...categories.map((category) => category.path),
  ...products.map((product) => product.path),
] as const;

export const verifiedStore = storeData as {
  whatsappNumber: string;
  whatsappVisible: string;
  locale: string;
  checkoutEnabled: boolean;
  catalogCount?: number;
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
