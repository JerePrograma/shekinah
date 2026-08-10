import {
  useEffect,
  useRef,
} from 'react';
import type {
  ChangeEvent,
  FormEvent,
  RefObject,
} from 'react';

import { MAX_STOCK_QUANTITY } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { ProductImageField } from './ProductImageField';
import type {
  ProductFieldErrors,
  ProductFormState,
  ProductOperation,
} from './product-management-types';

export function ProductEditor({
  baseline,
  editingId,
  fieldErrors,
  fileInputRef,
  form,
  formRef,
  imagePreviewUrl,
  imageStorageConfigured,
  isDirty,
  onCancelPendingNavigation,
  onConfirmPendingNavigation,
  onDiscardImage,
  onNameChange,
  onRequestClose,
  onSelectImage,
  onSlugChange,
  onSubmit,
  onToggleCategory,
  onToggleRemoveImage,
  onUpdateField,
  operation,
  pendingImage,
  pendingNavigation,
  removeImage,
  titleRef,
}: Readonly<{
  baseline: ProductFormState;
  editingId: string | null;
  fieldErrors: ProductFieldErrors;
  fileInputRef: RefObject<HTMLInputElement | null>;
  form: ProductFormState;
  formRef: RefObject<HTMLFormElement | null>;
  imagePreviewUrl: string | null;
  imageStorageConfigured: boolean;
  isDirty: boolean;
  onCancelPendingNavigation: () => void;
  onConfirmPendingNavigation: () => void;
  onDiscardImage: () => void;
  onNameChange: (value: string) => void;
  onRequestClose: () => void;
  onSelectImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onSlugChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleCategory: (slug: string, checked: boolean) => void;
  onToggleRemoveImage: () => void;
  onUpdateField: <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => void;
  operation: ProductOperation;
  pendingImage: File | null;
  pendingNavigation: boolean;
  removeImage: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
}>) {
  const saving = operation.kind === 'saving';
  const busy = operation.kind !== 'idle';
  const editorStatus = formAvailabilityLabel(form);
  const pendingNavigationRef = useRef<HTMLDivElement | null>(null);
  const discardChangesRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!pendingNavigation) return;
    pendingNavigationRef.current?.scrollIntoView?.({ block: 'nearest' });
    discardChangesRef.current?.focus();
  }, [pendingNavigation]);

  function cancelPendingNavigation(): void {
    onCancelPendingNavigation();
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }

  return (
    <aside className="admin-product-editor" aria-labelledby="product-editor-title">
      <div className="admin-editor-heading">
        <div>
          <p className="eyebrow">{editingId === null ? 'Alta' : 'Edición'}</p>
          <h3 id="product-editor-title" ref={titleRef} tabIndex={-1}>
            {editingId === null ? 'Nuevo producto' : `Editar ${baseline.name}`}
          </h3>
          {form.slug === '' ? null : (
            <p className="admin-public-path">Dirección pública: /{form.slug}/</p>
          )}
        </div>
        <button
          className="button button-secondary admin-compact-button"
          type="button"
          disabled={busy}
          onClick={onRequestClose}
        >
          Cerrar editor
        </button>
      </div>

      {pendingNavigation ? (
        <div
          ref={pendingNavigationRef}
          className="admin-inline-confirmation"
          role="dialog"
          aria-labelledby="discard-title"
        >
          <div>
            <h4 id="discard-title">Hay cambios sin guardar</h4>
            <p>Si continuás, se perderán los cambios de este editor.</p>
          </div>
          <div className="admin-inline-actions">
            <button
              ref={discardChangesRef}
              className="button button-danger admin-compact-button"
              type="button"
              disabled={busy}
              onClick={onConfirmPendingNavigation}
            >
              Descartar cambios
            </button>
            <button
              className="button button-secondary admin-compact-button"
              type="button"
              disabled={busy}
              onClick={cancelPendingNavigation}
            >
              Seguir editando
            </button>
          </div>
        </div>
      ) : null}

      <form ref={formRef} className="admin-product-form" noValidate onSubmit={onSubmit}>
        <fieldset className="admin-editor-section" disabled={busy}>
          <legend>Datos básicos</legend>
          <div className="admin-form-grid">
            <label className="admin-form-field admin-form-field-wide">
              <span id="product-name-label">Nombre</span>
              <input
                required
                maxLength={300}
                value={form.name}
                aria-labelledby="product-name-label"
                aria-invalid={fieldErrors.name === undefined ? undefined : true}
                aria-describedby={fieldErrors.name === undefined ? undefined : 'product-name-error'}
                onChange={(event) => onNameChange(event.currentTarget.value)}
              />
              <FieldError id="product-name-error" message={fieldErrors.name} />
            </label>
            <label className="admin-form-field">
              <span id="product-presentation-label">Presentación</span>
              <input
                maxLength={160}
                value={form.presentation}
                aria-labelledby="product-presentation-label"
                placeholder="Ej.: 100 g"
                onChange={(event) => onUpdateField('presentation', event.currentTarget.value)}
              />
            </label>
            <label className="admin-form-field">
              <span id="product-sku-label">SKU</span>
              <input
                maxLength={160}
                value={form.sku}
                aria-labelledby="product-sku-label"
                onChange={(event) => onUpdateField('sku', event.currentTarget.value)}
              />
            </label>
          </div>
          <fieldset
            className="admin-category-options"
            aria-invalid={fieldErrors.categorySlugs === undefined ? undefined : true}
            aria-describedby={fieldErrors.categorySlugs === undefined ? undefined : 'product-categories-error'}
          >
            <legend>Categorías</legend>
            <div>
              {authorizedCategories.map((category) => (
                <label key={category.slug}>
                  <input
                    type="checkbox"
                    checked={form.categorySlugs.includes(category.slug)}
                    onChange={(event) => onToggleCategory(category.slug, event.currentTarget.checked)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
            <FieldError id="product-categories-error" message={fieldErrors.categorySlugs} />
          </fieldset>
        </fieldset>

        <fieldset className="admin-editor-section" disabled={busy}>
          <legend>Precio</legend>
          <div className="admin-form-grid">
            <label className="admin-form-field">
              <span id="product-price-label">Precio en pesos</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.price}
                aria-labelledby="product-price-label"
                aria-invalid={fieldErrors.price === undefined ? undefined : true}
                aria-describedby={describedBy('product-price-hint', fieldErrors.price, 'product-price-error')}
                onChange={(event) => onUpdateField('price', event.currentTarget.value)}
              />
              <small id="product-price-hint">Importe final en ARS, con hasta dos decimales.</small>
              <FieldError id="product-price-error" message={fieldErrors.price} />
            </label>
            <label className="admin-form-field">
              <span id="product-sale-price-label">Precio promocional</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.salePrice}
                aria-labelledby="product-sale-price-label"
                aria-invalid={fieldErrors.salePrice === undefined ? undefined : true}
                aria-describedby={fieldErrors.salePrice === undefined ? undefined : 'product-sale-price-error'}
                onChange={(event) => onUpdateField('salePrice', event.currentTarget.value)}
              />
              <FieldError id="product-sale-price-error" message={fieldErrors.salePrice} />
            </label>
          </div>
        </fieldset>

        <ProductImageField
          disabled={busy}
          error={fieldErrors.image}
          fileInputRef={fileInputRef}
          images={form.images}
          imageStorageConfigured={imageStorageConfigured}
          name={form.name}
          onDiscardSelection={onDiscardImage}
          onSelect={onSelectImage}
          onToggleRemove={onToggleRemoveImage}
          pendingImage={pendingImage}
          previewUrl={imagePreviewUrl}
          removeImage={removeImage}
        />

        <fieldset className="admin-editor-section" disabled={busy}>
          <legend>Inventario y disponibilidad</legend>
          <label className="admin-switch-field">
            <input
              type="checkbox"
              checked={form.trackStock}
              aria-labelledby="product-track-stock-label"
              onChange={(event) => onUpdateField('trackStock', event.currentTarget.checked)}
            />
            <span>
              <strong id="product-track-stock-label">Controlar stock</strong>
              <small>Al llegar a cero, el producto deja de estar disponible para compra.</small>
            </span>
          </label>
          {form.trackStock ? (
            <label className="admin-form-field">
              <span id="product-stock-label">Stock actual</span>
              <input
                required
                type="number"
                min="0"
                max={MAX_STOCK_QUANTITY}
                step="1"
                inputMode="numeric"
                value={form.stockQuantity}
                aria-labelledby="product-stock-label"
                aria-invalid={fieldErrors.stockQuantity === undefined ? undefined : true}
                aria-describedby={fieldErrors.stockQuantity === undefined ? undefined : 'product-stock-error'}
                onChange={(event) => onUpdateField('stockQuantity', event.currentTarget.value)}
              />
              <FieldError id="product-stock-error" message={fieldErrors.stockQuantity} />
            </label>
          ) : null}
          <label className="admin-switch-field">
            <input
              type="checkbox"
              checked={form.availability === 'available'}
              aria-labelledby="product-availability-label"
              onChange={(event) => onUpdateField(
                'availability',
                event.currentTarget.checked ? 'available' : 'unavailable',
              )}
            />
            <span>
              <strong id="product-availability-label">Disponible manualmente para venta</strong>
              <small>Podés pausar el producto aunque todavía tenga stock.</small>
            </span>
          </label>
          <p className={`admin-effective-status admin-status-${editorStatus.tone}`}>
            Estado efectivo: <strong>{editorStatus.label}</strong>
          </p>
        </fieldset>

        <fieldset className="admin-editor-section" disabled={busy}>
          <legend>Descripción</legend>
          <label className="admin-form-field">
            <span id="product-short-description-label">Descripción breve</span>
            <textarea
              rows={3}
              value={form.shortDescription}
              aria-labelledby="product-short-description-label"
              onChange={(event) => onUpdateField('shortDescription', event.currentTarget.value)}
            />
          </label>
          <label className="admin-form-field">
            <span id="product-description-label">Descripción completa</span>
            <textarea
              rows={6}
              value={form.description}
              aria-labelledby="product-description-label"
              onChange={(event) => onUpdateField('description', event.currentTarget.value)}
            />
          </label>
        </fieldset>

        <details className="admin-advanced-fields">
          <summary>Opciones avanzadas</summary>
          <div className="admin-editor-section">
            {editingId === null ? (
              <label className="admin-form-field">
                <span id="product-slug-label">Identificador y dirección pública</span>
                <input
                  required
                  disabled={busy}
                  maxLength={180}
                  pattern="[a-z0-9][a-z0-9-]*"
                  value={form.slug}
                  aria-labelledby="product-slug-label"
                  aria-invalid={fieldErrors.slug === undefined ? undefined : true}
                  aria-describedby={describedBy('product-slug-hint', fieldErrors.slug, 'product-slug-error')}
                  onChange={(event) => onSlugChange(event.currentTarget.value)}
                />
                <small id="product-slug-hint">Se genera desde el nombre. Ajustalo sólo antes de crear si es necesario.</small>
                <FieldError id="product-slug-error" message={fieldErrors.slug} />
              </label>
            ) : (
              <p><strong>Identificador:</strong> {form.slug} (no se puede modificar)</p>
            )}
          </div>
        </details>

        <div className="admin-editor-actions">
          <button className="button button-primary" type="submit" disabled={busy}>
            {saving
              ? operation.stage === 'image'
                ? 'Actualizando imagen…'
                : 'Guardando…'
              : editingId === null
                ? 'Crear producto'
                : 'Guardar cambios'}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={onRequestClose}
          >
            {isDirty ? 'Descartar / cerrar' : 'Cerrar'}
          </button>
          {isDirty ? <p>Hay cambios sin guardar.</p> : <p>Todos los cambios están guardados.</p>}
        </div>
      </form>
    </aside>
  );
}

function FieldError({
  id,
  message,
}: Readonly<{ id: string; message: string | undefined }>) {
  return message === undefined ? null : (
    <span className="admin-field-error" id={id}>{message}</span>
  );
}

function describedBy(hintId: string, error: string | undefined, errorId: string): string {
  return error === undefined ? hintId : `${hintId} ${errorId}`;
}

function formAvailabilityLabel(form: ProductFormState) {
  if (form.availability === 'unavailable') {
    return { label: 'No disponible manualmente', tone: 'paused' } as const;
  }
  if (form.trackStock && Number(form.stockQuantity) === 0) {
    return { label: 'Sin stock — no disponible para compra', tone: 'out' } as const;
  }
  if (!form.trackStock) {
    return { label: 'Disponible — stock no controlado', tone: 'untracked' } as const;
  }
  return { label: 'Disponible para compra', tone: 'available' } as const;
}
