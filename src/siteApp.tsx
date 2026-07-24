import { App } from './App';
import { categories, findCategory, findProduct, products } from './catalog';
import { CartDialog, CartProvider } from './cart';
import { canonicalRoutes as contentRoutes, normalizePath } from './content';
import { ProductPage, ShopPage } from './storePages';
import './catalog.css';
import './catalog-pagination.css';

export const canonicalRoutes: string[] = [
  ...new Set([...contentRoutes, ...categories.map((item) => item.path), ...products.map((item) => item.path)]),
].sort((left, right) => (left === '/' ? -1 : right === '/' ? 1 : left.localeCompare(right)));

export function routeExists(pathValue: string): boolean {
  const path = normalizePath(pathValue);
  return canonicalRoutes.includes(path) || path === '/category/uncategorized/';
}

function RoutedSite({ path }: { path: string }) {
  const product = findProduct(path);
  const category = findCategory(path);
  if (path === '/tienda/') return <ShopPage />;
  if (category) return <ShopPage categoryId={category.id} />;
  if (product) return <ProductPage product={product} />;
  return <App path={path} />;
}

export function SiteApp({ path: rawPath }: { path: string }) {
  const path = normalizePath(rawPath);
  return (
    <CartProvider>
      <RoutedSite path={path} />
      <CartDialog />
    </CartProvider>
  );
}
