import { useEffect, useState } from 'react';

import {
  formatAvailability,
  formatProductPrice,
} from '../catalog/catalog';
import type { CatalogProductDetail } from '../catalog/model';
import {
  getAuthorizedProduct,
  loadAuthorizedProductDetail,
} from '../data/authorized-commercial-data';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type ProductPageProps = Readonly<{
  navigate: Navigate;
  productSlug: string;
}>;

export function ProductPage({ navigate, productSlug }: ProductPageProps) {
  const summary = getAuthorizedProduct(productSlug);
  const [detail, setDetail] = useState<CatalogProductDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  if (summary === undefined) {
    throw new Error(`No existe el producto público "${productSlug}".`);
  }

  useEffect(() => {
    let active = true;
    setDetail(null);
    setLoadError(null);

    void loadAuthorizedProductDetail(productSlug)
      .then((loadedDetail) => {
        if (active) {
          if (loadedDetail === null) {
            setLoadError('No se encontró el detalle del producto.');
          } else {
            setDetail(loadedDetail);
          }
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el detalle del producto.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [productSlug]);

  const images =
    detail?.images ??
    (summary.primaryImage === undefined ? [] : [summary.primaryImage]);
  const availability = formatAvailability(summary.availability);

  return (
    <section className="product-page section" aria-labelledby="product-title">
      <div className="container product-page-shell">
        <AppLink className="page-back-link" navigate={navigate} to={appPaths.catalog}>
          Volver al catálogo
        </AppLink>

        <div className="product-page-grid">
          <div className="product-gallery" aria-label={`Imágenes de ${summary.name}`}>
            {images.length === 0 ? (
              <div className="product-image-placeholder product-image-placeholder-detail" role="img" aria-label="Imagen no disponible">
                Imagen no disponible
              </div>
            ) : (
              images.map((image) => (
                <img
                  className="product-detail-image"
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  decoding="async"
                  key={image.src}
                />
              ))
            )}
          </div>

          <div className="product-page-content">
            <p className="eyebrow">Producto</p>
            <h1 id="product-title">{summary.name}</h1>

            {summary.categorySlugs.length === 0 ? null : (
              <p className="product-category-links">
                {summary.categorySlugs.map((slug, index) => (
                  <span key={slug}>
                    {index === 0 ? null : ', '}
                    <AppLink navigate={navigate} to={`/tienda/categoria/${slug}/`}>
                      {summary.categoryNames[index]}
                    </AppLink>
                  </span>
                ))}
              </p>
            )}

            {summary.shortDescription === undefined ? null : (
              <p className="product-short-description">{summary.shortDescription}</p>
            )}

            <dl className="product-facts">
              {summary.presentation === undefined ? null : (
                <div>
                  <dt>Presentación</dt>
                  <dd>{summary.presentation}</dd>
                </div>
              )}
              <div>
                <dt>Precio</dt>
                <dd>{formatProductPrice(summary.price)}</dd>
              </div>
              {summary.salePrice === undefined ? null : (
                <div>
                  <dt>Precio promocional</dt>
                  <dd>{formatProductPrice(summary.salePrice)}</dd>
                </div>
              )}
              {summary.sku === undefined ? null : (
                <div>
                  <dt>SKU</dt>
                  <dd>{summary.sku}</dd>
                </div>
              )}
              {availability === null ? null : (
                <div>
                  <dt>Disponibilidad</dt>
                  <dd>{availability}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {detail === null && loadError === null ? (
          <p role="status" aria-live="polite">Cargando información detallada…</p>
        ) : null}
        {loadError === null ? null : <p role="alert">{loadError}</p>}

        {detail?.description === undefined ? null : (
          <section className="product-description" aria-labelledby="product-description-title">
            <h2 id="product-description-title">Descripción</h2>
            {detail.description.split('\n').map((paragraph, index) =>
              paragraph === '' ? null : <p key={`${summary.slug}-${index}`}>{paragraph}</p>,
            )}
          </section>
        )}

        {detail === null || detail.variants.length === 0 ? null : (
          <section className="product-variants" aria-labelledby="product-variants-title">
            <h2 id="product-variants-title">Presentaciones disponibles</h2>
            <ul>
              {detail.variants.map((variant, index) => (
                <li key={`${summary.slug}-variant-${index}`}>
                  {variant.title ?? `Variante ${index + 1}`} — {formatProductPrice(variant.price)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
