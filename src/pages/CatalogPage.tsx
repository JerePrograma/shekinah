import { CatalogSection } from '../catalog/CatalogSection';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { useRuntimeCatalogProducts } from '../data/runtime-catalog';
import type { Navigate } from '../routing/routes';
type CatalogPageProps = Readonly<{ categorySlug?: string; navigate: Navigate }>;
export function CatalogPage({ categorySlug, navigate }: CatalogPageProps) {
  const products = useRuntimeCatalogProducts();
  const category = categorySlug === undefined ? undefined : authorizedCategories.find(({ slug }) => slug === categorySlug);
  if (categorySlug !== undefined && category === undefined) throw new Error(`No existe la categoría pública "${categorySlug}".`);
  const categoryProducts = category === undefined ? products : products.filter((product) => product.categorySlugs.includes(category.slug));
  const categoryProps = category === undefined ? {} : { fixedCategorySlug: category.slug, summary: `${categoryProducts.length} productos en esta categoría.`, title: category.name };
  return <CatalogSection {...categoryProps} headingLevel={1} navigate={navigate} products={products} />;
}
