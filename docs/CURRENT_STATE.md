# Estado actual

Fecha de revisión: 2026-07-30.

Base inspeccionada al iniciar la simplificación comercial:

`53de8ad0fd09e88edcb8b10034bff89af599a28b` — `fix: enforce network-free production bundle`.

Este SHA es una referencia de trabajo. Antes de modificar el repositorio se debe resolver nuevamente `origin/main`.

## Producto

Shekinah es una SPA estática de React, TypeScript estricto y Vite que publica el catálogo comercial vigente del proyecto.

El catálogo contiene:

- 510 productos con slug y ruta únicos;
- 16 categorías;
- 510 precios en ARS;
- 495 descripciones completas;
- 432 SKU;
- 509 referencias a 484 imágenes locales;
- 15 productos sin descripción completa;
- un producto sin imagen: `Caldo sin sal en polvo`.

No existen backend, autenticación, cuentas, compra, carrito, stock en tiempo real, formularios, analítica ni rastreadores.

## Experiencia pública

La navegación del encabezado contiene `Inicio` y `Catálogo`. El pie agrega `Privacidad`.

La portada presenta un hero comercial con un único CTA hacia `/catalogo` y continúa directamente con el catálogo.

El catálogo ofrece:

- búsqueda insensible a mayúsculas, tildes y espacios repetidos;
- búsqueda por nombre, categoría, presentación, SKU y descripción corta;
- filtro por las 16 categorías;
- paginación determinista de 24 productos;
- contador anunciado mediante `aria-live`;
- fichas individuales con campos opcionales;
- imagen local o el texto `Imagen no disponible`.

## Rutas públicas

- `/`;
- `/catalogo`;
- `/privacidad`;
- 510 rutas de producto;
- 16 rutas `/tienda/categoria/<slug>/`.

Las rutas desconocidas se resuelven mediante la vista 404 normal. Query string y hash no alteran la resolución.

## Datos y arquitectura

- `src/catalog-data/categories.json`: categorías;
- `src/catalog-data/catalog-details.json`: descripciones, galerías y variantes;
- `catalog/internal/catalog-index.json`: índice interno protegido de la publicación;
- `config/catalog-index-plugin.ts`: módulo público sin metadatos internos;
- `src/data/authorized-commercial-data.ts`: fuente tipada para la aplicación;
- `catalog/catalog-manifest.json`: métricas y hashes internos;
- `catalog/catalog-assets.json`: inventario de activos;
- `scripts/prepare-catalog-data.mjs`: preparación determinista;
- `scripts/verify-catalog.mjs`: validación integral.

El detalle se carga mediante `import()` local. El build no consulta Git ni realiza descargas.

## Calidad y seguridad

Entorno canónico:

- Node.js `24.18.0`;
- npm `>=11.0.0`;
- ESLint;
- TypeScript estricto;
- Vitest y React Testing Library;
- Playwright con Chromium.

Comandos:

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

La CSP conserva `default-src 'none'`, `connect-src 'none'`, `img-src 'self'`, `script-src 'self'` y `style-src 'self'`, sin `unsafe-inline`, `unsafe-eval`, formularios, frames ni conexiones remotas.

## CI y despliegue

`.github/workflows/ci.yml` usa permisos `contents: read`, ejecuta `npm ci`, instala Chromium, corre `npm run verify` y publica `dist` como artefacto efímero.

Cloudflare Pages:

- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- Node.js: `24.18.0`;
- dominio: `shekinah-7dl.pages.dev`.

Cada publicación debe asociarse al SHA final y verificarse de forma independiente en GitHub Actions y Cloudflare Pages.
