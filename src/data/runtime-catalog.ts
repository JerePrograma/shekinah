import { useEffect, useState } from 'react';

import {
  CATALOG_API_SCHEMA_VERSION,
  parseCategories,
  parseProduct,
  parseProductDetail,
  parseProducts,
} from '../catalog/model';
import type {
  CatalogCategory,
  CatalogProductDetail,
  Product,
} from '../catalog/model';

let catalogResolved = false;
let cachedProducts: readonly Product[] = Object.freeze([]);
let cachedCategories: readonly CatalogCategory[] = Object.freeze([]);
let pendingLoad: Promise<RuntimeCatalogState> | null = null;
const productListeners = new Set<(products: readonly Product[]) => void>();
const categoryListeners = new Set<(categories: readonly CatalogCategory[]) => void>();

type RuntimeCatalogState = Readonly<{
  products: readonly Product[];
  categories: readonly CatalogCategory[];
}>;

export function useRuntimeCatalogProducts(): readonly Product[] {
  const [products, setProducts] = useState(cachedProducts);
  useEffect(() => {
    productListeners.add(setProducts);
    void refreshRuntimeCatalog();
    return () => {
      productListeners.delete(setProducts);
    };
  }, []);
  return products;
}

export function useRuntimeCatalogCategories(): readonly CatalogCategory[] {
  const [categories, setCategories] = useState(cachedCategories);
  useEffect(() => {
    categoryListeners.add(setCategories);
    void refreshRuntimeCatalog();
    return () => {
      categoryListeners.delete(setCategories);
    };
  }, []);
  return categories;
}

export function getRuntimeCatalogProduct(slug: string): Product | undefined {
  return cachedProducts.find((product) => product.slug === slug);
}

export function getRuntimeCatalogCategory(slug: string): CatalogCategory | undefined {
  return cachedCategories.find((category) => category.slug === slug);
}

export function isRuntimeCatalogResolved(): boolean {
  return catalogResolved;
}

export async function refreshRuntimeCatalog(): Promise<readonly Product[]> {
  pendingLoad ??= loadCatalog().finally(() => {
    pendingLoad = null;
  });
  const state = await pendingLoad;
  if (state.products !== cachedProducts) {
    cachedProducts = state.products;
    productListeners.forEach((listener) => listener(cachedProducts));
  }
  if (state.categories !== cachedCategories) {
    cachedCategories = state.categories;
    categoryListeners.forEach((listener) => listener(cachedCategories));
  }
  return cachedProducts;
}

export async function loadRuntimeProductDetail(
  slug: string,
): Promise<CatalogProductDetail | null> {
  try {
    const response = await fetch(`/api/catalog/${encodeURIComponent(slug)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (
      response.status === 404 &&
      response.headers
        .get('content-type')
        ?.toLocaleLowerCase('en')
        .includes('application/json') === true
    ) {
      return null;
    }
    if (!response.ok) throw new Error('No se pudo consultar el catálogo dinámico.');
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !isRecord(payload.product)) {
      throw new Error('El catálogo dinámico devolvió un producto inválido.');
    }
    if (!compatibleCatalogSchema(payload) || !duxIdentity(payload.product)) return null;
    // La ficha puede responder antes que el listado, o después de un nuevo
    // snapshot. Sus categorías Dux no dependen del catálogo guardado en memoria.
    const summary = parseProduct(payload.product);
    if (summary.slug !== slug) return null;
    return parseProductDetail(summary, payload.product);
  } catch {
    return null;
  }
}

async function loadCatalog(): Promise<RuntimeCatalogState> {
  try {
    const response = await fetch('/api/catalog', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return failClosedState();
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.products)) {
      return failClosedState();
    }
    if (!compatibleCatalogSchema(payload) || !Array.isArray(payload.categories) ||
      payload.source !== 'dux' || !payload.products.every(duxIdentity)) return failClosedState();
    const productValues: readonly unknown[] = payload.products;
    const categories = parseCategories(payload.categories);
    const products = parseProducts(productValues, categories);
    catalogResolved = true;
    return Object.freeze({ products, categories });
  } catch {
    return failClosedState();
  }
}

function failClosedState(): RuntimeCatalogState {
  catalogResolved = false;
  return Object.freeze({
    products: failClosedProducts(cachedProducts),
    categories: cachedCategories,
  });
}

function failClosedProducts(products: readonly Product[]): readonly Product[] {
  return Object.freeze(products.map((product) => Object.freeze({
    ...product,
    availability: 'unavailable' as const,
  })));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compatibleCatalogSchema(value: Record<string, unknown>): boolean {
  return value.schemaVersion === CATALOG_API_SCHEMA_VERSION;
}

function duxIdentity(value: unknown): boolean {
  return isRecord(value) && Object.hasOwn(value, 'priceStatus') &&
    typeof value.sku === 'string' && value.sku.trim() !== '' &&
    isRecord(value.commerce) && value.commerce.source === 'dux';
}
