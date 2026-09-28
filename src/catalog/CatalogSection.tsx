import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { AddToCartButton } from '../cart/AddToCartButton';
import { siteContent } from '../content/site-content';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';
import type { RuntimeCatalogStatus } from '../data/runtime-catalog';
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
  status?: RuntimeCatalogStatus;
  viewKey?: string;
}>;
export type CatalogView = Readonly<{ query: string; category: string; page: number }>;
// Only navigation context in this tab's memory; no searches are persisted or sent.
export const CatalogViewsContext = createContext<Map<string, CatalogView> | null>(null);
export function CatalogSection({
  fixedCategorySlug,
  headingLevel = 2,
  navigate,
  products,
  summary = siteContent.catalog.summary,
  title = siteContent.catalog.title,
  status = 'ready',
  viewKey,
}: CatalogSectionProps) {
  const catalogViews = useContext(CatalogViewsContext);
  const previousView = viewKey === undefined ? undefined : catalogViews?.get(viewKey);
  const [query, setQuery] = useState(previousView?.query ?? '');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(previousView?.category ?? ALL_CATEGORIES);
  const [requestedPage, setRequestedPage] = useState(previousView?.page ?? 1);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const catalogGridRef = useRef<HTMLDivElement>(null);
  const focusNextPageResult = useRef(false);
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

  useEffect(() => {
    if (viewKey !== undefined) {
      catalogViews?.set(viewKey, { query, category: selectedCategorySlug, page: requestedPage });
    }
  }, [catalogViews, query, requestedPage, selectedCategorySlug, viewKey]);

  useEffect(() => {
    if (!focusNextPageResult.current) return;
    focusNextPageResult.current = false;
    catalogGridRef.current?.querySelector<HTMLAnchorElement>('[data-product] h2 a, [data-product] h3 a')?.focus();
  }, [pageResult.page]);

  function resetFilters() {
    setQuery('');
    setSelectedCategorySlug(ALL_CATEGORIES);
    setRequestedPage(1);
    searchRef.current?.focus();
  }
  return (
    <section className="catalog-section section" aria-labelledby="catalog-title" ref={sectionRef}>
      <div className="container catalog-shell">
        <CatalogHeading level={headingLevel} summary={summary} title={title} />
        {fixedCategorySlug === undefined ? null : (
          <AppLink className="page-back-link" navigate={navigate} to="/catalogo">Ver todas las categorías</AppLink>
        )}
        {status === 'ready' || (status === 'loading' && products.length > 0) ? null : (
          <div className="catalog-feedback">
            <p role={status === 'error' ? 'alert' : 'status'}>
              {status === 'loading'
                ? 'Cargando productos…'
                : 'No pudimos actualizar el catálogo. Revisá tu conexión y reintentá.'}
            </p>
            {status === 'error' ? (
              <button className="button button-secondary" type="button" onClick={() => {
                sectionRef.current?.querySelector<HTMLElement>('#catalog-title')?.focus();
                void refreshRuntimeCatalog();
              }}>
                Reintentar carga
              </button>
            ) : null}
          </div>
        )}
        {products.length === 0 && status !== 'ready' ? null : <>
        <div className="catalog-controls" aria-label="Controles del catálogo">
          <label className="catalog-field">
            <span>{siteContent.catalog.searchLabel}</span>
            <input
              type="search"
              ref={searchRef}
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
                {selectedCategorySlug !== ALL_CATEGORIES && !categoryOptions.some(({ slug }) => slug === selectedCategorySlug)
                  ? <option value={selectedCategorySlug}>Categoría no disponible</option> : null}
                {categoryOptions.map((category) => (
                  <option value={category.slug} key={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {query === '' && selectedCategorySlug === ALL_CATEGORIES ? null : (
            <button className="text-button catalog-reset" type="button" onClick={resetFilters}>
              {fixedCategorySlug === undefined ? 'Limpiar búsqueda y categoría' : 'Limpiar búsqueda'}
            </button>
          )}
        </div>
        <p className="catalog-results" role="status" aria-live="polite">
          {resultLabel}. Página {pageResult.page} de {pageResult.totalPages}.
        </p>
        {filteredProducts.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <span className="empty-state-mark" aria-hidden="true">
              S
            </span>
            <div>
              <CatalogResultHeading level={resultHeadingLevel}>
                {products.length === 0
                  ? 'No hay productos disponibles'
                  : siteContent.catalog.noResultsTitle}
              </CatalogResultHeading>
              <p>
                {products.length === 0
                  ? 'El catálogo no tiene productos disponibles en este momento.'
                  : siteContent.catalog.noResultsDescription}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="catalog-grid" ref={catalogGridRef}>
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
                  focusNextPageResult.current = true;
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
                  focusNextPageResult.current = true;
                  setRequestedPage((currentPage) => currentPage + 1);
                }}
              >
                Siguiente
              </button>
            </nav>
          </>
        )}
        </>}
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
        <AddToCartButton
          className="button button-secondary product-add-button"
          product={product}
          productNamedLabel
          unavailableLabel="No disponible"
        />
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
      <Heading id="catalog-title" tabIndex={-1}>{title}</Heading>
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
