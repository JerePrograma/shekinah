import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { categories, categoryName, formatPrice, products, type Product } from './catalog';
import { useCart } from './cart';
import { StoreLayout } from './storeShell';

const PAGE_SIZE = 24;

function ProductVisual({ product }: { product: Product }) {
  const image = product.images[0];
  if (image) {
    return (
      <img
        className="product-visual__image"
        src={image.src}
        alt={image.alt}
        width="900"
        height="900"
        loading="lazy"
      />
    );
  }
  return (
    <div className="product-visual__missing" role="img" aria-label={`Imagen original no disponible para ${product.name}`}>
      <span>El producto original no contiene una imagen pública recuperable</span>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const price = formatPrice(product);
  return (
    <article className="product-card">
      <a className="product-card__visual" href={product.path} aria-label={`Ver ${product.name}`}>
        <ProductVisual product={product} />
      </a>
      <div className="product-card__body">
        <p className="product-card__category">{product.categoryIds.map(categoryName).join(' · ') || 'Otros'}</p>
        <h2>
          <a href={product.path}>{product.name}</a>
        </h2>
        {product.shortDescription ? <p>{product.shortDescription}</p> : null}
        {price ? (
          <p className="product-price">
            {price}
            <small>Precio público histórico capturado el 23/07/2026</small>
          </p>
        ) : null}
        <div className="product-card__actions">
          <a className="button button--secondary" href={product.path}>
            Ver producto
          </a>
          <button className="button" type="button" onClick={() => add(product.id)}>
            Agregar al carrito
          </button>
        </div>
      </div>
    </article>
  );
}

export function ShopPage({ categoryId }: { categoryId?: string }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? 'all');
  const [pageNumber, setPageNumber] = useState(1);
  const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');

  useEffect(() => {
    setPageNumber(1);
  }, [normalizedQuery, selectedCategory]);

  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const categoryMatches = selectedCategory === 'all' || product.categoryIds.includes(selectedCategory);
        const queryMatches =
          !normalizedQuery ||
          `${product.name} ${product.description ?? ''} ${product.sku ?? ''} ${product.categoryIds.map(categoryName).join(' ')}`
            .toLocaleLowerCase('es-AR')
            .includes(normalizedQuery);
        return categoryMatches && queryMatches;
      }),
    [normalizedQuery, selectedCategory],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(pageNumber, totalPages);
  const visibleProducts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <StoreLayout>
      <section className="store-hero">
        <div className="container">
          <p className="eyebrow">Catálogo original recuperado</p>
          <h1>{categoryId ? categoryName(categoryId) : 'Tienda'}</h1>
          <p className="lead">
            {products.length} productos recuperados del Hostinger original, con IDs, categorías, precios, SKU, descripciones e imágenes públicas versionadas.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="catalog-controls" aria-label="Filtros del catálogo">
            <label>
              <span>Buscar</span>
              <input
                type="search"
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
                placeholder="Nombre, SKU o categoría"
              />
            </label>
            <label>
              <span>Categoría</span>
              <select value={selectedCategory} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCategory(event.currentTarget.value)}>
                <option value="all">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="catalog-result" aria-live="polite">
            {filtered.length === 1 ? '1 producto recuperado' : `${filtered.length} productos recuperados`}
            {filtered.length > PAGE_SIZE ? ` · Página ${currentPage} de ${totalPages}` : ''}
          </p>
          {visibleProducts.length ? (
            <>
              <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
              {totalPages > 1 ? (
                <nav className="catalog-pagination" aria-label="Paginación del catálogo">
                  <button type="button" disabled={currentPage === 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>
                    Anterior
                  </button>
                  <span>Página {currentPage} de {totalPages}</span>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setPageNumber((value) => Math.min(totalPages, value + 1))}>
                    Siguiente
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className="catalog-empty">
              <h2>Sin coincidencias</h2>
              <p>No hay productos recuperados que coincidan con esos filtros.</p>
            </div>
          )}
          <aside className="evidence-notice">
            <strong>Fuente recuperada</strong>
            <p>
              El catálogo se genera desde la API pública del Store ID original y conserva los datos de procedencia. Los precios son evidencia histórica y deben confirmarse antes de concretar una compra.
            </p>
          </aside>
        </div>
      </section>
    </StoreLayout>
  );
}

export function ProductPage({ product }: { product: Product }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const price = formatPrice(product);
  const setSafeQuantity = (value: number) => setQuantity(Number.isFinite(value) ? Math.max(1, Math.min(99, Math.floor(value))) : 1);
  return (
    <StoreLayout>
      <nav className="container store-breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li><a href="/">Inicio</a></li>
          <li><a href="/tienda/">Tienda</a></li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>
      <article className="section product-detail">
        <div className="container product-detail__grid">
          <ProductVisual product={product} />
          <div>
            <p className="eyebrow">{product.categoryIds.map(categoryName).join(' · ') || 'Otros'}</p>
            <h1>{product.name}</h1>
            {price ? (
              <p className="product-price product-price--large">
                {price}
                <small>Precio histórico público capturado el 23/07/2026</small>
              </p>
            ) : null}
            {product.shortDescription ? <p className="lead">{product.shortDescription}</p> : null}
            {product.description ? <p>{product.description}</p> : null}
            {product.unit ? <p><strong>Presentación:</strong> {product.unit}</p> : null}
            {product.sku ? <p><strong>SKU original:</strong> {product.sku}</p> : null}
            <div className="product-buy">
              <label>
                <span>Cantidad</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSafeQuantity(Number(event.currentTarget.value))}
                />
              </label>
              <button className="button" type="button" onClick={() => add(product.id, quantity)}>
                Agregar al carrito
              </button>
            </div>
            <p className="checkout-disclaimer">
              El sitio no procesa pagos. El carrito prepara una consulta por WhatsApp con cantidades y subtotal informativo.
            </p>
          </div>
        </div>
      </article>
    </StoreLayout>
  );
}
