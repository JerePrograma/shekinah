import { useEffect, useRef, useState } from 'react';
import { formatProductPrice } from '../catalog/catalog';
import { DuxStockDetails } from '../catalog/DuxStock';
import type { CatalogCategory, CatalogProductDetail } from '../catalog/model';
import { ALL_FILTERS, UNCATEGORIZED_FILTER } from './product-management-types';
import type { AvailabilityFilter, ProductOperation, ProductSort, StockFilter } from './product-management-types';

export function ProductList({ categories, availabilityFilter, categoryFilter, deleteCandidate, editingId, isDirty,
  loadError, loading, onAvailabilityFilterChange, onCancelDelete, onCategoryFilterChange, onConfirmDelete, onEdit,
  onOpenDelete, onQueryChange, onResetFilters, onRetryLoad, onSortChange, onStockFilterChange, onUpdateAvailability,
  operation, query, remoteBusy, sort, stockFilter, totalProductCount, visibleProducts,
}: Readonly<{
  categories: readonly CatalogCategory[];
  availabilityFilter: AvailabilityFilter;
  categoryFilter: string;
  deleteCandidate: CatalogProductDetail | null;
  editingId: string | undefined;
  isDirty: boolean;
  loadError: string;
  loading: boolean;
  onAvailabilityFilterChange: (value: AvailabilityFilter) => void;
  onCancelDelete: () => void;
  onCategoryFilterChange: (value: string) => void;
  onConfirmDelete: (product: CatalogProductDetail) => void;
  onEdit: (product: CatalogProductDetail, target: HTMLButtonElement) => void;
  onOpenDelete: (product: CatalogProductDetail) => void;
  onQueryChange: (value: string) => void;
  onResetFilters: () => void;
  onRetryLoad: () => void;
  onSortChange: (value: ProductSort) => void;
  onStockFilterChange: (value: StockFilter) => void;
  onUpdateAvailability: (product: CatalogProductDetail) => void;
  operation: ProductOperation;
  query: string;
  remoteBusy: boolean;
  sort: ProductSort;
  stockFilter: StockFilter;
  totalProductCount: number;
  visibleProducts: readonly CatalogProductDetail[];
}>) {
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const publicationRefs = useRef(new Map<string, HTMLButtonElement>());
  const listTitleRef = useRef<HTMLHeadingElement | null>(null);
  const previousCandidateRef = useRef<string | null>(null);
  const previousOperationRef = useRef<ProductOperation>(operation);
  const [stockObservedAt, setStockObservedAt] = useState(Date.now);
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now(); setStockObservedAt(now);
      const expiry = visibleProducts.reduce((earliest, product) => {
        const readAt = product.commerce?.source === 'dux' ? product.commerce.stockSyncedAt : undefined;
        const expiresAt = readAt === undefined ? Number.NaN : Date.parse(readAt) + 900_001;
        return expiresAt > now ? Math.min(earliest, expiresAt) : earliest;
      }, Number.POSITIVE_INFINITY);
      if (Number.isFinite(expiry)) timer = window.setTimeout(refresh, Math.min(expiry - now, 2_147_483_647));
    };
    refresh();
    return () => window.clearTimeout(timer);
  }, [visibleProducts]);
  useEffect(() => {
    const id = deleteCandidate?.id ?? null;
    const previous = previousCandidateRef.current; previousCandidateRef.current = id;
    if (id !== null && id !== previous) { window.requestAnimationFrame(() => deleteCancelRef.current?.focus()); return; }
    if (id === null && previous !== null) focusPublication(previous);
  }, [deleteCandidate]);
  useEffect(() => {
    const previous = previousOperationRef.current; previousOperationRef.current = operation;
    if ((previous.kind === 'quick' || (previous.kind === 'deleting' && deleteCandidate === null)) && operation.kind === 'idle') focusPublication(previous.productId);
  }, [operation, deleteCandidate]);
  function focusPublication(id: string): void {
    window.requestAnimationFrame(() => {
      const button = publicationRefs.current.get(id);
      if (button?.isConnected === true) button.focus(); else listTitleRef.current?.focus();
    });
  }
  const filtered = query !== '' || categoryFilter !== ALL_FILTERS || availabilityFilter !== ALL_FILTERS || stockFilter !== ALL_FILTERS;
  const filtersDisabled = remoteBusy || deleteCandidate !== null;

  return <section className="admin-product-list-panel" aria-labelledby="product-list-title">
    <div className="admin-panel-heading">
      <div><h3 id="product-list-title" ref={listTitleRef} tabIndex={-1}>Productos</h3><p>Los dados de baja aparecen al final.</p></div>
    </div>
    <div className="admin-simple-catalog-controls" aria-label="Buscar, filtrar y ordenar productos" hidden={loading || loadError !== ''}>
      <label className="admin-form-field admin-search-field"><span>Buscar</span><input type="search" value={query} disabled={filtersDisabled}
        placeholder="Nombre o código de producto" onChange={event => onQueryChange(event.currentTarget.value)} /></label>
      <label className="admin-form-field"><span>Estado</span><select value={availabilityFilter} disabled={filtersDisabled}
        onChange={event => onAvailabilityFilterChange(event.currentTarget.value as AvailabilityFilter)}>
        <option value="all">Todos</option><option value="published">Publicados</option><option value="unpublished">Dados de baja</option>
      </select></label>
      <label className="admin-form-field"><span>Categoría</span><select value={categoryFilter} disabled={filtersDisabled} onChange={event => onCategoryFilterChange(event.currentTarget.value)}>
        <option value={ALL_FILTERS}>Todas</option><option value={UNCATEGORIZED_FILTER}>Sin categoría</option>
        {categories.map(category => <option value={category.slug} key={category.slug}>{category.name}</option>)}
      </select></label>
      <details className="admin-product-disclosure admin-extra-filters">
        <summary>Más filtros y orden</summary>
        <div className="admin-simple-catalog-controls">
          <label className="admin-form-field"><span>Stock</span><select value={stockFilter} disabled={filtersDisabled} onChange={event => onStockFilterChange(event.currentTarget.value as StockFilter)}>
            <option value="all">Todos</option><option value="in-stock">Con stock</option><option value="out-of-stock">Sin stock</option><option value="unverified">Sin información</option>
          </select></label>
          <label className="admin-form-field"><span>Ordenar</span><select value={sort} disabled={filtersDisabled} onChange={event => onSortChange(event.currentTarget.value as ProductSort)}>
            <option value="name">Nombre</option><option value="category">Categoría</option><option value="price-asc">Precio: menor a mayor</option><option value="price-desc">Precio: mayor a menor</option><option value="stock-asc">Stock: menor a mayor</option><option value="stock-desc">Stock: mayor a menor</option>
          </select></label>
        </div>
      </details>
    </div>
    <div className="admin-list-results" hidden={loading || loadError !== ''}>
      <p className="admin-results-count" role="status" aria-live="polite">{visibleProducts.length === 1 ? '1 producto encontrado' : `${visibleProducts.length} productos encontrados`}</p>
      {filtered ? <button className="button button-secondary admin-compact-button" type="button" disabled={filtersDisabled} onClick={onResetFilters}>Limpiar filtros</button> : null}
    </div>
    {isDirty ? <p className="admin-field-note">Guardá o descartá la edición antes de dar de baja o volver a publicar.</p> : null}
    {loading ? <p role="status" aria-busy="true">Cargando productos…</p> : loadError !== '' ? <div className="admin-empty-state">
      <h4>No pudimos cargar los productos</h4><p className="form-error" role="alert">{loadError}</p>
      <button className="button button-secondary admin-compact-button" type="button" onClick={onRetryLoad}>Reintentar carga</button>
    </div> : visibleProducts.length === 0 ? <div className="admin-empty-state">
      <h4>{totalProductCount === 0 ? 'No hay productos cargados' : 'No encontramos productos con estos filtros'}</h4>
      <p>{totalProductCount === 0 ? 'Los productos aparecerán después de sincronizar el catálogo de Dux.' : 'Probá otra búsqueda o limpiá los filtros.'}</p>
    </div> : <ul className="admin-product-list">
      {visibleProducts.map(product => {
        const unpublished = product.publicationStatus === 'unpublished';
        const selected = editingId === product.id;
        const rowBusy = operation.kind !== 'idle' && 'productId' in operation && operation.productId === product.id;
        const stock = product.commerce?.source === 'dux' ? product.commerce.observedStock?.available : undefined;
        return <li className={`${selected ? 'is-selected' : ''}${unpublished ? ' is-unpublished' : ''}`} key={product.id}>
          <article className="admin-product-row admin-simple-product-row" aria-label={product.name} aria-busy={rowBusy}>
            {product.primaryImage === undefined ? <div className="admin-product-thumbnail-placeholder" role="img" aria-label="Imagen no disponible">Sin imagen</div> :
              <img className="admin-product-thumbnail" src={product.primaryImage.src} alt={product.primaryImage.alt} loading="lazy" decoding="async" />}
            <div className="admin-product-row-main">
              <h4>{product.name}</h4>
              <p className="admin-product-id">{product.sku} · {product.categoryNames.join(' · ') || 'Sin categoría'}</p>
              <div className="admin-product-row-facts"><strong>{formatProductPrice(product.salePrice ?? product.price)}</strong>
                <span className={`admin-status-badge admin-status-${unpublished ? 'paused' : 'available'}`}>{unpublished ? 'Dado de baja' : 'Publicado'}</span>
                {stock !== undefined && stock <= 0 ? <span className="admin-status-badge admin-status-out">Sin stock</span> : null}
              </div>
            </div>
            <div className="admin-product-row-actions">
              <button className="button button-secondary admin-compact-button" type="button" disabled={remoteBusy || deleteCandidate !== null}
                aria-label={`Editar ${product.name}`} onClick={event => onEdit(product, event.currentTarget)}>{selected ? 'Editando' : 'Editar'}</button>
              <button ref={element => { if (element === null) publicationRefs.current.delete(product.id); else publicationRefs.current.set(product.id, element); }}
                className={`button ${unpublished ? 'button-secondary' : 'button-danger admin-trash-button'} admin-compact-button`} type="button"
                disabled={remoteBusy || isDirty || deleteCandidate !== null} title={unpublished ? 'Volver a publicar' : 'Dar de baja de la web'}
                aria-label={`${unpublished ? 'Volver a publicar' : 'Dar de baja'} ${product.name}`}
                onClick={() => unpublished ? onUpdateAvailability(product) : onOpenDelete(product)}>
                {unpublished ? rowBusy ? 'Publicando…' : 'Volver a publicar' : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>}
              </button>
            </div>
            <div className="admin-product-row-details">
              <details className="admin-product-disclosure"><summary>Descripción</summary><div className="admin-product-description">
                {product.shortDescription === undefined ? null : <p>{product.shortDescription}</p>}
                <p>{product.description || (product.shortDescription === undefined ? 'Este producto todavía no tiene descripción.' : '')}</p>
              </div></details>
              <details className="admin-product-disclosure"><summary>Stock y detalles</summary><DuxStockDetails product={product} now={stockObservedAt} /></details>
            </div>
            {deleteCandidate?.id !== product.id ? null : <div className="admin-inline-confirmation" role="dialog"
              aria-labelledby={`delete-title-${product.id}`} aria-describedby={`delete-description-${product.id}`}
              onKeyDown={event => { if (event.key === 'Escape' && !rowBusy) { event.preventDefault(); event.stopPropagation(); onCancelDelete(); } }}>
              <div><h5 id={`delete-title-${product.id}`}>¿Dar de baja {product.name}?</h5>
                <p id={`delete-description-${product.id}`}>Dejará de mostrarse en la web. Podés volver a publicarlo cuando quieras. El producto y su stock se conservan en Dux.</p></div>
              <div className="admin-inline-actions">
                <button ref={deleteCancelRef} className="button button-secondary admin-compact-button" type="button" disabled={rowBusy} onClick={onCancelDelete}>Cancelar</button>
                <button className="button button-danger admin-compact-button" type="button" disabled={rowBusy} onClick={() => onConfirmDelete(product)}>{rowBusy ? 'Dando de baja…' : 'Confirmar baja'}</button>
              </div>
            </div>}
          </article>
        </li>;
      })}
    </ul>}
  </section>;
}
