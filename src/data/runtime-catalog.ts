import { useEffect, useState } from 'react';

import {
  parseCategories,
  parseProductDetail,
  parseProducts,
} from '../catalog/model';
import type {
  CatalogCategory,
  CatalogProductDetail,
  Product,
} from '../catalog/model';
import { authorizedCategories } from './authorized-commercial-data';

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
    const categories = cachedCategories.length === 0
      ? authorizedCategories
      : cachedCategories;
    const summary = parseProducts([payload.product], categories)[0];
    if (summary === undefined) return null;
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
    // Compatibilidad exclusiva con dobles de prueba y respuestas anteriores:
    // producción nueva siempre publica `categories` junto con los productos Dux.
    const productValues: readonly unknown[] = payload.products;
    let categories: readonly CatalogCategory[];
    if (Array.isArray(payload.categories)) {
      const categoryValues: readonly unknown[] = payload.categories;
      categories = parseCategories(categoryValues);
    } else {
      categories = authorizedCategories;
    }
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
