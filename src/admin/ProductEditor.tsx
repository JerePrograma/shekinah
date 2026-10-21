import { useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { CatalogProductDetail } from '../catalog/model';
import { ProductImageField } from './ProductImageField';
import type { PendingNavigation, ProductOperation } from './product-management-types';

export function ProductEditor({ product, visibleName, nameError, resetName, onNameChange, onResetName, description, onDescriptionChange, imageError, fileInputRef,
  imagePreviewUrl, imageStorageConfigured, isDirty, onCancelPendingNavigation, onConfirmPendingNavigation,
  onDiscardImage, onRequestClose, onSelectImage, onSubmit, onToggleRemoveImage, operation,
  pendingImage, pendingNavigation, pendingNavigationReturnFocus, removeImage, titleRef,
}: Readonly<{
  product: CatalogProductDetail;
  visibleName: string;
  nameError: string | undefined;
  resetName: boolean;
  onNameChange: (value: string) => void;
  onResetName: () => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  imageError: string | undefined;
  fileInputRef: RefObject<HTMLInputElement | null>;
  imagePreviewUrl: string | null;
  imageStorageConfigured: boolean;
  isDirty: boolean;
  onCancelPendingNavigation: () => void;
  onConfirmPendingNavigation: () => void;
  onDiscardImage: () => void;
  onRequestClose: (target: HTMLButtonElement) => void;
  onSelectImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleRemoveImage: () => void;
  operation: ProductOperation;
  pendingImage: File | null;
  pendingNavigation: PendingNavigation | null;
  pendingNavigationReturnFocus: HTMLElement | null;
  removeImage: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
}>) {
  const busy = operation.kind !== 'idle';
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (pendingNavigation !== null) continueRef.current?.focus();
  }, [pendingNavigation]);
  useEffect(() => { if (nameError !== undefined) nameInputRef.current?.focus(); }, [nameError]);
  function cancelNavigation(): void {
    onCancelPendingNavigation();
    window.requestAnimationFrame(() => {
      if (pendingNavigationReturnFocus?.isConnected === true) pendingNavigationReturnFocus.focus();
      else titleRef.current?.focus();
    });
  }

  return <aside className="admin-product-editor" aria-labelledby="product-editor-title">
    <div className="admin-editor-heading">
      <div><p className="admin-field-note">Contenido del producto</p><h2 id="product-editor-title" ref={titleRef} tabIndex={-1}>Editar {product.name}</h2></div>
      <button className="button button-secondary admin-compact-button" type="button" disabled={busy} onClick={event => onRequestClose(event.currentTarget)}>Cerrar editor</button>
    </div>
    {pendingNavigation === null ? null : <div className="admin-inline-confirmation" role="dialog" aria-labelledby="discard-title" aria-describedby="discard-description"
      onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); cancelNavigation(); } }}>
      <div><h3 id="discard-title">Hay cambios sin guardar</h3><p id="discard-description">Si continuás, se perderán los cambios de este editor.</p></div>
      <div className="admin-inline-actions">
        <button ref={continueRef} className="button button-secondary admin-compact-button" type="button" disabled={busy} onClick={cancelNavigation}>Seguir editando</button>
        <button className="button button-danger admin-compact-button" type="button" disabled={busy} onClick={onConfirmPendingNavigation}>Descartar cambios</button>
      </div>
    </div>}
    <form className="admin-product-form" onSubmit={onSubmit} aria-busy={busy}>
      <label className="admin-form-field">
        <span id="product-name-label">Nombre visible en la tienda</span>
        <input ref={nameInputRef} value={visibleName} required maxLength={500} disabled={busy}
          onChange={event => onNameChange(event.currentTarget.value)} aria-labelledby="product-name-label"
          aria-invalid={nameError === undefined ? undefined : true}
          aria-describedby={nameError === undefined ? 'product-name-hint' : 'product-name-hint product-name-error'} />
        <small id="product-name-hint">Dux aporta el nombre base por SKU. Un nombre guardado acá tiene prioridad y se conserva al sincronizar. El stock y las reservas siguen en Dux.</small>
        {nameError === undefined ? null : <small id="product-name-error" className="form-error" role="alert">{nameError}</small>}
      </label>
      {typeof product.duxName !== 'string' ? null : <div>
        <p className="admin-field-note">Nombre en Dux: {product.duxName}</p>
        <button className="button button-secondary admin-compact-button" type="button" onClick={onResetName}
          disabled={busy || resetName || (typeof product.nameOverride !== 'string' && visibleName === product.name)}>
          Usar nombre de Dux
        </button>
        {resetName ? <p role="status">Se usará el nombre de Dux al guardar.</p> : null}
      </div>}
      <ProductImageField disabled={busy} error={imageError} fileInputRef={fileInputRef} images={product.images}
        imageStorageConfigured={imageStorageConfigured} name={product.name} onDiscardSelection={onDiscardImage}
        onSelect={onSelectImage} onToggleRemove={onToggleRemoveImage} pendingImage={pendingImage}
        previewUrl={imagePreviewUrl} removeImage={removeImage} />
      <details className="admin-product-disclosure admin-description-editor">
        <summary>Editar descripción</summary>
        <label className="admin-form-field">
          <span id="product-description-label">Descripción</span>
          <textarea rows={7} maxLength={12000} value={description} disabled={busy} onChange={event => onDescriptionChange(event.currentTarget.value)}
            aria-labelledby="product-description-label" aria-describedby="description-hint" />
          <small id="description-hint">Escribí sólo información confirmada del producto. Dejá el campo vacío para quitar la descripción.</small>
        </label>
      </details>
      <div className="admin-editor-actions">
        <button className="button button-primary" type="submit" disabled={busy || !isDirty}>
          {operation.kind === 'saving' ? operation.stage === 'image' ? 'Actualizando imagen…' : 'Guardando…' : 'Guardar cambios'}
        </button>
        <p role="status" aria-live="polite">{isDirty ? 'Hay cambios sin guardar.' : 'Todos los cambios están guardados.'}</p>
      </div>
    </form>
  </aside>;
}
