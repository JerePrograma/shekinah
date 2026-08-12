import type { ChangeEvent, RefObject } from 'react';

import type { CatalogProductDetail } from '../catalog/model';

export function ProductImageField({
  disabled,
  error,
  fileInputRef,
  images,
  imageStorageConfigured,
  name,
  onDiscardSelection,
  onSelect,
  onToggleRemove,
  pendingImage,
  previewUrl,
  removeImage,
}: Readonly<{
  disabled: boolean;
  error: string | undefined;
  fileInputRef: RefObject<HTMLInputElement | null>;
  images: CatalogProductDetail['images'];
  imageStorageConfigured: boolean;
  name: string;
  onDiscardSelection: () => void;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleRemove: () => void;
  pendingImage: File | null;
  previewUrl: string | null;
  removeImage: boolean;
}>) {
  const currentImage = removeImage ? undefined : images[0];
  const imageSource = previewUrl ?? currentImage?.src;

  return (
    <fieldset className="admin-editor-section" disabled={disabled}>
      <legend>Imagen</legend>
      <div className="admin-image-field">
        <div className="admin-image-preview">
          {imageSource === undefined ? (
            <div role="img" aria-label="Imagen no disponible">Sin imagen</div>
          ) : (
            <img
              src={imageSource}
              alt={pendingImage === null
                ? currentImage?.alt ?? name
                : `Vista previa de ${name || 'producto'}`}
            />
          )}
        </div>
        <div className="admin-image-controls">
          <label className="admin-file-picker">
            <span>{imageSource === undefined ? 'Seleccionar imagen' : 'Reemplazar imagen'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!imageStorageConfigured}
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={describedBy('product-image-hint', error, 'product-image-error')}
              onChange={onSelect}
            />
          </label>
          <small id="product-image-hint">JPEG, PNG o WebP. Máximo 4 MiB.</small>
          {imageStorageConfigured ? null : (
            <p className="admin-field-note">
              La carga de imágenes estará disponible cuando se configure el almacenamiento administrativo.
            </p>
          )}
          {pendingImage === null ? null : (
            <p>
              <strong>Vista previa local.</strong>{' '}
              {pendingImage.name} · {formatFileSize(pendingImage.size)}. Se subirá al guardar.
            </p>
          )}
          {error === undefined ? null : (
            <span className="admin-field-error" id="product-image-error">{error}</span>
          )}
          {pendingImage !== null ? (
            <button
              className="button button-secondary admin-compact-button"
              type="button"
              onClick={onDiscardSelection}
            >
              Descartar imagen seleccionada
            </button>
          ) : images.length > 0 ? (
            <button
              className="button button-secondary admin-compact-button"
              type="button"
              onClick={onToggleRemove}
            >
              {removeImage ? 'Conservar imagen actual' : 'Quitar imagen'}
            </button>
          ) : null}
          {removeImage ? <p className="admin-field-note">La imagen se quitará al guardar.</p> : null}
        </div>
      </div>
    </fieldset>
  );
}

function describedBy(hintId: string, error: string | undefined, errorId: string): string {
  return error === undefined ? hintId : `${hintId} ${errorId}`;
}

function formatFileSize(bytes: number): string {
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(bytes / 1024)} KiB`;
}
