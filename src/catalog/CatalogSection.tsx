import { useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { siteContent } from '../content/site-content';
import { AppLink } from '../routing/AppLink';
import type { Navigate } from '../routing/routes';
import {
  ALL_CATEGORIES,
  filterProducts,
  formatProductPrice,
  getProductCategories,
  paginateProducts,
} from './catalog';
import type { Product } from './model';

type HeadingLevel = 1 | 2;

type CatalogSectionProps = Readonly<{
  fixedCategorySlug?: string;
  headingLevel?: HeadingLevel;
  navigate: Navigate;
  products: readonly Product[];
  summary?: string;
  title?: string;
}>;

export function CatalogSection({
  fixedCategorySlug,
  headingLevel = 2,
  navigate,
  products,
  summary = siteContent.catalog.summary,
  title = siteContent.catalog.title,
}: CatalogSectionProps) {
  const [query, setQuery] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(ALL_CATEGORIES);
  const [requestedPage, setRequestedPage] = useState(1);
  const categorySlug = fixedCategorySlug ?? selectedCategorySlug;
  const categoryOptions = useMemo(() => getProductCategories(products), [products]);
  const filteredProducts = useMemo(
    () => filterProducts(products, { query, categorySlug }),
    [categorySlug, products, query],
  );
  const pageResult = useMemo(
    () => paginateProducts(filteredProducts, requestedPage),
    [filteredProducts, requestedPage],
  );
  const resultHeadingLevel = headingLevel === 1 ? 2 : 3;
  const resultLabel =
    filteredProducts.length === 1
      ? '1 producto encontrado'
      : `${filteredProducts.length} productos encontrados`;

  return (
    <section className="catalog-section section" aria-labelledby="catalog-title">
      <div className="container catalog-shell">
        <CatalogHeading level={headingLevel} summary={summary} title={title} />

        <div className="catalog-controls" aria-label="Controles del catálogo">
          <label className="catalog-field">
            <span>{siteContent.catalog.searchLabel}</span>
            <input
              type="search"
              value={query}
              placeholder={siteContent.catalog.searchPlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setQuery(event.currentTarget.value);
                setRequestedPage(1);
              }}
            />
          </label>

          {fixedCategorySlug === undefined ? (
            <label className="catalog-field">
              <span>{siteContent.catalog.categoryLabel}</span>
              <select
                value={selectedCategorySlug}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setSelectedCategorySlug(event.currentTarget.value);
                  setRequestedPage(1);
                }}
              >
                <option value={ALL_CATEGORIES}>
                  {siteContent.catalog.allCategoriesLabel}
                </option>
                {categoryOptions.map((category) => (
                  <option value={category.slug} key={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <p className="catalog-results" role="status" aria-live="polite">
          {resultLabel}
        </p>

        {filteredProducts.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <span className="empty-state-mark" aria-hidden="true">
              S
            </span>
            <div>
              <CatalogResultHeading level={resultHeadingLevel}>
                {siteContent.catalog.noResultsTitle}
              </CatalogResultHeading>
              <p>{siteContent.catalog.noResultsDescription}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="catalog-grid">
              {pageResult.items.map((product) => (
                <ProductCard
                  headingLevel={resultHeadingLevel}
                  key={product.id}
                  navigate={navigate}
                  product={product}
                />
              ))}
            </div>

            <nav className="catalog-pagination" aria-label="Paginación del catálogo">
              <button
                type="button"
                disabled={pageResult.page === 1}
                onClick={() => {
                  setRequestedPage((currentPage) => currentPage - 1);
                }}
              >
                Anterior
              </button>
              <span aria-current="page">
                Página {pageResult.page} de {pageResult.totalPages}
              </span>
              <button
                type="button"
                disabled={pageResult.page === pageResult.totalPages}
                onClick={() => {
                  setRequestedPage((currentPage) => currentPage + 1);
                }}
              >
                Siguiente
              </button>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}

function ProductCard({
  headingLevel,
  navigate,
  product,
}: Readonly<{
  headingLevel: 2 | 3;
  navigate: Navigate;
  product: Product;
}>) {
  return (
    <article className="product-card" data-product={product.slug}>
      {product.primaryImage === undefined ? (
        <div className="product-image-placeholder" role="img" aria-label="Imagen no disponible">
          Imagen no disponible
        </div>
      ) : (
        <img
          className="product-image"
          src={product.primaryImage.src}
          alt={product.primaryImage.alt}
          loading="lazy"
          decoding="async"
        />
      )}

      <div className="product-card-content">
        {product.categorySlugs.length === 0 ? null : (
          <p className="product-category">
            {product.categorySlugs.map((slug, index) => (
              <span key={slug}>
                {index === 0 ? null : ', '}
                <AppLink navigate={navigate} to={`/tienda/categoria/${slug}/`}>
                  {product.categoryNames[index]}
                </AppLink>
              </span>
            ))}
          </p>
        )}
        <CatalogResultHeading level={headingLevel}>
          <AppLink navigate={navigate} to={product.path}>
            {product.name}
          </AppLink>
        </CatalogResultHeading>
        <dl className="product-details">
          {product.presentation === undefined ? null : (
            <div>
              <dt>Presentación</dt>
              <dd>{product.presentation}</dd>
            </div>
          )}
          <div>
            <dt>Precio</dt>
            <dd>{formatProductPrice(product.salePrice ?? product.price)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function CatalogHeading({
  level,
  summary,
  title,
}: Readonly<{ level: HeadingLevel; summary: string; title: string }>) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <div className="section-heading catalog-heading">
      <p className="eyebrow">{siteContent.catalog.eyebrow}</p>
      <Heading id="catalog-title">{title}</Heading>
      <p>{summary}</p>
    </div>
  );
}

function CatalogResultHeading({
  children,
  level,
}: Readonly<{
  children: ReactNode;
  level: 2 | 3;
}>) {
  const Heading = level === 2 ? 'h2' : 'h3';

  return <Heading>{children}</Heading>;
}
