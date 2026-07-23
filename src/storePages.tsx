import { useState, type ChangeEvent } from 'react';
import { categories, categoryName, formatPrice, products, type Product } from './catalog';
import { useCart } from './cart';
import { StoreLayout } from './storeShell';

function ProductVisual({ product }: { product: Product }) {
  const image = product.images[0];
  if (image) {
    return <img className="product-visual__image" src={image.src} alt={image.alt} width="900" height="900" />;
  }
  return (
    <div className="product-visual__missing" role="img" aria-label={`Imagen no recuperada para ${product.name}`}>
      <span>Imagen original pendiente de recuperación verificable</span>
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
        <p className="product-card__category">{product.categoryIds.map(categoryName).join(' · ')}</p>
        <h2>
          <a href={product.path}>{product.name}</a>
        </h2>
        <p>{product.shortDescription}</p>
        {price ? (
          <p className="product-price">
            {price}
            <small>Precio público capturado el 23/07/2026</small>
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
  const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');
  const filtered = products.filter((product) => {
    const categoryMatches = selectedCategory === 'all' || product.categoryIds.includes(selectedCategory);
    const queryMatches =
      !normalizedQuery ||
      `${product.name} ${product.description ?? ''} ${product.categoryIds.map(categoryName).join(' ')}`
        .toLocaleLowerCase('es-AR')
        .includes(normalizedQuery);
    return categoryMatches && queryMatches;
  });

  return (
    <StoreLayout>
      <section className="store-hero">
        <div className="container">
          <p className="eyebrow">Catálogo recuperado</p>
          <h1>{categoryId ? categoryName(categoryId) : 'Tienda'}</h1>
          <p className="lead">
            Productos demostrables del Hostinger original. Los precios se presentan con su fecha de captura y el pago no se procesa en este sitio.
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
                placeholder="Nombre o categoría"
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
          </p>
          {filtered.length ? (
            <div className="product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          ) : (
            <div className="catalog-empty">
              <h2>Sin coincidencias</h2>
              <p>No hay productos recuperados que coincidan con esos filtros.</p>
            </div>
          )}
          <aside className="evidence-notice">
            <strong>Alcance verificable</strong>
            <p>
              Este catálogo inicial contiene únicamente productos corroborados en páginas públicas. El importador conserva los faltantes y colisiones para ampliar el inventario sin inventar datos.
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
            <p className="eyebrow">{product.categoryIds.map(categoryName).join(' · ')}</p>
            <h1>{product.name}</h1>
            {price ? (
              <p className="product-price product-price--large">
                {price}
                <small>Precio histórico público capturado el 23/07/2026</small>
              </p>
            ) : null}
            <p className="lead">{product.shortDescription}</p>
            <p>{product.description}</p>
            {product.unit ? <p><strong>Presentación:</strong> {product.unit}</p> : null}
            <div className="product-buy">
              <label>
                <span>Cantidad</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={quantity}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(Math.max(1, Math.min(99, Number(event.currentTarget.value))))}
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

