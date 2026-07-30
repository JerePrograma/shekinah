# Arquitectura

## Resumen

Shekinah es una SPA estática construida con React, TypeScript estricto y Vite. No tiene backend, base de datos, autenticación, APIs de ejecución ni trackers.

## Entrada, vistas y estilos

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y carga de estilos;
- `src/App.tsx`: layout compartido, navegación y selección de vista;
- `src/pages/`: inicio, enfoque, catálogo, ficha de producto, privacidad y 404;
- `src/styles.css`, `src/catalog.css` y `src/routing.css`: sistema visual local y responsive.

Cada vista mantiene un único `h1` y el layout conserva el enlace de salto, encabezado, navegación, `main` y pie.

## Navegación

El router propio usa History API y enlaces HTML reales:

- `src/routing/routes.ts`: tabla estática y resolución dinámica;
- `src/routing/AppLink.tsx`: navegación cliente progresiva;
- `src/routing/useBrowserRoute.ts`: estado, historial, título, metadescripción y foco.

Las rutas estáticas `/`, `/enfoque`, `/catalogo` y `/privacidad` tienen prioridad. El resolvedor agrega 510 paths históricos de productos y 16 rutas `/tienda/categoria/<slug>/`, normaliza barras e ignora query y hash. Los slugs desconocidos muestran la vista 404.

## Catálogo público

- `src/catalog/model.ts`: tipos inmutables y validación de límites;
- `src/catalog/catalog.ts`: búsqueda normalizada, filtro, paginación y formato;
- `src/catalog/CatalogSection.tsx`: listado accesible de 24 tarjetas por página;
- `src/pages/ProductPage.tsx`: ficha individual;
- `src/data/authorized-commercial-data.ts`: fuente única tipada y carga diferida;
- `src/catalog-data/categories.json`: 16 categorías;
- `src/catalog-data/catalog-index.json`: 510 resúmenes necesarios para listados y rutas;
- `src/catalog-data/catalog-details.json`: descripciones completas, galerías y variantes.

El índice se importa de forma estática. Los detalles se cargan mediante un único `import()` local dinámico y Vite los emite en un chunk independiente. No se usa `fetch`, XMLHttpRequest ni una API remota. El detalle se busca por slug en memoria después de cargar el chunk.

La página inicial y `/catalogo` renderizan como máximo 24 tarjetas a la vez. Búsqueda, categoría y paginación se resuelven sobre el índice local determinista.

## Recuperación y validación de datos

- `scripts/prepare-catalog-data.mjs`: herramienta offline que transforma una extracción histórica verificada;
- `catalog/catalog-manifest.json`: commit, blobs, fecha, métricas, faltantes y hashes;
- `catalog/catalog-assets.json`: allowlist exacta de imágenes;
- `scripts/verify-catalog.mjs`: integridad de datos y relaciones;
- `scripts/verify-assets.mjs`: binarios, firmas, hashes y huérfanos.

La fuente histórica completa no se versiona en el árbol actual ni forma parte de `dist`. El build usa únicamente los datos públicos sanitizados ya generados.

## Contenido y activos

- `src/content/site-content.ts`: contenido estructural, advertencia comercial y advertencia sanitaria;
- `src/config/authorized-assets.ts`: metadatos del logo;
- `public/assets/logo-shekinah.png`: logo;
- `public/images/original/catalog/`: 484 imágenes comerciales exactas.

Los campos ausentes se omiten. No existen imágenes sustitutas, datos de contacto, HTML histórico renderizado ni identificadores internos en producción.

## Seguridad

- `public/_headers`: CSP y encabezados restrictivos para Cloudflare Pages;
- `scripts/verify-security.mjs`: CSP, secretos, red, IDs internos, URLs externas, bundle y salida;
- `scripts/verify-automation.mjs`: workflow, permisos, scripts y documentación.

La CSP conserva `connect-src 'none'` y solo permite scripts, estilos e imágenes del mismo origen.

## Build

- desarrollo: `npm run dev`;
- producción local: `npm run build`;
- Cloudflare Pages: `npm run build:pages`;
- validación completa: `npm run verify`.

La salida estática se genera en `dist`. `npm run build:pages` valida catálogo, lint, tipos, Vitest, build, activos, seguridad y automatización, pero no ejecuta Playwright.
