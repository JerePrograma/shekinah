import {
  authorizedCategories,
  authorizedProducts,
} from '../data/authorized-commercial-data';
import {
  appPaths,
  isAppPath,
  normalizePathname,
  resolveRoute,
} from './routes';

describe('rutas de la aplicación', () => {
  it('prioriza las rutas institucionales conocidas', () => {
    expect(resolveRoute('/').id).toBe('home');
    expect(resolveRoute('/enfoque').id).toBe('approach');
    expect(resolveRoute('/catalogo').id).toBe('catalog');
    expect(resolveRoute('/privacidad').id).toBe('privacy');
  });

  it('normaliza barra final, query, hash y separadores repetidos', () => {
    expect(normalizePathname('catalogo/')).toBe('/catalogo');
    expect(normalizePathname('//catalogo///')).toBe('/catalogo');
    expect(normalizePathname('/guayaba/?origen=prueba#detalle')).toBe('/guayaba');
    expect(resolveRoute('/guayaba/?origen=prueba#detalle').id).toBe('product');
  });

  it('resuelve programáticamente los 510 paths históricos', () => {
    expect(authorizedProducts).toHaveLength(510);
    for (const product of authorizedProducts) {
      expect(resolveRoute(product.path)).toMatchObject({
        id: 'product',
        productSlug: product.slug,
      });
      expect(resolveRoute(product.path.replace(/\/$/u, '')).id).toBe('product');
    }
  });

  it('resuelve las 16 categorías históricas con título y conteo', () => {
    expect(authorizedCategories).toHaveLength(16);
    for (const category of authorizedCategories) {
      const route = resolveRoute(category.path);
      expect(route).toMatchObject({ id: 'category', categorySlug: category.slug });
      expect(route.title).toBe(`${category.name} | Catálogo Shekinah`);
      expect(route.description).toContain(String(category.productCount));
    }
  });

  it('produce metadatos propios para productos representativos', () => {
    expect(resolveRoute('/guayaba/')).toMatchObject({
      id: 'product',
      title: 'Guayaba hojas x 50 gr | Shekinah',
    });
    expect(resolveRoute('/melena-de-leon-futuro-fungi-50ml/').title).toBe(
      'Melena de león Futuro fungi 50ml | Shekinah',
    );
    expect(resolveRoute('/artemisa-annua-agroecologica-x-50-gr/').id).toBe('product');
  });

  it('no presenta colisiones entre rutas estáticas, categorías y productos', () => {
    const paths = [
      ...Object.values(appPaths),
      ...authorizedCategories.map(({ path }) => normalizePathname(path)),
      ...authorizedProducts.map(({ path }) => normalizePathname(path)),
    ];
    expect(new Set(paths)).toHaveProperty('size', paths.length);
  });

  it('resuelve una ruta desconocida como 404', () => {
    expect(resolveRoute('/ruta-inexistente')).toMatchObject({
      id: 'not-found',
      path: '/ruta-inexistente',
      title: 'Página no encontrada | Shekinah',
    });
    expect(isAppPath('/guayaba/')).toBe(true);
    expect(isAppPath('/tienda/categoria/hierbas-medicinales/')).toBe(true);
    expect(isAppPath('/otra-ruta')).toBe(false);
  });
});
