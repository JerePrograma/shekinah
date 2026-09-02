import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CatalogCategory } from '../catalog/model';
import {
  getRuntimeCatalogCategory,
  getRuntimeCatalogProduct,
  isRuntimeCatalogResolved,
  refreshRuntimeCatalog,
} from '../data/runtime-catalog';
import {
  createNotFoundRoute,
  createProductRoute,
  createResolvingProductRoute,
  getPotentialProductSlug,
  normalizePathname,
  resolveRoute,
} from './routes';
import type { AppRoute, Navigate } from './routes';

function readCurrentPathname(): string {
  return normalizePathname(window.location.pathname);
}

const HISTORY_INDEX_KEY = '__shekinahHistoryIndex';

export function useBrowserRoute(shouldNavigate: () => boolean = () => true) {
  const [pathname, setPathname] = useState(readCurrentPathname);
  const [runtimeResolution, setRuntimeResolution] = useState<Readonly<{
    pathname: string;
    route: AppRoute;
  }> | null>(null);
  const currentHistoryIndex = useRef(0);
  const restoringHistory = useRef(false);
  const shouldNavigateRef = useRef(shouldNavigate);

  useEffect(() => {
    shouldNavigateRef.current = shouldNavigate;
  }, [shouldNavigate]);

  useEffect(() => {
    const initialIndex = readHistoryIndex(window.history.state);
    if (initialIndex === null) {
      window.history.replaceState(
        withHistoryIndex(window.history.state, currentHistoryIndex.current),
        '',
        window.location.href,
      );
    } else {
      currentHistoryIndex.current = initialIndex;
    }

    const handlePopState = (event: PopStateEvent) => {
      const targetIndex = readHistoryIndex(event.state);
      if (restoringHistory.current) {
        restoringHistory.current = false;
        if (targetIndex !== null) currentHistoryIndex.current = targetIndex;
        setPathname(readCurrentPathname());
        return;
      }

      if (!shouldNavigateRef.current()) {
        restoringHistory.current = true;
        if (targetIndex === null) {
          window.history.forward();
        } else {
          window.history.go(currentHistoryIndex.current - targetIndex);
        }
        return;
      }

      if (targetIndex !== null) currentHistoryIndex.current = targetIndex;
      setPathname(readCurrentPathname());
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate: Navigate = useCallback((path: string) => {
    const normalizedPath = normalizePathname(path);

    if (readCurrentPathname() === normalizedPath) return;
    if (!shouldNavigateRef.current()) return;

    currentHistoryIndex.current += 1;
    window.history.pushState(
      withHistoryIndex(window.history.state, currentHistoryIndex.current),
      '',
      normalizedPath,
    );
    setPathname(normalizedPath);
  }, []);

  const staticRoute = useMemo(() => resolveRoute(pathname), [pathname]);
  const potentialProductSlug = useMemo(
    () => staticRoute.id === 'product' || staticRoute.id === 'not-found'
      ? getPotentialProductSlug(pathname)
      : null,
    [pathname, staticRoute.id],
  );
  const potentialCategorySlug = useMemo(
    () => staticRoute.id === 'category' || staticRoute.id === 'not-found'
      ? getPotentialCategorySlug(pathname)
      : null,
    [pathname, staticRoute.id],
  );

  useEffect(() => {
    if (
      (potentialProductSlug === null && potentialCategorySlug === null) ||
      isRuntimeCatalogResolved()
    ) {
      return;
    }
    let active = true;
    void refreshRuntimeCatalog().then((products) => {
      if (!active) return;
      let route: AppRoute;
      if (potentialProductSlug !== null) {
        const product = products.find(({ slug }) => slug === potentialProductSlug);
        route = product === undefined
          ? createNotFoundRoute(pathname)
          : createProductRoute(product);
      } else {
        const category = potentialCategorySlug === null
          ? undefined
          : getRuntimeCatalogCategory(potentialCategorySlug);
        route = category === undefined
          ? createNotFoundRoute(pathname)
          : createRuntimeCategoryRoute(category);
      }
      setRuntimeResolution({ pathname, route });
    });
    return () => {
      active = false;
    };
  }, [pathname, potentialCategorySlug, potentialProductSlug]);

  const route = useMemo(() => {
    if (potentialProductSlug !== null) {
      const runtimeProduct = getRuntimeCatalogProduct(potentialProductSlug);
      if (runtimeProduct !== undefined) return createProductRoute(runtimeProduct);
      if (isRuntimeCatalogResolved()) return createNotFoundRoute(pathname);
      if (runtimeResolution?.pathname === pathname) return runtimeResolution.route;
      return createResolvingProductRoute(pathname, potentialProductSlug);
    }
    if (potentialCategorySlug !== null) {
      const runtimeCategory = getRuntimeCatalogCategory(potentialCategorySlug);
      if (runtimeCategory !== undefined) {
        return createRuntimeCategoryRoute(runtimeCategory);
      }
      if (isRuntimeCatalogResolved()) return createNotFoundRoute(pathname);
      if (runtimeResolution?.pathname === pathname) return runtimeResolution.route;
      return createResolvingProductRoute(pathname, potentialCategorySlug);
    }
    return staticRoute;
  }, [
    pathname,
    potentialCategorySlug,
    potentialProductSlug,
    runtimeResolution,
    staticRoute,
  ]);

  return {
    navigate,
    pathname,
    route,
  } as const;
}

function getPotentialCategorySlug(pathname: string): string | null {
  return /^\/tienda\/categoria\/([a-z0-9][a-z0-9-]{0,179})$/u
    .exec(normalizePathname(pathname))?.[1] ?? null;
}

function createRuntimeCategoryRoute(category: CatalogCategory): AppRoute {
  return {
    id: 'category',
    path: normalizePathname(category.path),
    categorySlug: category.slug,
    title: `${category.name} | Catálogo Shekinah`,
    description: `Explorá ${category.productCount} productos de la categoría ${category.name} en Shekinah.`,
  };
}

function readHistoryIndex(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const index = (value as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : null;
}

function withHistoryIndex(value: unknown, index: number): Record<string, unknown> {
  const current = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return { ...current, [HISTORY_INDEX_KEY]: index };
}
