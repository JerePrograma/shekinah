import { useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { CatalogProductDetail } from '../catalog/model';
import { ProductImageField } from './ProductImageField';
import type { PendingNavigation, ProductOperation } from './product-management-types';

export function ProductEditor({ product, description, onDescriptionChange, imageError, fileInputRef,
  imagePreviewUrl, imageStorageConfigured, isDirty, onCancelPendingNavigation, onConfirmPendingNavigation,
  onDiscardImage, onRequestClose, onSelectImage, onSubmit, onToggleRemoveImage, operation,
  pendingImage, pendingNavigation, pendingNavigationReturnFocus, removeImage, titleRef,
}: Readonly<{
  product: CatalogProductDetail;
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
  useEffect(() => {
    if (pendingNavigation !== null) continueRef.current?.focus();
  }, [pendingNavigation]);
  function cancelNavigation(): void {
    onCancelPendingNavigation();
    window.requestAnimationFrame(() => {
      if (pendingNavigationReturnFocus?.isConnected === true) pendingNavigationReturnFocus.focus();
      else titleRef.current?.focus();
    });
  }

  return <aside className="admin-product-editor" aria-labelledby="product-editor-title">
    <div className="admin-editor-heading">
      <div><p className="eyebrow">Editar contenido</p><h3 id="product-editor-title" ref={titleRef} tabIndex={-1}>Editar {product.name}</h3></div>
      <button className="button button-secondary admin-compact-button" type="button" disabled={busy} onClick={event => onRequestClose(event.currentTarget)}>Cerrar editor</button>
    </div>
    {pendingNavigation === null ? null : <div className="admin-inline-confirmation" role="dialog" aria-labelledby="discard-title" aria-describedby="discard-description"
      onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); cancelNavigation(); } }}>
      <div><h4 id="discard-title">Hay cambios sin guardar</h4><p id="discard-description">Si continuás, se perderán los cambios de este editor.</p></div>
      <div className="admin-inline-actions">
        <button ref={continueRef} className="button button-secondary admin-compact-button" type="button" disabled={busy} onClick={cancelNavigation}>Seguir editando</button>
        <button className="button button-danger admin-compact-button" type="button" disabled={busy} onClick={onConfirmPendingNavigation}>Descartar cambios</button>
      </div>
    </div>}
    <form className="admin-product-form" onSubmit={onSubmit} aria-busy={busy}>
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
