import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { normalizeSearchText } from '../catalog/catalog';
import { parseCategories, parseProductDetail, parseProducts } from '../catalog/model';
import type { CatalogCategory, CatalogProductDetail } from '../catalog/model';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';
import { ProductEditor } from './ProductEditor';
import { ProductList } from './ProductList';
import { ALL_FILTERS, UNCATEGORIZED_FILTER } from './product-management-types';
import type { AvailabilityFilter, PendingNavigation, ProductOperation, ProductSort, StockFilter } from './product-management-types';

export type ProductInteractionState = Readonly<{ dirty: boolean; busy: boolean; operationLabel?: string }>;
const IDLE_INTERACTION_STATE: ProductInteractionState = Object.freeze({ dirty: false, busy: false });

export function ProductManager({ onInteractionStateChange, onUnauthorized }: Readonly<{
  onInteractionStateChange?: ((state: ProductInteractionState) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
}>) {
  const [products, setProducts] = useState<readonly CatalogProductDetail[]>([]);
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [imageStorageConfigured, setImageStorageConfigured] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProductDetail | null>(null);
  const [description, setDescription] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string>();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTERS);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>(ALL_FILTERS);
  const [stockFilter, setStockFilter] = useState<StockFilter>(ALL_FILTERS);
  const [sort, setSort] = useState<ProductSort>('name');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [operation, setOperation] = useState<ProductOperation>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<CatalogProductDetail | null>(null);
  const operationRef = useRef(false);
  const deferredInventoryRefreshRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const editorTitleRef = useRef<HTMLHeadingElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingNavigationReturnFocusRef = useRef<HTMLElement | null>(null);
  const editingId = editingProduct?.id;
  const isDirty = editingProduct !== null && (
    description !== (editingProduct.description ?? '') || pendingImage !== null || removeImage
  );
  const remoteBusy = operation.kind !== 'idle';
  const interactionState = useMemo<ProductInteractionState>(() => ({
    dirty: isDirty, busy: remoteBusy,
    ...(remoteBusy ? { operationLabel: operation.kind === 'saving' ? 'Guardando producto' : 'Actualizando publicación' } : {}),
  }), [isDirty, remoteBusy, operation.kind]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (isDirty || operationRef.current) { deferredInventoryRefreshRef.current = true; return; }
      void reload();
    };
    window.addEventListener('shekinah:admin-products-refresh', refresh);
    return () => window.removeEventListener('shekinah:admin-products-refresh', refresh);
  }, [isDirty]);

  useEffect(() => {
    if (isDirty || remoteBusy || !deferredInventoryRefreshRef.current) return;
    deferredInventoryRefreshRef.current = false;
    void reload();
  }, [isDirty, remoteBusy]);

  useEffect(() => {
    if (!isDirty && !remoteBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, remoteBusy]);

  useEffect(() => {
    if (pendingImage === null || typeof URL.createObjectURL !== 'function') { setImagePreviewUrl(null); return; }
    const url = URL.createObjectURL(pendingImage);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  useEffect(() => {
    if (editingId !== undefined) {
      editorTitleRef.current?.focus();
      editorTitleRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [editingId]);
  useEffect(() => { onInteractionStateChange?.(interactionState); }, [interactionState, onInteractionStateChange]);
  useEffect(() => () => { onInteractionStateChange?.(IDLE_INTERACTION_STATE); }, [onInteractionStateChange]);

  const visibleProducts = useMemo(() => {
    const terms = normalizeSearchText(query).split(' ').filter(Boolean);
    return products.filter(product => {
      if (categoryFilter === UNCATEGORIZED_FILTER && product.categorySlugs.length !== 0) return false;
      if (categoryFilter !== ALL_FILTERS && categoryFilter !== UNCATEGORIZED_FILTER && !product.categorySlugs.includes(categoryFilter)) return false;
      if (availabilityFilter !== ALL_FILTERS && (product.publicationStatus ?? 'published') !== availabilityFilter) return false;
      const stock = product.commerce?.source === 'dux' ? product.commerce.observedStock?.available : undefined;
      if (stockFilter === 'unverified' && stock !== undefined) return false;
      if (stockFilter === 'in-stock' && (stock === undefined || stock <= 0)) return false;
      if (stockFilter === 'out-of-stock' && (stock === undefined || stock > 0)) return false;
      const searchable = normalizeSearchText([product.name, product.id, product.sku ?? '', ...product.categoryNames].join(' '));
      return terms.every(term => searchable.includes(term));
    }).sort(productComparator(sort));
  }, [products, query, categoryFilter, availabilityFilter, stockFilter, sort]);
  const unpublishedCount = products.filter(product => product.publicationStatus === 'unpublished').length;

  async function reload(signal?: AbortSignal): Promise<void> {
    const sequence = ++loadSequenceRef.current;
    setLoading(true); setLoadError('');
    try {
      const catalog = parseAdminCatalog(await adminJson('/api/admin/products', signal === undefined ? undefined : { signal }, onUnauthorized));
      if (signal?.aborted === true || sequence !== loadSequenceRef.current) return;
      setProducts(catalog.products); setCategories(catalog.categories); setImageStorageConfigured(catalog.imageStorageConfigured);
    } catch (cause: unknown) {
      if (signal?.aborted !== true && sequence === loadSequenceRef.current) setLoadError(errorMessage(cause));
    } finally {
      if (signal?.aborted !== true && sequence === loadSequenceRef.current) setLoading(false);
    }
  }

  function replaceProduct(product: CatalogProductDetail): void {
    setProducts(current => current.map(candidate => candidate.id === product.id ? product : candidate));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (editingProduct === null || operationRef.current || !isDirty) return;
    const validation = pendingImage === null ? null : validateImage(pendingImage);
    if (validation !== null) { setImageError(validation); fileInputRef.current?.focus(); return; }
    operationRef.current = true;
    setOperation({ kind: 'saving', stage: 'product' }); setError(''); setMessage('');
    let persisted = editingProduct;
    let descriptionSaved = false;
    try {
      if (description !== (editingProduct.description ?? '')) {
        persisted = parseAdminProduct(await adminJson(`/api/admin/products/${encodeURIComponent(editingProduct.id)}`, {
          method: 'PATCH', body: JSON.stringify({ description }),
        }, onUnauthorized), categories);
        replaceProduct(persisted); setEditingProduct(persisted); setDescription(persisted.description ?? '');
        descriptionSaved = true;
      }
      if (pendingImage !== null || removeImage) {
        setOperation({ kind: 'saving', stage: 'image' });
        persisted = parseAdminProduct(await adminRequest(`/api/admin/products/${encodeURIComponent(persisted.id)}/image`,
          pendingImage === null ? { method: 'DELETE' } : {
            method: 'PUT', headers: { 'content-type': pendingImage.type }, body: pendingImage,
          }, onUnauthorized), categories);
        replaceProduct(persisted); setEditingProduct(persisted);
        setPendingImage(null); setRemoveImage(false); clearFileInput();
      }
      setMessage(`Cambios de ${persisted.name} guardados.`);
      await refreshRuntimeCatalog();
    } catch (cause: unknown) {
      setError(`${descriptionSaved ? 'La descripción se guardó, pero la imagen no pudo actualizarse. ' : ''}${errorMessage(cause)}`);
      if (descriptionSaved) await refreshRuntimeCatalog();
    } finally { operationRef.current = false; setOperation({ kind: 'idle' }); }
  }

  async function setPublication(product: CatalogProductDetail, published: boolean): Promise<void> {
    if (operationRef.current || isDirty) return;
    operationRef.current = true;
    setOperation(published ? { kind: 'quick', productId: product.id, action: 'availability' } : { kind: 'deleting', productId: product.id });
    setError(''); setMessage('');
    try {
      const updated = parseAdminProduct(await adminJson(`/api/admin/products/${encodeURIComponent(product.id)}`,
        published ? { method: 'PATCH', body: JSON.stringify({ publicationStatus: 'published' }) } : { method: 'DELETE' }, onUnauthorized), categories);
      replaceProduct(updated);
      if (editingId === product.id) setEditingProduct(updated);
      setDeleteCandidate(null);
      setMessage(published ? `${product.name} volvió a publicarse.` : `${product.name} se dio de baja de la web. Podés volver a publicarlo al final de la lista.`);
      await refreshRuntimeCatalog();
    } catch (cause: unknown) { setError(errorMessage(cause)); }
    finally { operationRef.current = false; setOperation({ kind: 'idle' }); }
  }

  function clearFileInput(): void { if (fileInputRef.current !== null) fileInputRef.current.value = ''; }
  function resetEditor(): void {
    setPendingImage(null); setRemoveImage(false); setImageError(undefined); setPendingNavigation(null); clearFileInput();
  }
  function openEdit(product: CatalogProductDetail): void {
    setEditingProduct(product); setDescription(product.description ?? ''); resetEditor(); setDeleteCandidate(null);
  }
  function closeEditor(): void {
    setEditingProduct(null); resetEditor();
    window.requestAnimationFrame(() => {
      if (editorTriggerRef.current?.isConnected === true) editorTriggerRef.current.focus();
      else document.getElementById('product-list-title')?.focus();
    });
  }
  function requestEdit(product: CatalogProductDetail, trigger: HTMLButtonElement): void {
    if (operationRef.current || loading) return;
    if (editingId === product.id) { editorTitleRef.current?.focus(); return; }
    editorTriggerRef.current = trigger;
    if (isDirty) { pendingNavigationReturnFocusRef.current = trigger; setPendingNavigation({ kind: 'edit', product }); return; }
    openEdit(product);
  }
  function requestClose(trigger: HTMLButtonElement): void {
    if (operationRef.current) return;
    if (isDirty) { pendingNavigationReturnFocusRef.current = trigger; setPendingNavigation({ kind: 'close' }); return; }
    closeEditor();
  }
  function selectImage(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) return;
    const validation = validateImage(file);
    setImageError(validation ?? undefined);
    if (validation !== null) { clearFileInput(); return; }
    setPendingImage(file); setRemoveImage(false);
  }

  return <section className="admin-page section" aria-labelledby="backoffice-title">
    <div className="container admin-product-shell">
      <header className="admin-product-header">
        <div className="section-heading">
          <p className="eyebrow">Administración</p>
          <h2 id="backoffice-title">Catálogo de productos</h2>
          <p>Editá fotos y descripciones, o elegí qué productos mostrar en la web.</p>
          <p className="admin-field-note">Los productos nuevos, los precios y el stock se administran en Dux.</p>
        </div>
      </header>
      <p className="admin-catalog-totals" hidden={loading || loadError !== ''}>
        <strong>{products.length} {products.length === 1 ? 'producto' : 'productos'}</strong>
        <span>{products.length - unpublishedCount} {products.length - unpublishedCount === 1 ? 'publicado' : 'publicados'}</span>
        <span>{unpublishedCount} {unpublishedCount === 1 ? 'dado de baja' : 'dados de baja'}</span>
      </p>
      {message === '' ? null : <div className="admin-feedback admin-feedback-success" role="status" aria-live="polite">
        <span>{message}</span><button type="button" onClick={() => setMessage('')}>Cerrar mensaje</button>
      </div>}
      {error === '' ? null : <div className="admin-feedback form-error" role="alert">
        <span>{error}</span><button type="button" onClick={() => setError('')}>Cerrar error</button>
      </div>}
      <div className={`admin-catalog-workspace${editingProduct !== null ? ' has-editor' : ''}`}>
        <ProductList categories={categories} availabilityFilter={availabilityFilter} categoryFilter={categoryFilter}
          deleteCandidate={deleteCandidate} editingId={editingId} isDirty={isDirty} loadError={loadError} loading={loading}
          operation={operation} query={query} remoteBusy={remoteBusy} sort={sort} stockFilter={stockFilter}
          totalProductCount={products.length} visibleProducts={visibleProducts}
          onAvailabilityFilterChange={setAvailabilityFilter} onCancelDelete={() => setDeleteCandidate(null)}
          onCategoryFilterChange={setCategoryFilter} onConfirmDelete={product => void setPublication(product, false)}
          onEdit={requestEdit} onRetryLoad={() => void reload()} onOpenDelete={setDeleteCandidate} onQueryChange={setQuery}
          onResetFilters={() => { setQuery(''); setCategoryFilter(ALL_FILTERS); setAvailabilityFilter(ALL_FILTERS); setStockFilter(ALL_FILTERS); }}
          onSortChange={setSort} onStockFilterChange={setStockFilter} onUpdateAvailability={product => void setPublication(product, true)} />
        {editingProduct === null ? null : <ProductEditor key={editingProduct.id} product={editingProduct}
          description={description} onDescriptionChange={setDescription} imageError={imageError} fileInputRef={fileInputRef}
          imagePreviewUrl={imagePreviewUrl} imageStorageConfigured={imageStorageConfigured} isDirty={isDirty}
          operation={operation} pendingImage={pendingImage} pendingNavigation={pendingNavigation}
          pendingNavigationReturnFocus={pendingNavigationReturnFocusRef.current} removeImage={removeImage} titleRef={editorTitleRef}
          onCancelPendingNavigation={() => setPendingNavigation(null)} onConfirmPendingNavigation={() => {
            if (pendingNavigation?.kind === 'edit') openEdit(pendingNavigation.product);
            else closeEditor();
          }} onDiscardImage={() => { setPendingImage(null); clearFileInput(); }} onRequestClose={requestClose}
          onSelectImage={selectImage} onSubmit={event => void submit(event)} onToggleRemoveImage={() => setRemoveImage(current => !current)} />}
      </div>
    </div>
  </section>;
}

function productComparator(sort: ProductSort) {
  return (left: CatalogProductDetail, right: CatalogProductDetail): number => {
    const status = Number(left.publicationStatus === 'unpublished') - Number(right.publicationStatus === 'unpublished');
    if (status !== 0) return status;
    const names = () => left.name.localeCompare(right.name, 'es-AR', { sensitivity: 'base' });
    if (sort === 'category') return left.categoryNames.join(' ').localeCompare(right.categoryNames.join(' '), 'es-AR', { sensitivity: 'base' }) || names();
    if (sort === 'price-asc' || sort === 'price-desc') {
      const a = (left.salePrice ?? left.price)?.amount; const b = (right.salePrice ?? right.price)?.amount;
      if (a === undefined || b === undefined) return a === b ? names() : a === undefined ? 1 : -1;
      return (sort === 'price-desc' ? b - a : a - b) || names();
    }
    if (sort === 'stock-asc' || sort === 'stock-desc') {
      const a = left.commerce?.source === 'dux' ? left.commerce.observedStock?.available : undefined;
      const b = right.commerce?.source === 'dux' ? right.commerce.observedStock?.available : undefined;
      if (a === undefined || b === undefined) return a === b ? names() : a === undefined ? 1 : -1;
      return (sort === 'stock-desc' ? b - a : a - b) || names();
    }
    return names();
  };
}

function parseAdminCatalog(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.products) || !Array.isArray(payload.categories) ||
    typeof payload.imageStorageConfigured !== 'boolean' || payload.manualCatalogRetired !== true ||
    !payload.products.every((value: unknown) => isRecord(value) && typeof value.sku === 'string' && value.sku.trim() !== '' && isRecord(value.commerce) && value.commerce.source === 'dux')) {
    throw new Error('Respuesta de catálogo inválida.');
  }
  const categories = parseCategories(payload.categories);
  const raw: unknown[] = payload.products;
  const summaries = parseProducts(raw, categories);
  return { categories, products: summaries.map((summary, index) => parseProductDetail(summary, raw[index])), imageStorageConfigured: payload.imageStorageConfigured };
}
function parseAdminProduct(payload: unknown, categories: readonly CatalogCategory[]): CatalogProductDetail {
  if (!isRecord(payload) || !isRecord(payload.product) || !isRecord(payload.product.commerce) || payload.product.commerce.source !== 'dux') throw new Error('Respuesta de producto inválida.');
  const summary = parseProducts([payload.product], categories)[0];
  if (summary === undefined) throw new Error('Respuesta de producto inválida.');
  return parseProductDetail(summary, payload.product);
}
function validateImage(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Seleccioná una imagen JPEG, PNG o WebP.';
  if (file.size <= 0 || file.size > 4 * 1024 * 1024) return 'La imagen debe pesar más de 0 bytes y como máximo 4 MiB.';
  return null;
}
async function adminJson(path: string, init?: RequestInit, onUnauthorized?: () => void): Promise<unknown> {
  return adminRequest(path, { ...init, ...(init?.body === undefined ? {} : { headers: { 'content-type': 'application/json' } }) }, onUnauthorized);
}
async function adminRequest(path: string, init: RequestInit, onUnauthorized?: () => void): Promise<unknown> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (response.status === 401) { onUnauthorized?.(); throw new Error('La sesión administrativa venció.'); }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* Normalize invalid responses below. */ }
  if (!response.ok) {
    throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message : 'No se pudo completar la operación administrativa.');
  }
  return payload;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }
