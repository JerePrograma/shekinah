import {
  appPaths,
  isAppPath,
  normalizePathname,
  resolveRoute,
} from './routes';

describe('rutas de la aplicación', () => {
  it('resuelve las rutas públicas conocidas', () => {
    expect(resolveRoute('/').id).toBe('home');
    expect(resolveRoute('/enfoque').id).toBe('approach');
    expect(resolveRoute('/catalogo').id).toBe('catalog');
    expect(resolveRoute('/privacidad').id).toBe('privacy');
  });

  it('normaliza barras finales, rutas sin barra inicial y separadores repetidos', () => {
    expect(normalizePathname('catalogo/')).toBe('/catalogo');
    expect(normalizePathname('//catalogo///')).toBe('/catalogo');
    expect(normalizePathname('/privacidad/?origen=pie#detalle')).toBe('/privacidad');
  });

  it('resuelve una ruta desconocida como 404 sin alterar el texto solicitado', () => {
    const route = resolveRoute('/ruta-inexistente');

    expect(route.id).toBe('not-found');
    expect(route.path).toBe('/ruta-inexistente');
  });

  it('reconoce únicamente destinos internos declarados', () => {
    expect(isAppPath(appPaths.home)).toBe(true);
    expect(isAppPath('/catalogo/')).toBe(true);
    expect(isAppPath('/otra-ruta')).toBe(false);
  });
});
