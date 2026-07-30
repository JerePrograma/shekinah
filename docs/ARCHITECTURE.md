# Arquitectura

## Resumen

Shekinah es una SPA estática construida con React, TypeScript estricto y Vite. No tiene backend, base de datos, autenticación, APIs remotas ni rastreadores.

## Entrada, vistas y estilos

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y carga de estilos;
- `src/App.tsx`: layout, navegación y selección de vista;
- `src/pages/`: inicio, catálogo, ficha de producto, privacidad y 404;
- `src/styles.css`, `src/catalog.css` y `src/routing.css`: sistema visual local y responsive.

Cada vista conserva un único `h1`, enlace de salto, encabezado, navegación, contenido principal y pie.

## Navegación

El router propio usa History API y enlaces HTML reales:

- `src/routing/routes.ts`: rutas conocidas y resolución dinámica;
- `src/routing/AppLink.tsx`: navegación cliente;
- `src/routing/useBrowserRoute.ts`: historial, título, metadescripción y foco.

Las rutas estáticas son `/`, `/catalogo` y `/privacidad`. El resolvedor agrega 510 rutas de producto y 16 rutas `/tienda/categoria/<slug>/`, normaliza barras e ignora query y hash. Cualquier otra dirección muestra la vista 404.

## Catálogo público

- `src/catalog/model.ts`: tipos inmutables y validación;
- `src/catalog/catalog.ts`: búsqueda, filtro, paginación y formato;
- `src/catalog/CatalogSection.tsx`: listado accesible de 24 tarjetas por página;
- `src/pages/ProductPage.tsx`: ficha individual;
- `src/data/authorized-commercial-data.ts`: acceso tipado y carga diferida;
- `src/catalog-data/categories.json`: 16 categorías;
- `src/catalog-data/catalog-details.json`: descripciones, galerías y variantes.

El índice que utiliza la aplicación se expone como el módulo virtual `virtual:shekinah-catalog-index`. `config/catalog-index-plugin.ts` lee `catalog/internal/catalog-index.json`, valida su marca interna y elimina ese metadato antes de entregar los 510 resúmenes a Vite o Vitest.

El archivo interno no forma parte de `dist`. Los detalles se cargan mediante un único `import()` local dinámico y Vite los emite en un chunk independiente. No se usa `fetch`, `XMLHttpRequest` ni una API.

## Integridad de datos

- `scripts/prepare-catalog-data.mjs`: preparación offline y determinista;
- `catalog/catalog-manifest.json`: métricas y hashes internos;
- `catalog/catalog-assets.json`: allowlist exacta de imágenes;
- `scripts/verify-catalog.mjs`: integridad de datos y separación pública;
- `scripts/verify-assets.mjs`: binarios, firmas, hashes y referencias.

Los campos ausentes se omiten. La aplicación no publica metadatos internos, IDs técnicos, HTML de origen ni URLs remotas.

## Contenido y activos

- `src/content/site-content.ts`: copy comercial y política de privacidad;
- `src/config/authorized-assets.ts`: metadatos del logo;
- `public/assets/logo-shekinah.png`: logo;
- `public/images/original/catalog/`: 484 imágenes.

## Seguridad

- `public/_headers`: CSP y encabezados para Cloudflare Pages;
- `scripts/verify-security.mjs`: CSP, secretos, red, URLs, bundle, copy público y salida;
- `scripts/verify-automation.mjs`: workflow, permisos, scripts y documentación.

La CSP conserva `connect-src 'none'` y solo permite scripts, estilos e imágenes del mismo origen.

## Build

- desarrollo: `npm run dev`;
- producción local: `npm run build`;
- Cloudflare Pages: `npm run build:pages`;
- validación completa: `npm run verify`.

La salida se genera en `dist`.
