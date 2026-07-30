import { CatalogSection } from '../catalog/CatalogSection';
import {
  authorizedCategories,
  authorizedProducts,
} from '../data/authorized-commercial-data';
import type { Navigate } from '../routing/routes';

type CatalogPageProps = Readonly<{
  categorySlug?: string;
  navigate: Navigate;
}>;

export function CatalogPage({ categorySlug, navigate }: CatalogPageProps) {
  const category =
    categorySlug === undefined
      ? undefined
      : authorizedCategories.find(({ slug }) => slug === categorySlug);

  if (categorySlug !== undefined && category === undefined) {
    throw new Error(`No existe la categoría pública "${categorySlug}".`);
  }

  const categoryProps =
    category === undefined
      ? {}
      : {
          fixedCategorySlug: category.slug,
          summary: `${category.productCount} productos registrados en esta categoría.`,
          title: category.name,
        };

  return (
    <CatalogSection
      {...categoryProps}
      headingLevel={1}
      navigate={navigate}
      products={authorizedProducts}
    />
  );
}
