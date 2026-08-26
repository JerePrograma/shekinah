import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

import { formatProductPrice } from '../catalog/catalog';
import type { CatalogProductDetail } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import {
  ALL_FILTERS,
  UNCATEGORIZED_FILTER,
} from './product-management-types';
import type {
  AvailabilityFilter,
  ProductOperation,
  ProductSort,
  StockFilter,
} from './product-management-types';

export function ProductList({
  availabilityFilter,
  categoryFilter,
  deleteCandidate,
  editingId,
  isDirty,
  loadError,
  loading,
  onBeginQuickStock,
  onAvailabilityFilterChange,
  onCancelDelete,
  onCancelQuickStock,
  onCategoryFilterChange,
  onConfirmDelete,
  onEdit,
  onOpenDelete,
  onQueryChange,
  onQuickStockValueChange,
  onResetFilters,
  onRetryLoad,
  onSetUntrackedStock,
  onSortChange,
  onStockFilterChange,
  onSubmitQuickStock,
  onUpdateAvailability,
  operation,
  query,
  quickStockError,
  quickStockId,
  quickStockValue,
  remoteBusy,
  sort,
  stockFilter,
  totalProductCount,
  visibleProducts,
}: Readonly<{
  availabilityFilter: AvailabilityFilter;
  categoryFilter: string;
  deleteCandidate: CatalogProductDetail | null;
  editingId: string | null | undefined;
  isDirty: boolean;
  loadError: string;
  loading: boolean;
  onBeginQuickStock: (product: CatalogProductDetail) => void;
  onAvailabilityFilterChange: (value: AvailabilityFilter) => void;
  onCancelDelete: () => void;
  onCancelQuickStock: () => void;
  onCategoryFilterChange: (value: string) => void;
  onConfirmDelete: (product: CatalogProductDetail) => void;
  onEdit: (product: CatalogProductDetail, returnFocusTarget: HTMLButtonElement) => void;
  onOpenDelete: (product: CatalogProductDetail) => void;
  onQueryChange: (value: string) => void;
  onQuickStockValueChange: (value: string) => void;
  onResetFilters: () => void;
  onRetryLoad: () => void;
  onSetUntrackedStock: (product: CatalogProductDetail) => void;
  onSortChange: (value: ProductSort) => void;
  onStockFilterChange: (value: StockFilter) => void;
  onSubmitQuickStock: (
    event: FormEvent<HTMLFormElement>,
    product: CatalogProductDetail,
  ) => void;
  onUpdateAvailability: (product: CatalogProductDetail) => void;
  operation: ProductOperation;
  query: string;
  quickStockError: string;
  quickStockId: string | null;
  quickStockValue: string;
  remoteBusy: boolean;
  sort: ProductSort;
  stockFilter: StockFilter;
  totalProductCount: number;
  visibleProducts: readonly CatalogProductDetail[];
}>) {
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const listTitleRef = useRef<HTMLHeadingElement | null>(null);
  const previousDeleteCandidateIdRef = useRef<string | null>(null);

  useEffect(() => {
    const candidateId = deleteCandidate?.id ?? null;
    const previousCandidateId = previousDeleteCandidateIdRef.current;
    previousDeleteCandidateIdRef.current = candidateId;
    if (candidateId !== null && candidateId !== previousCandidateId) {
      window.requestAnimationFrame(() => deleteCancelRef.current?.focus());
      return;
    }
    if (candidateId !== null || previousCandidateId === null) return;
    window.requestAnimationFrame(() => {
      const trigger = deleteTriggerRefs.current.get(previousCandidateId);
      if (trigger?.isConnected === true) trigger.focus();
      else listTitleRef.current?.focus();
    });
  }, [deleteCandidate]);

  return (
    <section className="admin-product-list-panel" aria-labelledby="product-list-title">
      <div className="admin-panel-heading">
        <div>
          <h3 id="product-list-title" ref={listTitleRef} tabIndex={-1}>Productos</h3>
          <p>Los estados indican si hoy pueden comprarse.</p>
        </div>
      </div>

      <div
        className="admin-catalog-controls"
        aria-label="Buscar, filtrar y ordenar productos"
        hidden={loading || loadError !== ''}
      >
        <label className="admin-form-field admin-search-field">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            placeholder="Nombre, categoría, SKU o identificador"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <label className="admin-form-field">
          <span>Categoría</span>
          <select
            value={categoryFilter}
            onChange={(event) => onCategoryFilterChange(event.currentTarget.value)}
          >
            <option value={ALL_FILTERS}>Todas</option>
            <option value={UNCATEGORIZED_FILTER}>Sin categoría</option>
            {authorizedCategories.map((category) => (
              <option value={category.slug} key={category.slug}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="admin-form-field">
          <span>Disponibilidad</span>
          <select
            value={availabilityFilter}
            onChange={(event) => onAvailabilityFilterChange(
              event.currentTarget.value as AvailabilityFilter,
            )}
          >
            <option value="all">Todas</option>
            <option value="available">Disponibles para venta</option>
            <option value="unavailable">No disponibles</option>
          </select>
        </label>
        <label className="admin-form-field">
          <span>Stock</span>
          <select
            value={stockFilter}
            onChange={(event) => onStockFilterChange(event.currentTarget.value as StockFilter)}
          >
            <option value="all">Todos</option>
            <option value="in-stock">Con stock</option>
            <option value="out-of-stock">Sin stock</option>
            <option value="untracked">Stock sin configurar</option>
          </select>
        </label>
        <label className="admin-form-field">
          <span>Ordenar</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.currentTarget.value as ProductSort)}
          >
            <option value="name">Nombre</option>
            <option value="category">Categoría</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="stock-asc">Stock: menor a mayor</option>
            <option value="stock-desc">Stock: mayor a menor</option>
          </select>
        </label>
      </div>

      <p
        className="admin-results-count"
        role="status"
        aria-live="polite"
        hidden={loading || loadError !== ''}
      >
        {visibleProducts.length === 1
          ? '1 producto encontrado'
          : `${visibleProducts.length} productos encontrados`}
      </p>

      {loading ? (
        <p role="status" aria-busy="true">Cargando productos…</p>
      ) : loadError !== '' ? (
        <div className="admin-empty-state">
          <h4>No pudimos cargar los productos</h4>
          <p className="form-error" role="alert">{loadError}</p>
          <button
            className="button button-secondary admin-compact-button"
            type="button"
            onClick={onRetryLoad}
          >
            Reintentar carga
          </button>
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="admin-empty-state">
          <h4>{totalProductCount === 0 ? 'No hay productos cargados' : 'No encontramos productos con estos filtros'}</h4>
          <p>
            {totalProductCount === 0
              ? 'Usá Nuevo producto para cargar el primero.'
              : 'Probá otra búsqueda o limpiá los filtros.'}
          </p>
          {totalProductCount === 0 ? null : (
            <button
              className="button button-secondary admin-compact-button"
              type="button"
              onClick={onResetFilters}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="admin-product-list">
          {visibleProducts.map((product) => {
            const availabilityStatus = productAvailabilityLabel(product);
            const stockStatus = productStockLabel(product);
            const selected = editingId === product.id;
            const rowBusy = operation.kind !== 'idle' &&
              'productId' in operation && operation.productId === product.id;
            return (
              <li className={selected ? 'is-selected' : undefined} key={product.id}>
                <article className="admin-product-row" aria-label={product.name}>
                  {product.primaryImage === undefined ? (
                    <div className="admin-product-thumbnail-placeholder" role="img" aria-label="Imagen no disponible">
                      Sin imagen
                    </div>
                  ) : (
                    <img
                      className="admin-product-thumbnail"
                      src={product.primaryImage.src}
                      alt={product.primaryImage.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="admin-product-row-main">
                    <p className="admin-product-categories">
                      {product.categoryNames.join(' · ') || 'Sin categoría'}
                    </p>
                    <h4>{product.name}</h4>
                    <p className="admin-product-id">{product.id}</p>
                    <div className="admin-product-row-facts">
                      <strong>{formatProductPrice(product.salePrice ?? product.price)}</strong>
                      <span className={`admin-status-badge admin-status-${availabilityStatus.tone}`}>
                        {availabilityStatus.label}
                      </span>
                      <span className={`admin-status-badge admin-status-${stockStatus.tone}`}>
                        {stockStatus.label}
                      </span>
                    </div>
                  </div>
                  <div className="admin-product-row-actions">
                    <button
                      className="button button-secondary admin-compact-button"
                      type="button"
                      disabled={remoteBusy}
                      aria-label={`Editar ${product.name}`}
                      onClick={(event) => onEdit(product, event.currentTarget)}
                    >
                      {selected ? 'Editando' : 'Editar'}
                    </button>
                    <button
                      className="button button-secondary admin-compact-button"
                      type="button"
                      disabled={remoteBusy || (selected && isDirty)}
                      aria-label={`${product.availability === 'unavailable' ? 'Reactivar' : 'Pausar'} ${product.name}`}
                      onClick={() => onUpdateAvailability(product)}
                    >
                      {rowBusy && operation.kind === 'quick' && operation.action === 'availability'
                        ? 'Guardando…'
                        : product.availability === 'unavailable'
                          ? 'Reactivar'
                          : 'Pausar'}
                    </button>
                    <button
                      className="button button-secondary admin-compact-button"
                      type="button"
                      disabled={remoteBusy || (selected && isDirty)}
                      aria-label={`Ajustar stock de ${product.name}`}
                      onClick={() => onBeginQuickStock(product)}
                    >
                      Ajustar stock
                    </button>
                    <button
                      ref={(element) => {
                        if (element === null) deleteTriggerRefs.current.delete(product.id);
                        else deleteTriggerRefs.current.set(product.id, element);
                      }}
                      className="button button-danger admin-compact-button"
                      type="button"
                      disabled={remoteBusy || (selected && isDirty)}
                      aria-label={`Quitar ${product.name} del catálogo`}
                      onClick={() => onOpenDelete(product)}
                    >
                      Quitar
                    </button>
                  </div>

                  {quickStockId === product.id ? (
                    <form
                      className="admin-inline-editor"
                      onSubmit={(event) => onSubmitQuickStock(event, product)}
                    >
                      <label className="admin-form-field">
                        <span>Nueva cantidad</span>
                        <input
                          type="number"
                          min={product.reservedQuantity ?? 0}
                          max="1000000"
                          step="1"
                          inputMode="numeric"
                          value={quickStockValue}
                          disabled={rowBusy}
                          aria-invalid={quickStockError === '' ? undefined : true}
                          aria-describedby={quickStockError === '' ? undefined : `quick-stock-error-${product.id}`}
                          onChange={(event) => onQuickStockValueChange(event.currentTarget.value)}
                        />
                      </label>
                      {product.reservedQuantity === undefined || product.reservedQuantity === 0 ? null : (
                        <p className="admin-context-note">
                          Hay {product.reservedQuantity.toLocaleString('es-AR')} unidades reservadas;
                          el stock físico no puede quedar por debajo de ese valor.
                        </p>
                      )}
                      <div className="admin-inline-actions">
                        <button className="button button-primary admin-compact-button" type="submit" disabled={rowBusy}>
                          {rowBusy ? 'Guardando…' : 'Guardar stock'}
                        </button>
                        <button
                          className="button button-secondary admin-compact-button"
                          type="button"
                          disabled={rowBusy}
                          onClick={() => onSetUntrackedStock(product)}
                        >
                          Dejar sin stock configurado
                        </button>
                        <button
                          className="button button-secondary admin-compact-button"
                          type="button"
                          disabled={rowBusy}
                          onClick={onCancelQuickStock}
                        >
                          Cancelar
                        </button>
                      </div>
                      {quickStockError === '' ? null : (
                        <p className="admin-field-error" id={`quick-stock-error-${product.id}`} role="alert">
                          {quickStockError}
                        </p>
                      )}
                    </form>
                  ) : null}

                  {deleteCandidate?.id === product.id ? (
                    <div
                      className="admin-inline-confirmation"
                      role="dialog"
                      aria-labelledby={`delete-title-${product.id}`}
                      aria-describedby={`delete-description-${product.id}`}
                      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        if (event.key !== 'Escape' || rowBusy) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onCancelDelete();
                      }}
                    >
                      <div>
                        <h5 id={`delete-title-${product.id}`}>¿Quitar {product.name}?</h5>
                        <p id={`delete-description-${product.id}`}>
                          Dejará de aparecer en el catálogo público. La baja lógica y su auditoría se conservarán.
                        </p>
                      </div>
                      <div className="admin-inline-actions">
                        <button
                          ref={deleteCancelRef}
                          className="button button-secondary admin-compact-button"
                          type="button"
                          disabled={rowBusy}
                          onClick={onCancelDelete}
                        >
                          Cancelar
                        </button>
                        <button
                          className="button button-danger admin-compact-button"
                          type="button"
                          disabled={rowBusy}
                          onClick={() => onConfirmDelete(product)}
                        >
                          {rowBusy ? 'Quitando…' : 'Confirmar baja'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function productAvailabilityLabel(product: CatalogProductDetail) {
  if (product.availability === 'unavailable') {
    return { label: 'No disponible manualmente', tone: 'paused' } as const;
  }
  return { label: 'Disponible manualmente', tone: 'available' } as const;
}

function productStockLabel(product: CatalogProductDetail) {
  if (product.stockQuantity === undefined) {
    return { label: 'Stock sin configurar · venta bloqueada', tone: 'out' } as const;
  }
  const reserved = product.reservedQuantity ?? 0;
  const available = product.availableQuantity ?? product.stockQuantity;
  if (available === 0) {
    return {
      label: `Sin stock disponible · físico: ${product.stockQuantity.toLocaleString('es-AR')} · reservado: ${reserved.toLocaleString('es-AR')} · disponible: 0`,
      tone: 'out',
    } as const;
  }
  return {
    label: `Físico: ${product.stockQuantity.toLocaleString('es-AR')} · reservado: ${reserved.toLocaleString('es-AR')} · disponible: ${available.toLocaleString('es-AR')}`,
    tone: 'available',
  } as const;
}
