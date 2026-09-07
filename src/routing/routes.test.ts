import {
  authorizedCategories,
  authorizedProducts,
} from '../data/authorized-commercial-data';
import {
  appPaths,
  createProductRoute,
  getPotentialProductSlug,
  isAppPath,
  normalizePathname,
  resolveRoute,
} from './routes';

describe('rutas de la aplicación', () => {
  it('resuelve las rutas institucionales vigentes y retira Enfoque', () => {
    expect(resolveRoute('/').id).toBe('home');
    expect(resolveRoute('/catalogo').id).toBe('catalog');
    expect(resolveRoute('/privacidad').id).toBe('privacy');
    expect(resolveRoute('/enfoque').id).toBe('not-found');
    expect(Object.keys(appPaths)).not.toContain('approach');
    expect(Object.values(appPaths)).not.toContain('/enfoque');
  });

  it('normaliza barra final, query, hash y separadores repetidos', () => {
    expect(normalizePathname('catalogo/')).toBe('/catalogo');
    expect(normalizePathname('//catalogo///')).toBe('/catalogo');
    expect(normalizePathname('/guayaba/?origen=prueba#detalle')).toBe('/guayaba');
    expect(resolveRoute('/guayaba/?origen=prueba#detalle').id).toBe('not-found');
  });

  it('los 510 productos históricos requieren confirmación de la API y no son rutas publicadas', () => {
    for (const product of authorizedProducts) {
      expect(resolveRoute(product.path).id).toBe('not-found');
      expect(getPotentialProductSlug(product.path)).toBe(product.slug);
    }
  });

  it('resuelve las 16 categorías con título, conteo y copy comercial', () => {
    expect(authorizedCategories).toHaveLength(16);
    for (const category of authorizedCategories) {
      const route = resolveRoute(category.path);
      expect(route).toMatchObject({ id: 'category', categorySlug: category.slug });
      expect(route.title).toBe(`${category.name} | Catálogo Shekinah`);
      expect(route.description).toBe(
        `Explorá ${category.productCount} productos de la categoría ${category.name} en Shekinah.`,
      );
    }
  });

  it('no presenta colisiones entre rutas estáticas, categorías y productos', () => {
    const paths = [
      ...Object.values(appPaths),
      ...authorizedCategories.map(({ path }) => normalizePathname(path)),
      ...authorizedProducts.map(({ path }) => normalizePathname(path)),
    ];
    expect(new Set(paths)).toHaveProperty('size', paths.length);
  });

  it('conserva 404 para slugs no confirmados y permite construir una ruta dinámica validada', () => {
    expect(resolveRoute('/producto-creado-desde-backoffice')).toMatchObject({
      id: 'not-found',
      title: 'Página no encontrada | Shekinah',
    });
    expect(getPotentialProductSlug('/producto-creado-desde-backoffice/')).toBe(
      'producto-creado-desde-backoffice',
    );
    expect(createProductRoute({
      id: 'producto-creado-desde-backoffice',
      slug: 'producto-creado-desde-backoffice',
      path: '/producto-creado-desde-backoffice/',
      name: 'Producto dinámico',
      categorySlugs: [],
      categoryNames: [],
      price: { amount: 1_000, currency: 'ARS' },
      priceStatus: 'usable',
    })).toMatchObject({
      id: 'product',
      productSlug: 'producto-creado-desde-backoffice',
      title: 'Producto dinámico | Shekinah',
    });
    expect(resolveRoute('/ruta/inexistente')).toMatchObject({
      id: 'not-found',
      path: '/ruta/inexistente',
      title: 'Página no encontrada | Shekinah',
    });
    expect(isAppPath('/guayaba/')).toBe(false);
    expect(isAppPath('/tienda/categoria/hierbas-medicinales/')).toBe(true);
    expect(isAppPath('/enfoque')).toBe(false);
    expect(isAppPath('/otra-ruta')).toBe(false);
  });
});
