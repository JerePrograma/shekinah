import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { siteContent } from '../content/site-content';
import {
  ALL_CATEGORIES,
  filterProducts,
  formatProductPrice,
  getProductCategories,
} from './catalog';
import type { Product } from './model';

type CatalogSectionProps = Readonly<{
  products: readonly Product[];
}>;

export function CatalogSection({ products }: CatalogSectionProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const categories = useMemo(() => getProductCategories(products), [products]);
  const filteredProducts = useMemo(
    () => filterProducts(products, { query, category }),
    [category, products, query],
  );

  if (products.length === 0) {
    return (
      <section className="catalog-section section" id="catalogo" aria-labelledby="catalog-title">
        <div className="container catalog-layout">
          <CatalogHeading />

          <div className="empty-state" role="status" aria-live="polite">
            <span className="empty-state-mark" aria-hidden="true">
              S
            </span>
            <div>
              <h3>{siteContent.catalog.emptyTitle}</h3>
              <p>{siteContent.catalog.emptyDescription}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const resultLabel =
    filteredProducts.length === 1
      ? '1 producto encontrado'
      : `${filteredProducts.length} productos encontrados`;

  return (
    <section className="catalog-section section" id="catalogo" aria-labelledby="catalog-title">
      <div className="container catalog-shell">
        <CatalogHeading />

        <div className="catalog-controls" aria-label="Controles del catálogo">
          <label className="catalog-field">
            <span>{siteContent.catalog.searchLabel}</span>
            <input
              type="search"
              value={query}
              placeholder={siteContent.catalog.searchPlaceholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setQuery(event.currentTarget.value);
              }}
            />
          </label>

          {categories.length > 1 ? (
            <label className="catalog-field">
              <span>{siteContent.catalog.categoryLabel}</span>
              <select
                value={category}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setCategory(event.currentTarget.value);
                }}
              >
                <option value={ALL_CATEGORIES}>
                  {siteContent.catalog.allCategoriesLabel}
                </option>
                {categories.map((categoryOption) => (
                  <option value={categoryOption} key={categoryOption}>
                    {categoryOption}
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
              <h3>{siteContent.catalog.noResultsTitle}</h3>
              <p>{siteContent.catalog.noResultsDescription}</p>
            </div>
          </div>
        ) : (
          <div className="catalog-grid">
            {filteredProducts.map((product) => {
              const formattedPrice = formatProductPrice(product.price);

              return (
                <article className="product-card" data-product={product.id} key={product.id}>
                  <p className="product-category">{product.category}</p>
                  <h3>{product.name}</h3>
                  <dl className="product-details">
                    <div>
                      <dt>Presentación</dt>
                      <dd>{product.presentation}</dd>
                    </div>
                    {formattedPrice === null ? null : (
                      <div>
                        <dt>Precio</dt>
                        <dd>{formattedPrice}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function CatalogHeading() {
  return (
    <div className="section-heading catalog-heading">
      <p className="eyebrow">{siteContent.catalog.eyebrow}</p>
      <h2 id="catalog-title">{siteContent.catalog.title}</h2>
      <p>{siteContent.catalog.summary}</p>
    </div>
  );
}
