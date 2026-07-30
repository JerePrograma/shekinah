import {
  authorizedCategories,
  authorizedProducts,
} from '../data/authorized-commercial-data';

export const appPaths = {
  home: '/',
  approach: '/enfoque',
  catalog: '/catalogo',
  privacy: '/privacidad',
} as const;

export type AppPath = (typeof appPaths)[keyof typeof appPaths];
export type KnownRouteId = keyof typeof appPaths;
export type Navigate = (path: string) => void;

type KnownRoute = Readonly<{
  id: KnownRouteId;
  path: AppPath;
  title: string;
  description: string;
}>;

export type ProductRoute = Readonly<{
  id: 'product';
  path: string;
  productSlug: string;
  title: string;
  description: string;
}>;

export type CategoryRoute = Readonly<{
  id: 'category';
  path: string;
  categorySlug: string;
  title: string;
  description: string;
}>;

type NotFoundRoute = Readonly<{
  id: 'not-found';
  path: string;
  title: string;
  description: string;
}>;

export type AppRoute = KnownRoute | ProductRoute | CategoryRoute | NotFoundRoute;

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
    description: 'Consultá los 510 productos del catálogo comercial recuperado de Shekinah.',
  },
  {
    id: 'privacy',
    path: appPaths.privacy,
    title: 'Privacidad | Shekinah',
    description: 'Conocé el comportamiento de privacidad de la aplicación estática de Shekinah.',
  },
];

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

  return collapsedPath === '/' ? collapsedPath : collapsedPath.replace(/\/+$/gu, '');
}

const routeByPath = new Map<string, AppRoute>();
for (const route of knownRoutes) {
  routeByPath.set(route.path, route);
}

for (const category of authorizedCategories) {
  const categoryPath = normalizePathname(category.path);
  if (routeByPath.has(categoryPath)) {
    throw new Error(`Colisión de ruta de categoría: ${category.path}.`);
  }
  routeByPath.set(categoryPath, {
    id: 'category',
    path: categoryPath,
    categorySlug: category.slug,
    title: `${category.name} | Catálogo Shekinah`,
    description: `${category.productCount} productos registrados en la categoría ${category.name} de Shekinah.`,
  });
}

for (const product of authorizedProducts) {
  const productPath = normalizePathname(product.path);
  if (routeByPath.has(productPath)) {
    throw new Error(`Colisión de ruta de producto: ${product.path}.`);
  }
  routeByPath.set(productPath, {
    id: 'product',
    path: productPath,
    productSlug: product.slug,
    title: `${product.name} | Shekinah`,
    description: `Información comercial registrada de ${product.name} en el catálogo de Shekinah.`,
  });
}

export function resolveRoute(pathname: string): AppRoute {
  const normalizedPath = normalizePathname(pathname);
  const route = routeByPath.get(normalizedPath);

  return route ?? {
    id: 'not-found',
    path: normalizedPath,
    title: 'Página no encontrada | Shekinah',
    description: 'La dirección solicitada no corresponde a una ruta pública de Shekinah.',
  };
}

export function isAppPath(value: string): boolean {
  return routeByPath.has(normalizePathname(value));
}
