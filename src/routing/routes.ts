import {
  authorizedCategories,
  authorizedProducts,
} from '../data/authorized-commercial-data';
import type { Product } from '../catalog/model';

export const appPaths = {
  home: '/',
  catalog: '/catalogo',
  cart: '/carrito',
  privacy: '/privacidad',
  paymentSuccess: '/pago/exito',
  paymentPending: '/pago/pendiente',
  paymentError: '/pago/error',
  admin: '/admin',
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

export type ResolvingProductRoute = Readonly<{
  id: 'resolving-product';
  path: string;
  productSlug: string;
  title: string;
  description: string;
}>;

export type AppRoute =
  | KnownRoute
  | ProductRoute
  | CategoryRoute
  | NotFoundRoute
  | ResolvingProductRoute;
const knownRoutes: readonly KnownRoute[] = [
  {
    id: 'home',
    path: appPaths.home,
    title: 'Shekinah | Hierbas y especias',
    description:
      'Explorá el catálogo de hierbas, especias y productos naturales de Shekinah.',
  },
  {
    id: 'catalog',
    path: appPaths.catalog,
    title: 'Catálogo | Shekinah',
    description:
      'Conocé los productos y categorías disponibles en el catálogo de Shekinah.',
  },
  {
    id: 'cart',
    path: appPaths.cart,
    title: 'Carrito | Shekinah',
    description: 'Revisá los productos agregados a tu carrito de Shekinah.',
  },
  {
    id: 'privacy',
    path: appPaths.privacy,
    title: 'Privacidad | Shekinah',
    description:
      'Conocé cómo protege tu privacidad el sitio de Shekinah.',
  },
  {
    id: 'paymentSuccess',
    path: appPaths.paymentSuccess,
    title: 'Estado del pago | Shekinah',
    description: 'Consultá el estado confirmado de tu pedido en Shekinah.',
  },
  {
    id: 'paymentPending',
    path: appPaths.paymentPending,
    title: 'Pago pendiente | Shekinah',
    description: 'Consultá el estado confirmado de tu pedido en Shekinah.',
  },
  {
    id: 'paymentError',
    path: appPaths.paymentError,
    title: 'Pago no completado | Shekinah',
    description: 'Consultá el estado confirmado de tu pedido en Shekinah.',
  },
  {
    id: 'admin',
    path: appPaths.admin,
    title: 'Administración | Shekinah',
    description: 'Panel comercial protegido de Shekinah.',
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
    description: `Explorá ${category.productCount} productos de la categoría ${category.name} en Shekinah.`,
  });
}
for (const product of authorizedProducts) {
  const productPath = normalizePathname(product.path);
  if (routeByPath.has(productPath)) {
    throw new Error(`Colisión de ruta de producto: ${product.path}.`);
  }
  routeByPath.set(productPath, createProductRoute(product));
}

export function resolveRoute(pathname: string): AppRoute {
  const normalizedPath = normalizePathname(pathname);
  const route = routeByPath.get(normalizedPath);
  if (route !== undefined) return route;

  return createNotFoundRoute(normalizedPath);
}

export function getPotentialProductSlug(pathname: string): string | null {
  const normalizedPath = normalizePathname(pathname);
  const productSlug = /^\/([a-z0-9][a-z0-9-]{0,179})$/u.exec(normalizedPath)?.[1] ?? null;
  return productSlug === 'enfoque' ? null : productSlug;
}

export function createProductRoute(product: Product): ProductRoute {
  return {
    id: 'product',
    path: normalizePathname(product.path),
    productSlug: product.slug,
    title: `${product.name} | Shekinah`,
    description: `Conocé ${product.name}, su presentación, precio y detalles en Shekinah.`,
  };
}

export function createResolvingProductRoute(
  pathname: string,
  productSlug: string,
): ResolvingProductRoute {
  return {
    id: 'resolving-product',
    path: normalizePathname(pathname),
    productSlug,
    title: 'Cargando producto | Shekinah',
    description: 'Verificando el producto solicitado en el catálogo de Shekinah.',
  };
}

export function createNotFoundRoute(pathname: string): AppRoute {
  return {
    id: 'not-found',
    path: normalizePathname(pathname),
    title: 'Página no encontrada | Shekinah',
    description:
      'La dirección solicitada no corresponde a una página de Shekinah.',
  };
}

export function isAppPath(value: string): boolean {
  return routeByPath.has(normalizePathname(value));
}
