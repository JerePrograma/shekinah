import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { categories, categoryName, formatPrice, products, type Product } from './catalog';
import { useCart } from './cart';
import { toSitePath } from './content';
import { StoreLayout } from './storeShell';

const PAGE_SIZE = 24;

function ProductVisual({ product, priority = false }: { product: Product; priority?: boolean }) {
  const image = product.images[0];
  if (image) {
    return (
      <img
        className="product-visual__image"
        src={toSitePath(image.src)}
        alt={image.alt}
        width="900"
        height="900"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    );
  }
  return (
    <div className="product-visual__missing" role="img" aria-label={`Imagen no disponible para ${product.name}`}>
      <span>Imagen no disponible</span>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const price = formatPrice(product);
  return (
    <article className="product-card">
      <div className="product-card__visual">
        <ProductVisual product={product} />
      </div>
      <div className="product-card__body">
        <p className="product-card__category">{product.categoryIds.map(categoryName).join(' · ') || 'Otros'}</p>
        <h2>{product.name}</h2>
        {product.unit ? <p className="product-card__unit">Presentación: {product.unit}</p> : null}
        {price ? <p className="product-price">{price}</p> : <p className="product-price product-price--unavailable">Consultar precio</p>}
        <a className="button product-card__action" href={toSitePath(product.path)}>Ver detalle</a>
      </div>
    </article>
  );
}

export function ShopPage({ categoryId }: { categoryId?: string }) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? 'all');
  const [pageNumber, setPageNumber] = useState(1);
  const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');
  const selectedCategoryData = categories.find((category) => category.id === selectedCategory);
  const currentPath = categoryId
    ? (categories.find((category) => category.id === categoryId)?.path ?? '/tienda/')
    : '/tienda/';

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
  const hasActiveFilters = Boolean(normalizedQuery) || selectedCategory !== 'all';

  const clearFilters = () => {
    setQuery('');
    setSelectedCategory('all');
    setPageNumber(1);
  };

  return (
    <StoreLayout currentPath={currentPath}>
      <section className="store-hero">
        <div className="container">
          <p className="eyebrow">Catálogo</p>
          <h1>{categoryId ? categoryName(categoryId) : 'Productos'}</h1>
          <p className="lead">Buscá por nombre o elegí una categoría. Después abrí el producto para ver su información.</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <form className="catalog-controls" role="search" aria-label="Buscar y filtrar productos" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Buscar producto</span>
              <input
                type="search"
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
                placeholder="Ej.: canela, cacao o té"
                autoComplete="off"
              />
            </label>
            <label>
              <span>Categoría</span>
              <select
                value={selectedCategory}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedCategory(event.currentTarget.value)}
              >
                <option value="all">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <button className="button button--secondary catalog-clear" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
              Limpiar filtros
            </button>
          </form>

          <div className="catalog-summary" aria-live="polite" aria-atomic="true">
            <p className="catalog-result">
              {filtered.length === 1 ? 'Mostrando 1 producto' : `Mostrando ${filtered.length} productos`}
              {selectedCategoryData ? ` en ${selectedCategoryData.name}` : ''}
              {filtered.length > PAGE_SIZE ? ` · Página ${currentPage} de ${totalPages}` : ''}
            </p>
          </div>

          {visibleProducts.length ? (
            <>
              <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
              {totalPages > 1 ? (
                <nav className="catalog-pagination" aria-label="Paginación del catálogo">
                  <button type="button" disabled={currentPage === 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>
                    Página anterior
                  </button>
                  <span>Página {currentPage} de {totalPages}</span>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setPageNumber((value) => Math.min(totalPages, value + 1))}>
                    Página siguiente
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className="catalog-empty" role="status">
              <h2>No encontramos productos</h2>
              <p>Probá con otro nombre o eliminá los filtros seleccionados.</p>
              <button className="button" type="button" onClick={clearFilters}>Ver todos los productos</button>
            </div>
          )}
        </div>
      </section>
    </StoreLayout>
  );
}

export function ProductPage({ product }: { product: Product }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const price = formatPrice(product);
  const setSafeQuantity = (value: number) => {
    setQuantity(Number.isFinite(value) ? Math.max(1, Math.min(99, Math.floor(value))) : 1);
  };

  return (
    <StoreLayout currentPath={product.path}>
      <nav className="container store-breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li><a href={toSitePath('/')}>Inicio</a></li>
          <li><a href={toSitePath('/tienda/')}>Productos</a></li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>
      <article className="section product-detail">
        <div className="container product-detail__grid">
          <ProductVisual product={product} priority />
          <div className="product-detail__summary">
            <p className="eyebrow">{product.categoryIds.map(categoryName).join(' · ') || 'Otros'}</p>
            <h1>{product.name}</h1>
            {price ? <p className="product-price product-price--large">{price}</p> : <p className="product-price product-price--large">Consultar precio</p>}
            {product.shortDescription ? <p className="lead">{product.shortDescription}</p> : null}
            {product.unit ? <p><strong>Presentación:</strong> {product.unit}</p> : null}
            <div className="product-buy">
              <label>
                <span>Cantidad</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSafeQuantity(Number(event.currentTarget.value))}
                />
              </label>
              <button className="button" type="button" onClick={() => add(product.id, quantity)}>Agregar al carrito</button>
            </div>
            <p className="checkout-disclaimer">Al agregarlo, podés revisar la cantidad y enviar la consulta por WhatsApp. El sitio no procesa pagos.</p>
            <a className="text-link" href={toSitePath('/tienda/')}>Volver al catálogo</a>
          </div>
        </div>
        {(product.description || product.sku) ? (
          <div className="container product-information">
            <h2>Información del producto</h2>
            {product.description ? <p>{product.description}</p> : null}
            {product.sku ? <p><strong>Código:</strong> {product.sku}</p> : null}
          </div>
        ) : null}
      </article>
    </StoreLayout>
  );
}
