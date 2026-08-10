import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  InvalidProductError,
  parseProductDetail,
  parseProducts,
} from '../catalog/model';
import type { CatalogProductDetail } from '../catalog/model';
import { authorizedCategories } from '../data/authorized-commercial-data';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';

type FormState = Readonly<{
  slug: string;
  name: string;
  categorySlugs: readonly string[];
  presentation: string;
  price: string;
  salePrice: string;
  sku: string;
  availability: 'available' | 'unavailable';
  shortDescription: string;
  description: string;
  images: string;
  variants: string;
}>;

const EMPTY_FORM: FormState = Object.freeze({
  slug: '',
  name: '',
  categorySlugs: Object.freeze([]),
  presentation: '',
  price: '',
  salePrice: '',
  sku: '',
  availability: 'available',
  shortDescription: '',
  description: '',
  images: '',
  variants: '[]',
});

export function ProductManager() {
  const [products, setProducts] = useState<readonly CatalogProductDetail[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, []);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-AR');
    return normalizedQuery === ''
      ? products
      : products.filter((product) =>
          [product.name, product.id, product.sku ?? '', product.presentation ?? '']
            .join(' ')
            .toLocaleLowerCase('es-AR')
            .includes(normalizedQuery),
        );
  }, [products, query]);

  async function reload(signal?: AbortSignal): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const payload = await adminJson(
        '/api/admin/products',
        signal === undefined ? undefined : { signal },
      );
      setProducts(parseAdminProducts(payload));
    } catch (loadError: unknown) {
      if (signal?.aborted === true) return;
      setError(errorMessage(loadError));
    } finally {
      if (signal?.aborted !== true) setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = buildPayload(form);
      const editing = editingId !== null;
      await adminJson(
        editing
          ? `/api/admin/products/${encodeURIComponent(editingId)}`
          : '/api/admin/products',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      resetForm();
      await Promise.all([reload(), refreshRuntimeCatalog()]);
      setMessage(editing ? 'Producto actualizado.' : 'Producto creado.');
    } catch (saveError: unknown) {
      setMessage('');
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: CatalogProductDetail): Promise<void> {
    if (saving || !window.confirm(`Eliminar “${product.name}” del catálogo público?`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await adminJson(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        { method: 'DELETE' },
        true,
      );
      if (editingId === product.id) resetForm();
      await Promise.all([reload(), refreshRuntimeCatalog()]);
      setMessage('Producto eliminado del catálogo.');
    } catch (deleteError: unknown) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCategory(slug: string, checked: boolean): void {
    setForm((current) => ({
      ...current,
      categorySlugs: checked
        ? [...current.categorySlugs, slug]
        : current.categorySlugs.filter((value) => value !== slug),
    }));
  }

  function edit(product: CatalogProductDetail): void {
    setEditingId(product.id);
    setError('');
    setMessage('');
    setForm(Object.freeze({
      slug: product.id,
      name: product.name,
      categorySlugs: product.categorySlugs,
      presentation: product.presentation ?? '',
      price: String(product.price.amount),
      salePrice: product.salePrice === undefined ? '' : String(product.salePrice.amount),
      sku: product.sku ?? '',
      availability: product.availability === 'unavailable' ? 'unavailable' : 'available',
      shortDescription: product.shortDescription ?? '',
      description: product.description ?? '',
      images: product.images.map((image) => image.src).join('\n'),
      variants: JSON.stringify(product.variants, null, 2),
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  return (
    <section className="admin-page section" aria-labelledby="backoffice-title">
      <div className="container admin-shell">
        <div className="section-heading">
          <p className="eyebrow">Administración</p>
          <h1 id="backoffice-title">Administración / Backoffice</h1>
          <p>
            El catálogo de productos es editable. Pedidos, analítica, exportaciones y
            auditoría permanecen en modo de sólo lectura.
          </p>
        </div>
        <h2 id="catalog-admin-title">Catálogo de productos</h2>
        <p>
          Las altas, modificaciones y bajas son persistentes. El servidor vuelve a
          validar precio y disponibilidad al iniciar el checkout.
        </p>
        <form
          className="admin-filters"
          aria-labelledby="catalog-admin-title"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            <span>Slug / ID</span>
            <input
              required
              maxLength={180}
              pattern="[a-z0-9][a-z0-9-]*"
              value={form.slug}
              disabled={editingId !== null || saving}
              onChange={(event) => setField('slug', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              required
              maxLength={300}
              value={form.name}
              disabled={saving}
              onChange={(event) => setField('name', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Precio ARS</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              disabled={saving}
              onChange={(event) => setField('price', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Precio promocional ARS</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.salePrice}
              disabled={saving}
              onChange={(event) => setField('salePrice', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Presentación</span>
            <input
              maxLength={160}
              value={form.presentation}
              disabled={saving}
              onChange={(event) => setField('presentation', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>SKU</span>
            <input
              maxLength={160}
              value={form.sku}
              disabled={saving}
              onChange={(event) => setField('sku', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Disponibilidad</span>
            <select
              value={form.availability}
              disabled={saving}
              onChange={(event) =>
                setField('availability', event.currentTarget.value as FormState['availability'])
              }
            >
              <option value="available">Disponible</option>
              <option value="unavailable">No disponible</option>
            </select>
          </label>
          <fieldset disabled={saving}>
            <legend>Categorías</legend>
            {authorizedCategories.map((category) => (
              <label key={category.slug}>
                <input
                  type="checkbox"
                  checked={form.categorySlugs.includes(category.slug)}
                  onChange={(event) =>
                    toggleCategory(category.slug, event.currentTarget.checked)
                  }
                />
                <span>{category.name}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>Descripción breve</span>
            <textarea
              value={form.shortDescription}
              disabled={saving}
              onChange={(event) => setField('shortDescription', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Descripción completa</span>
            <textarea
              value={form.description}
              disabled={saving}
              onChange={(event) => setField('description', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Imágenes autorizadas (una ruta por línea)</span>
            <textarea
              placeholder="/images/original/catalog/<sha256>.webp"
              value={form.images}
              disabled={saving}
              onChange={(event) => setField('images', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Variantes (JSON)</span>
            <textarea
              spellCheck={false}
              value={form.variants}
              disabled={saving}
              onChange={(event) => setField('variants', event.currentTarget.value)}
            />
          </label>
          <div className="admin-export-actions">
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving
                ? 'Guardando…'
                : editingId === null
                  ? 'Crear producto'
                  : 'Guardar cambios'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={saving}
              onClick={() => {
                resetForm();
                setError('');
                setMessage('');
              }}
            >
              Cancelar / nuevo
            </button>
          </div>
        </form>
        {error === '' ? null : <p className="form-error" role="alert">{error}</p>}
        {message === '' ? null : <p role="status">{message}</p>}
        <label className="catalog-field">
          <span>Buscar producto para editar</span>
          <input
            type="search"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setQuery(event.currentTarget.value)
            }
          />
        </label>
        {loading ? (
          <p role="status">Cargando productos…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>{visibleProducts.length} productos</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Precio</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}<br /><small>{product.id}</small></td>
                    <td>{product.sku ?? '—'}</td>
                    <td>${(product.salePrice ?? product.price).amount.toLocaleString('es-AR')}</td>
                    <td>{product.availability === 'unavailable' ? 'No disponible' : 'Disponible'}</td>
                    <td>
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={saving}
                        onClick={() => edit(product)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          void remove(product);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function buildPayload(form: FormState): CatalogProductDetail {
  if (form.categorySlugs.length === 0) {
    throw new Error('Seleccioná al menos una categoría.');
  }
  let variants: unknown;
  try {
    variants = JSON.parse(form.variants || '[]') as unknown;
  } catch (parseError: unknown) {
    throw new Error(
      parseError instanceof Error
        ? `Variantes: ${parseError.message}`
        : 'Variantes inválidas.',
      { cause: parseError },
    );
  }

  const slug = form.slug.trim();
  const categoryBySlug = new Map(
    authorizedCategories.map((category) => [category.slug, category]),
  );
  const paths = form.images
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const images = paths.map((src) => ({ src, alt: form.name.trim() }));
  const saleAmount = form.salePrice.trim() === '' ? null : Number(form.salePrice);
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

function parseAdminProducts(payload: unknown): readonly CatalogProductDetail[] {
  if (!isRecord(payload)) {
    throw new Error('Respuesta de catálogo inválida.');
  }
  const rawProducts = payload.products;
  if (!Array.isArray(rawProducts)) throw new Error('Respuesta de catálogo inválida.');
  try {
    const summaries = parseProducts(rawProducts, authorizedCategories);
    return Object.freeze(
      summaries.map((summary, index) => parseProductDetail(summary, rawProducts[index])),
    );
  } catch (validationError: unknown) {
    throw new Error('Respuesta de catálogo inválida.', { cause: validationError });
  }
}

async function adminJson(
  path: string,
  init?: RequestInit,
  allowEmpty = false,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set('content-type', 'application/json');
  const requestInit: RequestInit = {
    credentials: 'same-origin',
    ...init,
    ...(init?.body === undefined ? {} : { headers }),
  };
  const response = await fetch(path, requestInit);
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
