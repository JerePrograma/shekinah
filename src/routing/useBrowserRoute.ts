import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createNotFoundRoute,
  createProductRoute,
  createResolvingProductRoute,
  getPotentialProductSlug,
  normalizePathname,
  resolveRoute,
} from './routes';
import type { AppRoute } from './routes';
import type { Navigate } from './routes';
import {
  getRuntimeCatalogProduct,
  isRuntimeCatalogResolved,
  refreshRuntimeCatalog,
} from '../data/runtime-catalog';

function readCurrentPathname(): string {
  return normalizePathname(window.location.pathname);
}

export function useBrowserRoute() {
  const [pathname, setPathname] = useState(readCurrentPathname);
  const [runtimeResolution, setRuntimeResolution] = useState<Readonly<{
    pathname: string;
    route: AppRoute;
  }> | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(readCurrentPathname());
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate: Navigate = useCallback((path: string) => {
    const normalizedPath = normalizePathname(path);

    if (readCurrentPathname() !== normalizedPath) {
      window.history.pushState(null, '', normalizedPath);
    }

    setPathname(normalizedPath);
  }, []);

  const staticRoute = useMemo(() => resolveRoute(pathname), [pathname]);
  const potentialProductSlug = useMemo(
    () => staticRoute.id === 'product' || staticRoute.id === 'not-found'
      ? getPotentialProductSlug(pathname)
      : null,
    [pathname, staticRoute.id],
  );

  useEffect(() => {
    if (potentialProductSlug === null || isRuntimeCatalogResolved()) return;
    let active = true;
    void refreshRuntimeCatalog().then((products) => {
      if (!active) return;
      const product = products.find(({ slug }) => slug === potentialProductSlug);
      setRuntimeResolution({
        pathname,
        route: product === undefined
          ? createNotFoundRoute(pathname)
          : createProductRoute(product),
      });
    });
    return () => {
      active = false;
    };
  }, [pathname, potentialProductSlug]);

  const route = useMemo(() => {
    if (potentialProductSlug === null) return staticRoute;
    const runtimeProduct = getRuntimeCatalogProduct(potentialProductSlug);
    if (runtimeProduct !== undefined) return createProductRoute(runtimeProduct);
    if (isRuntimeCatalogResolved()) return createNotFoundRoute(pathname);
    if (runtimeResolution?.pathname === pathname) return runtimeResolution.route;
    return staticRoute.id === 'product'
      ? staticRoute
      : createResolvingProductRoute(pathname, potentialProductSlug);
  }, [pathname, potentialProductSlug, runtimeResolution, staticRoute]);

  return {
    navigate,
    pathname,
    route,
  } as const;
}
