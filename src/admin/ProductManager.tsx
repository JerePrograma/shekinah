import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { normalizeSearchText } from '../catalog/catalog';
import {
  InvalidProductError,
  MAX_STOCK_QUANTITY,
  isProductEffectivelyAvailable,
  parseProductDetail,
  parseProducts,
} from '../catalog/model';
import type { CatalogProductDetail } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';
import { ProductEditor } from './ProductEditor';
import { ProductList } from './ProductList';
import {
  ALL_FILTERS,
  UNCATEGORIZED_FILTER,
} from './product-management-types';
import type {
  AvailabilityFilter,
  PendingNavigation,
  ProductFieldErrors,
  ProductFieldName,
  ProductFormState,
  ProductOperation,
  ProductSort,
  StockFilter,
} from './product-management-types';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ProductInteractionState = Readonly<{
  dirty: boolean;
  busy: boolean;
  operationLabel?: string;
}>;

const IDLE_INTERACTION_STATE: ProductInteractionState = Object.freeze({
  dirty: false,
  busy: false,
});

const EMPTY_FORM: ProductFormState = Object.freeze({
  slug: '',
  name: '',
  categorySlugs: Object.freeze([]),
  presentation: '',
  price: '',
  salePrice: '',
  sku: '',
  availability: 'available',
  trackStock: false,
  stockQuantity: '',
  shortDescription: '',
  description: '',
  images: Object.freeze([]),
  variants: '[]',
});

export function ProductManager({
  onInteractionStateChange,
  onUnauthorized,
}: Readonly<{
  onInteractionStateChange?: ((state: ProductInteractionState) => void) | undefined;
  onUnauthorized?: (() => void) | undefined;
}>) {
  const [products, setProducts] = useState<readonly CatalogProductDetail[]>([]);
  const [imageStorageConfigured, setImageStorageConfigured] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<ProductFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTERS);
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>(ALL_FILTERS);
  const [stockFilter, setStockFilter] = useState<StockFilter>(ALL_FILTERS);
  const [sort, setSort] = useState<ProductSort>('name');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [operation, setOperation] = useState<ProductOperation>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<CatalogProductDetail | null>(null);
  const [quickStockId, setQuickStockId] = useState<string | null>(null);
  const [quickStockValue, setQuickStockValue] = useState('');
  const [quickStockError, setQuickStockError] = useState('');
  const submitRef = useRef(false);
  const deferredInventoryRefreshRef = useRef(false);
  const editorTitleRef = useRef<HTMLHeadingElement | null>(null);
  const editorFormRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingNavigationReturnFocusRef = useRef<HTMLElement | null>(null);

  const editorOpen = editingId !== undefined;
  const inventoryReadOnly = editingId !== null && editingId !== undefined &&
    products.find((product) => product.id === editingId)?.commerce?.source === 'dux';
  const isDirty = editorOpen && (
    !formsEqual(form, baseline) || pendingImage !== null || removeImage
  );
  const remoteBusy = operation.kind !== 'idle';
  const interactionState = useMemo<ProductInteractionState>(() => {
    const operationLabel = productOperationLabel(operation, products);
    return operationLabel === null
      ? Object.freeze({ dirty: isDirty, busy: remoteBusy })
      : Object.freeze({ dirty: isDirty, busy: remoteBusy, operationLabel });
  }, [isDirty, operation, products, remoteBusy]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleInventoryRefresh = () => {
      if (isDirty || remoteBusy) {
        deferredInventoryRefreshRef.current = true;
        return;
      }
      void reload();
    };
    window.addEventListener('shekinah:admin-products-refresh', handleInventoryRefresh);
    return () => window.removeEventListener('shekinah:admin-products-refresh', handleInventoryRefresh);
  }, [isDirty, remoteBusy]);

  useEffect(() => {
    if (isDirty || remoteBusy || !deferredInventoryRefreshRef.current) return;
    deferredInventoryRefreshRef.current = false;
    void reload();
  }, [isDirty, remoteBusy]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (message === '') return undefined;
    const timeout = window.setTimeout(() => setMessage(''), 5_000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (pendingImage === null || typeof URL.createObjectURL !== 'function') {
      setImagePreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(pendingImage);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingImage]);

  useEffect(() => {
    if (editorOpen) editorTitleRef.current?.focus();
  }, [editingId, editorOpen]);

  useEffect(() => {
    onInteractionStateChange?.(interactionState);
  }, [interactionState, onInteractionStateChange]);

  useEffect(() => () => {
    onInteractionStateChange?.(IDLE_INTERACTION_STATE);
  }, [onInteractionStateChange]);

  const summary = useMemo(() => Object.freeze({
    total: products.length,
    available: products.filter(isProductEffectivelyAvailable).length,
    manuallyUnavailable: products.filter(
      (product) => product.availability === 'unavailable',
    ).length,
    outOfStock: products.filter(
      (product) => (product.availableQuantity ?? product.stockQuantity) === 0,
    ).length,
  }), [products]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const terms = normalizedQuery === '' ? [] : normalizedQuery.split(' ');
    return [...products]
      .filter((product) => {
        if (categoryFilter === UNCATEGORIZED_FILTER && product.categorySlugs.length !== 0) {
          return false;
        }
        if (
          categoryFilter !== ALL_FILTERS &&
          categoryFilter !== UNCATEGORIZED_FILTER &&
          !product.categorySlugs.includes(categoryFilter)
        ) return false;
        const effectivelyAvailable = isProductEffectivelyAvailable(product);
        if (availabilityFilter === 'available' && !effectivelyAvailable) return false;
        if (availabilityFilter === 'unavailable' && effectivelyAvailable) return false;
        if (stockFilter === 'untracked' && product.stockQuantity !== undefined) return false;
        if (
          stockFilter === 'in-stock' &&
          ((product.availableQuantity ?? product.stockQuantity) === undefined ||
            (product.availableQuantity ?? product.stockQuantity ?? 0) <= 0)
        ) {
          return false;
        }
        if (
          stockFilter === 'out-of-stock' &&
          (product.availableQuantity ?? product.stockQuantity) !== 0
        ) return false;
        if (terms.length === 0) return true;
        const searchableText = normalizeSearchText([
          product.name,
          product.id,
          product.sku ?? '',
          product.presentation ?? '',
          ...product.categoryNames,
        ].join(' '));
        return terms.every((term) => searchableText.includes(term));
      })
      .sort(productComparator(sort));
  }, [availabilityFilter, categoryFilter, products, query, sort, stockFilter]);

  async function reload(signal?: AbortSignal): Promise<void> {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await adminJson(
        '/api/admin/products',
        signal === undefined ? undefined : { signal },
        false,
        onUnauthorized,
      );
      const catalog = parseAdminCatalog(payload);
      setProducts(catalog.products);
      setImageStorageConfigured(catalog.imageStorageConfigured);
    } catch (loadError: unknown) {
      if (signal?.aborted === true) return;
      setLoadError(errorMessage(loadError));
    } finally {
      if (signal?.aborted !== true) setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (remoteBusy || submitRef.current) return;
    const validation = validateForm(form, pendingImage, editingId === null);
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      setError('Revisá los campos indicados antes de guardar.');
      focusFirstInvalidField(editorFormRef.current, validation);
      return;
    }

    submitRef.current = true;
    setOperation({ kind: 'saving', stage: 'product' });
    setError('');
    setMessage('');
    let persistedProduct: CatalogProductDetail | null = null;
    const creating = editingId === null;
    try {
      const productPayload = buildPayload(form);
      const responsePayload = await adminJson(
        creating
          ? '/api/admin/products'
          : `/api/admin/products/${encodeURIComponent(editingId ?? '')}`,
        {
          method: creating ? 'POST' : 'PUT',
          body: JSON.stringify(productPayload),
        },
        false,
        onUnauthorized,
      );
      persistedProduct = parseAdminProduct(responsePayload);
      applyPersistedEditorProduct(persistedProduct);

      if (pendingImage !== null) {
        setOperation({ kind: 'saving', stage: 'image' });
        const imagePayload = await adminImageUpload(
          persistedProduct.id,
          pendingImage,
          onUnauthorized,
        );
        persistedProduct = parseAdminProduct(imagePayload);
      } else if (removeImage && persistedProduct.primaryImage !== undefined) {
        setOperation({ kind: 'saving', stage: 'image' });
        const imagePayload = await adminJson(
          `/api/admin/products/${encodeURIComponent(persistedProduct.id)}/image`,
          { method: 'DELETE' },
          true,
          onUnauthorized,
        );
        persistedProduct = imagePayload === null
          ? await loadAdminProduct(persistedProduct.id, onUnauthorized)
          : parseAdminProduct(imagePayload);
      }

      applyPersistedEditorProduct(persistedProduct);
      setPendingImage(null);
      setRemoveImage(false);
      clearFileInput();
      if (creating) {
        setQuery('');
        setCategoryFilter(ALL_FILTERS);
        setAvailabilityFilter(ALL_FILTERS);
        setStockFilter(ALL_FILTERS);
      }
      await refreshRuntimeCatalog();
      setMessage(creating ? 'Producto creado correctamente.' : 'Cambios guardados correctamente.');
    } catch (saveError: unknown) {
      if (persistedProduct !== null) {
        applyPersistedEditorProduct(persistedProduct);
        setError(
          `Los datos del producto se guardaron, pero la imagen no pudo actualizarse. ${errorMessage(saveError)}`,
        );
      } else {
        setError(errorMessage(saveError));
      }
    } finally {
      submitRef.current = false;
      setOperation({ kind: 'idle' });
    }
  }

  async function updateAvailability(product: CatalogProductDetail): Promise<void> {
    if (remoteBusy) return;
    const nextAvailability = product.availability === 'unavailable'
      ? 'available'
      : 'unavailable';
    setOperation({ kind: 'quick', productId: product.id, action: 'availability' });
    setError('');
    setMessage('');
    try {
      const payload = await adminJson(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ availability: nextAvailability }),
        },
        false,
        onUnauthorized,
      );
      const updated = parseAdminProduct(payload);
      replaceProduct(updated);
      await refreshRuntimeCatalog();
      setMessage(
        nextAvailability === 'available'
          ? isProductEffectivelyAvailable(updated)
            ? `${product.name} quedó disponible para venta.`
            : `La disponibilidad manual de ${product.name} quedó activa, pero sigue fuera de venta porque no tiene stock.`
          : `${product.name} quedó pausado manualmente.`,
      );
    } catch (updateError: unknown) {
      setError(errorMessage(updateError));
    } finally {
      setOperation({ kind: 'idle' });
    }
  }

  async function updateQuickStock(
    product: CatalogProductDetail,
    nextStock: number | null,
  ): Promise<void> {
    if (remoteBusy) return;
    setOperation({ kind: 'quick', productId: product.id, action: 'stock' });
    setQuickStockError('');
    setError('');
    setMessage('');
    try {
      const payload = await adminJson(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ stockQuantity: nextStock }),
        },
        false,
        onUnauthorized,
      );
      const updated = parseAdminProduct(payload);
      replaceProduct(updated);
      setQuickStockId(null);
      await refreshRuntimeCatalog();
      setMessage(
        nextStock === null
          ? `${product.name} quedó sin control de stock.`
          : `Stock de ${product.name} actualizado a ${nextStock}.`,
      );
    } catch (updateError: unknown) {
      setQuickStockError(errorMessage(updateError));
    } finally {
      setOperation({ kind: 'idle' });
    }
  }

  async function remove(product: CatalogProductDetail): Promise<void> {
    if (remoteBusy) return;
    setOperation({ kind: 'deleting', productId: product.id });
    setError('');
    setMessage('');
    try {
      await adminJson(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        { method: 'DELETE' },
        true,
        onUnauthorized,
      );
      setProducts((current) => current.filter((candidate) => candidate.id !== product.id));
      if (editingId === product.id) closeEditorImmediately();
      setDeleteCandidate(null);
      await refreshRuntimeCatalog();
      setMessage(`${product.name} fue quitado del catálogo público.`);
    } catch (deleteError: unknown) {
      setError(errorMessage(deleteError));
    } finally {
      setOperation({ kind: 'idle' });
    }
  }

  function applyPersistedEditorProduct(product: CatalogProductDetail): void {
    replaceProduct(product);
    const nextForm = formFromProduct(product);
    setEditingId(product.id);
    setForm(nextForm);
    setBaseline(nextForm);
    setSlugManuallyEdited(true);
    setFieldErrors({});
  }

  function replaceProduct(product: CatalogProductDetail): void {
    setProducts((current) => {
      const exists = current.some((candidate) => candidate.id === product.id);
      return exists
        ? current.map((candidate) => candidate.id === product.id ? product : candidate)
        : [...current, product];
    });
    if (editingId === product.id && !isDirty) {
      const nextForm = formFromProduct(product);
      setForm(nextForm);
      setBaseline(nextForm);
    }
  }

  function updateField<K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === 'trackStock' && value === false) clearFieldError('stockQuantity');
    else clearFieldError(key as ProductFieldName);
  }

  function updateName(value: string): void {
    setForm((current) => ({
      ...current,
      name: value,
      ...(editingId === null && !slugManuallyEdited
        ? { slug: createUniqueSlug(value, products) }
        : {}),
    }));
    clearFieldError('name');
    if (!slugManuallyEdited) clearFieldError('slug');
  }

  function clearFieldError(field: ProductFieldName): void {
    setFieldErrors((current) => {
      if (!Object.hasOwn(current, field)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function toggleCategory(slug: string, checked: boolean): void {
    setForm((current) => ({
      ...current,
      categorySlugs: checked
        ? [...current.categorySlugs, slug]
        : current.categorySlugs.filter((value) => value !== slug),
    }));
    clearFieldError('categorySlugs');
  }

  function requestEdit(
    product: CatalogProductDetail,
    returnFocusTarget: HTMLButtonElement,
  ): void {
    if (editingId === product.id) return;
    if (isDirty) {
      pendingNavigationReturnFocusRef.current = returnFocusTarget;
      setPendingNavigation({ kind: 'edit', product });
      return;
    }
    openEdit(product);
  }

  function requestNew(returnFocusTarget: HTMLButtonElement): void {
    if (isDirty) {
      pendingNavigationReturnFocusRef.current = returnFocusTarget;
      setPendingNavigation({ kind: 'new' });
      return;
    }
    openNew();
  }

  function requestClose(returnFocusTarget: HTMLButtonElement): void {
    if (isDirty) {
      pendingNavigationReturnFocusRef.current = returnFocusTarget;
      setPendingNavigation({ kind: 'close' });
      return;
    }
    closeEditorImmediately();
  }

  function confirmPendingNavigation(): void {
    const pending = pendingNavigation;
    setPendingNavigation(null);
    if (pending === null) return;
    if (pending.kind === 'edit') openEdit(pending.product);
    else if (pending.kind === 'new') openNew();
    else closeEditorImmediately();
  }

  function openEdit(product: CatalogProductDetail): void {
    const nextForm = formFromProduct(product);
    setEditingId(product.id);
    setForm(nextForm);
    setBaseline(nextForm);
    setSlugManuallyEdited(true);
    resetEditorTransientState();
  }

  function openNew(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setSlugManuallyEdited(false);
    resetEditorTransientState();
  }

  function closeEditorImmediately(): void {
    setEditingId(undefined);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setSlugManuallyEdited(false);
    resetEditorTransientState();
  }

  function resetEditorTransientState(): void {
    setPendingImage(null);
    setRemoveImage(false);
    setFieldErrors({});
    setError('');
    setMessage('');
    setPendingNavigation(null);
    pendingNavigationReturnFocusRef.current = null;
    clearFileInput();
  }

  function clearFileInput(): void {
    if (fileInputRef.current !== null) fileInputRef.current.value = '';
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file === null) return;
    const imageError = validateImage(file);
    if (imageError !== null) {
      setFieldErrors((current) => ({ ...current, image: imageError }));
      event.currentTarget.value = '';
      return;
    }
    setPendingImage(file);
    setRemoveImage(false);
    clearFieldError('image');
  }

  function beginQuickStock(product: CatalogProductDetail): void {
    setQuickStockId(product.id);
    setQuickStockValue(
      product.stockQuantity === undefined ? '' : String(product.stockQuantity),
    );
    setQuickStockError('');
  }

  function submitQuickStock(
    event: FormEvent<HTMLFormElement>,
    product: CatalogProductDetail,
  ): void {
    event.preventDefault();
    const quickStockForm = event.currentTarget;
    const stock = parseStockQuantity(quickStockValue);
    if (stock === null) {
      setQuickStockError(
        `Indicá una cantidad entera entre 0 y ${MAX_STOCK_QUANTITY.toLocaleString('es-AR')}.`,
      );
      window.requestAnimationFrame(() => {
        quickStockForm.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
      });
      return;
    }
    void updateQuickStock(product, stock);
  }

  return (
    <section className="admin-page section" aria-labelledby="backoffice-title">
      <div className="container admin-product-shell">
        <header className="admin-product-header">
          <div className="section-heading">
            <p className="eyebrow">Administración</p>
            <h2 id="backoffice-title">Catálogo de productos</h2>
            <p>Encontrá, actualizá y publicá productos sin perder de vista el catálogo.</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={remoteBusy || loading || loadError !== ''}
            onClick={(event) => requestNew(event.currentTarget)}
          >
            Nuevo producto
          </button>
        </header>

        <section aria-labelledby="catalog-summary-title" hidden={loading || loadError !== ''}>
          <h3 className="visually-hidden" id="catalog-summary-title">Resumen del catálogo</h3>
          <dl className="admin-catalog-summary">
            <SummaryItem label="Productos" value={summary.total} />
            <SummaryItem label="Disponibles para venta" value={summary.available} tone="available" />
            <SummaryItem label="Pausados manualmente" value={summary.manuallyUnavailable} tone="paused" />
            <SummaryItem label="Sin stock" value={summary.outOfStock} tone="out" />
          </dl>
        </section>

        {message === '' ? null : (
          <div className="admin-feedback admin-feedback-success" role="status" aria-live="polite">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')}>Cerrar mensaje</button>
          </div>
        )}
        {error === '' ? null : (
          <div className="admin-feedback form-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>Cerrar error</button>
          </div>
        )}

        <div className={`admin-catalog-workspace${editorOpen ? ' has-editor' : ''}`}>
          <ProductList
            availabilityFilter={availabilityFilter}
            categoryFilter={categoryFilter}
            deleteCandidate={deleteCandidate}
            editingId={editingId}
            isDirty={isDirty}
            loadError={loadError}
            loading={loading}
            operation={operation}
            query={query}
            quickStockError={quickStockError}
            quickStockId={quickStockId}
            quickStockValue={quickStockValue}
            remoteBusy={remoteBusy}
            sort={sort}
            stockFilter={stockFilter}
            totalProductCount={products.length}
            visibleProducts={visibleProducts}
            onAvailabilityFilterChange={setAvailabilityFilter}
            onBeginQuickStock={beginQuickStock}
            onCancelDelete={() => setDeleteCandidate(null)}
            onCancelQuickStock={() => setQuickStockId(null)}
            onCategoryFilterChange={setCategoryFilter}
            onConfirmDelete={(product) => void remove(product)}
            onEdit={requestEdit}
            onRetryLoad={() => void reload()}
            onOpenDelete={setDeleteCandidate}
            onQueryChange={setQuery}
            onQuickStockValueChange={(value) => {
              setQuickStockValue(value);
              setQuickStockError('');
            }}
            onResetFilters={() => {
              setQuery('');
              setCategoryFilter(ALL_FILTERS);
              setAvailabilityFilter(ALL_FILTERS);
              setStockFilter(ALL_FILTERS);
            }}
            onSetUntrackedStock={(product) => void updateQuickStock(product, null)}
            onSortChange={setSort}
            onStockFilterChange={setStockFilter}
            onSubmitQuickStock={submitQuickStock}
            onUpdateAvailability={(product) => void updateAvailability(product)}
          />
          {editorOpen ? (
            <ProductEditor
              baseline={baseline}
              editingId={editingId ?? null}
              fieldErrors={fieldErrors}
              fileInputRef={fileInputRef}
              form={form}
              formRef={editorFormRef}
              imagePreviewUrl={imagePreviewUrl}
              imageStorageConfigured={imageStorageConfigured}
              inventoryReadOnly={inventoryReadOnly}
              isDirty={isDirty}
              operation={operation}
              pendingImage={pendingImage}
              pendingNavigation={pendingNavigation}
              pendingNavigationReturnFocus={pendingNavigationReturnFocusRef.current}
              removeImage={removeImage}
              titleRef={editorTitleRef}
              onCancelPendingNavigation={() => setPendingNavigation(null)}
              onConfirmPendingNavigation={confirmPendingNavigation}
              onDiscardImage={() => {
                setPendingImage(null);
                clearFileInput();
              }}
              onNameChange={updateName}
              onRequestClose={requestClose}
              onSelectImage={selectImage}
              onSlugChange={(value) => {
                setSlugManuallyEdited(true);
                updateField('slug', value);
              }}
              onSubmit={(event) => void submit(event)}
              onToggleCategory={toggleCategory}
              onToggleRemoveImage={() => setRemoveImage((current) => !current)}
              onUpdateField={updateField}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SummaryItem({
  label,
  tone,
  value,
}: Readonly<{
  label: string;
  tone?: 'available' | 'paused' | 'out';
  value: number;
}>) {
  return (
    <div className={tone === undefined ? undefined : `admin-summary-${tone}`}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString('es-AR')}</dd>
    </div>
  );
}

function validateForm(
  form: ProductFormState,
  image: File | null,
  creating: boolean,
): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  if (form.name.trim() === '') errors.name = 'Ingresá el nombre del producto.';
  if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(form.slug.trim())) {
    errors.slug = 'Usá letras minúsculas, números y guiones.';
  }
  if (creating && form.categorySlugs.length === 0) {
    errors.categorySlugs = 'Seleccioná al menos una categoría.';
  }
  const priceError = validatePrice(form.price, false);
  if (priceError !== null) errors.price = priceError;
  const salePriceError = validatePrice(form.salePrice, true);
  if (salePriceError !== null) errors.salePrice = salePriceError;
  if (form.trackStock && parseStockQuantity(form.stockQuantity) === null) {
    errors.stockQuantity =
      `Indicá una cantidad entera entre 0 y ${MAX_STOCK_QUANTITY.toLocaleString('es-AR')}.`;
  }
  if (image !== null) {
    const imageError = validateImage(image);
    if (imageError !== null) errors.image = imageError;
  }
  return errors;
}

function validatePrice(value: string, optional: boolean): string | null {
  if (optional && value.trim() === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Ingresá un importe mayor que cero.';
  const minor = amount * 100;
  if (
    !Number.isSafeInteger(Math.round(minor)) ||
    Math.abs(minor - Math.round(minor)) > 0.000001
  ) {
    return 'Usá como máximo dos decimales.';
  }
  return null;
}

function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Seleccioná una imagen JPEG, PNG o WebP.';
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return 'La imagen debe pesar más de 0 bytes y como máximo 4 MiB.';
  }
  return null;
}

function parseStockQuantity(value: string): number | null {
  const normalized = value.trim();
  if (normalized === '') return null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= MAX_STOCK_QUANTITY
    ? numeric
    : null;
}

function focusFirstInvalidField(
  formElement: HTMLFormElement | null,
  errors: ProductFieldErrors,
): void {
  if (formElement === null) return;
  const targets: readonly Readonly<{
    field: ProductFieldName;
    selector: string;
  }>[] = [
    { field: 'name', selector: '[aria-labelledby="product-name-label"]' },
    { field: 'categorySlugs', selector: '.admin-category-options input[type="checkbox"]' },
    { field: 'price', selector: '[aria-labelledby="product-price-label"]' },
    { field: 'salePrice', selector: '[aria-labelledby="product-sale-price-label"]' },
    { field: 'image', selector: 'input[type="file"]' },
    { field: 'stockQuantity', selector: '[aria-labelledby="product-stock-label"]' },
    { field: 'slug', selector: '[aria-labelledby="product-slug-label"]' },
  ];
  const target = targets.find(({ field }) => Object.hasOwn(errors, field));
  if (target === undefined) return;
  if (target.field === 'slug') {
    const advancedFields = formElement.querySelector<HTMLDetailsElement>('.admin-advanced-fields');
    if (advancedFields !== null) advancedFields.open = true;
  }
  window.requestAnimationFrame(() => {
    const control = formElement.querySelector<HTMLElement>(target.selector);
    control?.focus();
    control?.scrollIntoView?.({ block: 'nearest' });
  });
}

function productOperationLabel(
  operation: ProductOperation,
  products: readonly CatalogProductDetail[],
): string | null {
  if (operation.kind === 'idle') return null;
  if (operation.kind === 'saving') {
    return operation.stage === 'image' ? 'Actualizando imagen' : 'Guardando producto';
  }
  const productName = products.find(({ id }) => id === operation.productId)?.name ?? 'producto';
  if (operation.kind === 'deleting') return `Quitando ${productName} del catálogo`;
  return operation.action === 'availability'
    ? `Actualizando disponibilidad de ${productName}`
    : `Actualizando stock de ${productName}`;
}

function buildPayload(form: ProductFormState): CatalogProductDetail {
  let variants: unknown;
  try {
    variants = JSON.parse(form.variants || '[]') as unknown;
  } catch (parseError: unknown) {
    throw new Error('El contenido de variantes no es válido.', { cause: parseError });
  }

  const slug = form.slug.trim();
  const categoryBySlug = new Map(
    authorizedCategories.map((category) => [category.slug, category]),
  );
  const saleAmount = form.salePrice.trim() === '' ? null : Number(form.salePrice);
  const images = form.images.map((image) => ({ ...image, alt: form.name.trim() }));
  const value: unknown = {
    id: slug,
    slug,
    path: `/${slug}/`,
    name: form.name.trim(),
    categorySlugs: [...form.categorySlugs],
    categoryNames: form.categorySlugs.map(
      (categorySlug) => categoryBySlug.get(categorySlug)?.name ?? '',
    ),
    ...(form.presentation.trim() === '' ? {} : { presentation: form.presentation.trim() }),
    price: { amount: Number(form.price), currency: 'ARS' },
    ...(saleAmount === null ? {} : { salePrice: { amount: saleAmount, currency: 'ARS' } }),
    ...(form.sku.trim() === '' ? {} : { sku: form.sku.trim() }),
    availability: form.availability,
    ...(form.trackStock ? { stockQuantity: Number(form.stockQuantity) } : {}),
    ...(form.shortDescription.trim() === ''
      ? {}
      : { shortDescription: form.shortDescription.trim() }),
    ...(images[0] === undefined ? {} : { primaryImage: images[0] }),
    ...(form.description.trim() === '' ? {} : { description: form.description.trim() }),
    images,
    variants,
  };

  try {
    const summary = parseProducts([value], authorizedCategories)[0];
    if (summary === undefined) throw new InvalidProductError('El producto no es válido.');
    return parseProductDetail(summary, value);
  } catch (validationError: unknown) {
    if (validationError instanceof InvalidProductError) {
      throw new Error(validationError.message, { cause: validationError });
    }
    throw validationError;
  }
}

function formFromProduct(product: CatalogProductDetail): ProductFormState {
  return Object.freeze({
    slug: product.id,
    name: product.name,
    categorySlugs: product.categorySlugs,
    presentation: product.presentation ?? '',
    price: String(product.price.amount),
    salePrice: product.salePrice === undefined ? '' : String(product.salePrice.amount),
    sku: product.sku ?? '',
    availability: product.availability === 'unavailable' ? 'unavailable' : 'available',
    trackStock: product.stockQuantity !== undefined,
    stockQuantity: product.stockQuantity === undefined ? '' : String(product.stockQuantity),
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    images: product.images,
    variants: JSON.stringify(product.variants, null, 2),
  });
}

function formsEqual(left: ProductFormState, right: ProductFormState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createUniqueSlug(name: string, products: readonly CatalogProductDetail[]): string {
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 180) || 'producto';
  const existing = new Set(products.map((product) => product.id));
  if (!existing.has(normalized)) return normalized;
  let suffix = 2;
  while (existing.has(withSlugSuffix(normalized, suffix))) suffix += 1;
  return withSlugSuffix(normalized, suffix);
}

function withSlugSuffix(slug: string, suffix: number): string {
  const ending = `-${suffix}`;
  return `${slug.slice(0, 180 - ending.length).replace(/-+$/u, '')}${ending}`;
}

function productComparator(sort: ProductSort) {
  return (left: CatalogProductDetail, right: CatalogProductDetail): number => {
    if (sort === 'category') {
      const categoryComparison = left.categoryNames.join(' ').localeCompare(
        right.categoryNames.join(' '),
        'es-AR',
        { sensitivity: 'base' },
      );
      return categoryComparison || compareNames(left, right);
    }
    if (sort === 'price-asc' || sort === 'price-desc') {
      const difference = (left.salePrice ?? left.price).amount -
        (right.salePrice ?? right.price).amount;
      return (sort === 'price-desc' ? -difference : difference) || compareNames(left, right);
    }
    if (sort === 'stock-asc' || sort === 'stock-desc') {
      const difference = compareStock(
        left.availableQuantity ?? left.stockQuantity,
        right.availableQuantity ?? right.stockQuantity,
      );
      return (sort === 'stock-desc' ? -difference : difference) || compareNames(left, right);
    }
    return compareNames(left, right);
  };
}

function compareNames(left: CatalogProductDetail, right: CatalogProductDetail): number {
  return left.name.localeCompare(right.name, 'es-AR', { sensitivity: 'base' });
}

function compareStock(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function parseAdminCatalog(payload: unknown): Readonly<{
  products: readonly CatalogProductDetail[];
  imageStorageConfigured: boolean;
}> {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.products) ||
    typeof payload.imageStorageConfigured !== 'boolean'
  ) {
    throw new Error('Respuesta de catálogo inválida.');
  }
  const rawProducts = payload.products;
  try {
    const summaries = parseProducts(rawProducts, authorizedCategories);
    return Object.freeze({
      products: Object.freeze(
        summaries.map((summary, index) => parseProductDetail(summary, rawProducts[index])),
      ),
      imageStorageConfigured: payload.imageStorageConfigured,
    });
  } catch (validationError: unknown) {
    throw new Error('Respuesta de catálogo inválida.', { cause: validationError });
  }
}

function parseAdminProduct(payload: unknown): CatalogProductDetail {
  if (!isRecord(payload) || !isRecord(payload.product)) {
    throw new Error('Respuesta de producto inválida.');
  }
  try {
    const summary = parseProducts([payload.product], authorizedCategories)[0];
    if (summary === undefined) throw new Error('Respuesta de producto inválida.');
    return parseProductDetail(summary, payload.product);
  } catch (validationError: unknown) {
    throw new Error('Respuesta de producto inválida.', { cause: validationError });
  }
}

async function loadAdminProduct(
  productId: string,
  onUnauthorized?: () => void,
): Promise<CatalogProductDetail> {
  const payload = await adminJson(
    `/api/admin/products/${encodeURIComponent(productId)}`,
    undefined,
    false,
    onUnauthorized,
  );
  return parseAdminProduct(payload);
}

async function adminImageUpload(
  productId: string,
  image: File,
  onUnauthorized?: () => void,
): Promise<unknown> {
  return adminRequest(
    `/api/admin/products/${encodeURIComponent(productId)}/image`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': image.type },
      body: image,
    },
    false,
    onUnauthorized,
  );
}

async function adminJson(
  path: string,
  init?: RequestInit,
  allowEmpty = false,
  onUnauthorized?: () => void,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set('content-type', 'application/json');
  return adminRequest(
    path,
    {
      credentials: 'same-origin',
      ...init,
      ...(init?.body === undefined ? {} : { headers }),
    },
    allowEmpty,
    onUnauthorized,
  );
}

async function adminRequest(
  path: string,
  init: RequestInit,
  allowEmpty: boolean,
  onUnauthorized?: () => void,
): Promise<unknown> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('La sesión administrativa venció.');
  }
  if (allowEmpty && response.status === 204) return null;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // La respuesta no exitosa se normaliza a continuación.
  }
  if (!response.ok) {
    if (
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === 'string'
    ) {
      throw new Error(payload.error.message);
    }
    throw new Error('No se pudo completar la operación administrativa.');
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}
