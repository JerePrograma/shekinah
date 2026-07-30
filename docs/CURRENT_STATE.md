# Estado actual

Fecha de la fotografía: 2026-07-30.

Base remota sincronizada antes de iniciar la incorporación integral del catálogo:

`2ff352a350097b40403543ef2490857f9043ebf6` — `fix: publish compiled Pages output`.

Este SHA es la base de la implementación, no un valor permanente. Resolver nuevamente `origin/main` antes de cualquier trabajo.

## Producto

Shekinah es una SPA estática de React, TypeScript estricto y Vite para un negocio de hierbas y especias. Publica el catálogo comercial histórico capturado el 23/07/2026 sin afirmar que sus precios o disponibilidades sean actuales.

El catálogo de producción contiene:

- 510 productos con ID público, slug y path únicos;
- 16 categorías;
- 510 precios registrados en ARS;
- 495 descripciones completas;
- 432 SKU;
- 509 referencias a 484 imágenes locales únicas;
- 15 productos sin descripción completa;
- un producto sin imagen: `Caldo sin sal en polvo`.

`authorizedContact` permanece en `null`. No existen backend, autenticación, compra, carrito, stock en tiempo real, formularios, analítica ni trackers.

## Datos y arquitectura

- `src/catalog-data/catalog-index.json`: índice liviano de listado y resolución de rutas;
- `src/catalog-data/catalog-details.json`: descripciones completas, galerías y variantes, cargadas mediante `import()` local diferido;
- `src/catalog-data/categories.json`: categorías públicas;
- `src/data/authorized-commercial-data.ts`: fuente tipada de producción;
- `catalog/catalog-manifest.json`: procedencia, métricas, faltantes y hashes;
- `catalog/catalog-assets.json`: inventario exacto de activos comerciales;
- `scripts/prepare-catalog-data.mjs`: regeneración offline y determinista desde una extracción histórica;
- `scripts/verify-catalog.mjs`: validación integral del dataset público.

El build de producción no depende de Git ni realiza descargas. El bundle inicial no contiene las 495 descripciones completas.

## Rutas públicas

Rutas institucionales estáticas:

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`.

Rutas comerciales dinámicas:

- 510 paths históricos de producto, con y sin barra final;
- 16 rutas `/tienda/categoria/<slug>/`.

Las rutas estáticas tienen prioridad. Query string y hash no alteran la resolución. Cualquier path desconocido muestra la vista 404 de la aplicación; por el fallback SPA puede recibirse con estado HTTP `200`.

## Experiencia del catálogo

- búsqueda insensible a mayúsculas, tildes y espacios repetidos;
- búsqueda por nombre, categoría, presentación, SKU y descripción corta;
- filtro por las 16 categorías;
- paginación determinista de 24 productos;
- contador y cambios anunciados mediante `aria-live`;
- fichas individuales con campos opcionales solamente cuando existen;
- imagen local con carga diferida o superficie textual `Imagen no disponible`;
- advertencias visibles sobre la fecha comercial y las descripciones de salud.

## Activos

El logo autorizado conserva su hash SHA-256 `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`.

Las 484 imágenes comerciales son los binarios históricos exactos declarados en `catalog/catalog-assets.json`. El verificador comprueba allowlist, firma, extensión, tamaño, SHA-256, referencias y ausencia de huérfanos.

## Calidad y seguridad

Entorno canónico:

- Node.js `24.18.0` mediante `.node-version`;
- npm `>=11.0.0`;
- ESLint tipado;
- Vitest y React Testing Library;
- Playwright con Chromium.

Cobertura local de esta incorporación:

- Vitest: 4 archivos y 31 pruebas;
- Playwright: 5 escenarios sobre el build compilado;
- resolución programática de los 510 paths y las 16 categorías;
- verificadores de catálogo, activos, seguridad y automatización.

Comandos canónicos:

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

La CSP continúa con `default-src 'none'`, `connect-src 'none'`, `img-src 'self'`, `script-src 'self'` y `style-src 'self'`, sin `unsafe-inline`, `unsafe-eval`, formularios, frames ni conexiones remotas.

## CI y despliegue

`.github/workflows/ci.yml` conserva permisos `contents: read`, ejecuta `npm ci` y `npm run verify`, y publica `dist` como artefacto efímero. No despliega ni utiliza secretos.

La estrategia de producción continúa siendo Cloudflare Pages mediante integración Git:

- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- Node.js: `24.18.0`;
- dominio: `shekinah-7dl.pages.dev`.

Un push no demuestra por sí solo un despliegue. GitHub Actions, el deployment de Cloudflare y el contenido público deben asociarse y verificarse para cada SHA final.

## Historial

La aplicación legacy fue retirada mediante commits normales. Su historial permanece disponible para auditoría, pero el árbol actual no reutiliza su arquitectura, código, estilos, checkout ni workflows. Solo se recuperaron datos comerciales, imágenes y metadatos de procedencia autorizados.

`docs/design/` y `docs/validation/` conservan decisiones y evidencia histórica. Sus estados preliminares no deben interpretarse sin leer los cierres posteriores.
