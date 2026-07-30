import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  normalizePathname,
  resolveRoute,
} from './routes';
import type { Navigate } from './routes';

function readCurrentPathname(): string {
  return normalizePathname(window.location.pathname);
}

export function useBrowserRoute() {
  const [pathname, setPathname] = useState(readCurrentPathname);

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

  const route = useMemo(() => resolveRoute(pathname), [pathname]);

  return {
    navigate,
    pathname,
    route,
  } as const;
}
