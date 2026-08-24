import { useEffect, useState } from 'react';

import { parseProductDetail, parseProducts } from '../catalog/model';
import type { CatalogProductDetail, Product } from '../catalog/model';
import {
  isCommerceClientEnabled,
  isMercadoLibreCatalogClientEnabled,
} from '../commerce/env';
import {
  authorizedCategories,
  authorizedProducts,
  loadAuthorizedProductDetail,
} from './authorized-commercial-data';

let cachedProducts: readonly Product[] = authorizedProducts;
let pendingLoad: Promise<readonly Product[]> | null = null;
let catalogResolved = false;
const listeners = new Set<(products: readonly Product[]) => void>();

export function useRuntimeCatalogProducts(): readonly Product[] {
  const [products, setProducts] = useState(cachedProducts);
  useEffect(() => {
    listeners.add(setProducts);
    void refreshRuntimeCatalog();
    return () => {
      listeners.delete(setProducts);
    };
  }, []);
  return products;
}

export function getRuntimeCatalogProduct(slug: string): Product | undefined {
  return cachedProducts.find((product) => product.slug === slug);
}

export function isRuntimeCatalogResolved(): boolean {
  return catalogResolved;
}

export async function refreshRuntimeCatalog(): Promise<readonly Product[]> {
  pendingLoad ??= loadProducts().finally(() => {
    pendingLoad = null;
  });
  const products = await pendingLoad;
  if (products !== cachedProducts) {
    cachedProducts = products;
    listeners.forEach((listener) => listener(products));
  }
  return products;
}

export async function loadRuntimeProductDetail(slug: string): Promise<CatalogProductDetail | null> {
  try {
    const response = await fetch(`/api/catalog/${encodeURIComponent(slug)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (
      response.status === 404 &&
      response.headers.get('content-type')?.toLocaleLowerCase('en').includes('application/json') === true
    ) {
      return null;
    }
    if (!response.ok) throw new Error('No se pudo consultar el catálogo dinámico.');
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !isRecord(payload.product)) {
      throw new Error('El catálogo dinámico devolvió un producto inválido.');
    }
    const summary = parseProducts([payload.product], authorizedCategories)[0];
    if (summary === undefined) return null;
    return parseProductDetail(summary, payload.product);
  } catch {
    const fallback = await loadAuthorizedProductDetail(slug);
    return fallback === null || !shouldFailClosed()
      ? fallback
      : Object.freeze({ ...fallback, availability: 'unavailable' as const });
  }
}

async function loadProducts(): Promise<readonly Product[]> {
  try {
    const response = await fetch('/api/catalog', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return failClosedProducts(cachedProducts);
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.products)) return failClosedProducts(cachedProducts);
    const products = parseProducts(payload.products, authorizedCategories);
    catalogResolved = true;
    return products;
  } catch {
    return failClosedProducts(cachedProducts);
  }
}

function failClosedProducts(products: readonly Product[]): readonly Product[] {
  if (!shouldFailClosed()) return products;
  catalogResolved = false;
  return Object.freeze(products.map((product) => Object.freeze({
    ...product,
    availability: 'unavailable' as const,
  })));
}

function shouldFailClosed(): boolean {
  return isCommerceClientEnabled() || isMercadoLibreCatalogClientEnabled();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
