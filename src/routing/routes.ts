export const appPaths = {
  home: '/',
  approach: '/enfoque',
  catalog: '/catalogo',
  privacy: '/privacidad',
} as const;

export type AppPath = (typeof appPaths)[keyof typeof appPaths];
export type KnownRouteId = keyof typeof appPaths;
export type Navigate = (path: AppPath) => void;

type KnownRoute = Readonly<{
  id: KnownRouteId;
  path: AppPath;
  title: string;
  description: string;
}>;

type NotFoundRoute = Readonly<{
  id: 'not-found';
  path: string;
  title: string;
  description: string;
}>;

export type AppRoute = KnownRoute | NotFoundRoute;

const knownRoutes: readonly KnownRoute[] = [
  {
    id: 'home',
    path: appPaths.home,
    title: 'Shekinah | Hierbas y especias',
    description: 'Shekinah presenta una experiencia clara y accesible de hierbas y especias.',
  },
  {
    id: 'approach',
    path: appPaths.approach,
    title: 'Enfoque | Shekinah',
    description: 'Conocé el enfoque claro, verificable y adaptable de la experiencia Shekinah.',
  },
  {
    id: 'catalog',
    path: appPaths.catalog,
    title: 'Catálogo | Shekinah',
    description: 'Consultá el catálogo autorizado de Shekinah y su estado actual.',
  },
  {
    id: 'privacy',
    path: appPaths.privacy,
    title: 'Privacidad | Shekinah',
    description: 'Conocé el comportamiento de privacidad de la aplicación estática de Shekinah.',
  },
];

const routeByPath = new Map<string, KnownRoute>(
  knownRoutes.map(
    (route): readonly [string, KnownRoute] => [route.path, route],
  ),
);

export function normalizePathname(value: string): string {
  const trimmedValue = value.trim();
  const separatorIndex = trimmedValue.search(/[?#]/u);
  const pathOnly =
    separatorIndex === -1 ? trimmedValue : trimmedValue.slice(0, separatorIndex);
  const nonEmptyPath = pathOnly.length === 0 ? '/' : pathOnly;
  const pathWithLeadingSlash = nonEmptyPath.startsWith('/')
    ? nonEmptyPath
    : `/${nonEmptyPath}`;
  const collapsedPath = pathWithLeadingSlash.replace(/\/{2,}/gu, '/');

  if (collapsedPath === '/') {
    return collapsedPath;
  }

  return collapsedPath.replace(/\/+$/gu, '');
}

export function resolveRoute(pathname: string): AppRoute {
  const normalizedPath = normalizePathname(pathname);
  const knownRoute = routeByPath.get(normalizedPath);

  if (knownRoute !== undefined) {
    return knownRoute;
  }

  return {
    id: 'not-found',
    path: normalizedPath,
    title: 'Página no encontrada | Shekinah',
    description: 'La dirección solicitada no corresponde a una ruta pública de Shekinah.',
  };
}

export function isAppPath(value: string): value is AppPath {
  const normalizedPath = normalizePathname(value);

  return knownRoutes.some((route) => route.path === normalizedPath);
}
