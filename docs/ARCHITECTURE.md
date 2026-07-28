# Arquitectura

## Resumen

Shekinah es una aplicación estática construida con React, TypeScript y Vite. No tiene backend, base de datos, autenticación ni peticiones a APIs.

## Entrada y estilos

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y carga de estilos;
- `src/styles.css`: sistema visual general;
- `src/catalog.css`: presentación del catálogo;
- `src/routing.css`: páginas y navegación por rutas.

## Aplicación

`src/App.tsx` compone el encabezado, la navegación, la vista activa y el pie. Cada vista mantiene un único `h1`.

Páginas:

- `src/pages/HomePage.tsx`;
- `src/pages/ApproachPage.tsx`;
- `src/pages/CatalogPage.tsx`;
- `src/pages/PrivacyPage.tsx`;
- `src/pages/NotFoundPage.tsx`.

## Navegación

La navegación usa History API sin una dependencia de enrutamiento. El contrato se concentra en:

- `src/routing/routes.ts`;
- `src/routing/AppLink.tsx`;
- `src/routing/useBrowserRoute.ts`.

Las rutas públicas son `/`, `/enfoque`, `/catalogo` y `/privacidad`. Las demás rutas muestran la vista 404 de la aplicación.

## Catálogo y datos

- `src/catalog/model.ts`: contrato y validación de productos;
- `src/catalog/catalog.ts`: normalización, categorías, búsqueda y formato;
- `src/catalog/CatalogSection.tsx`: renderizado condicional;
- `src/data/authorized-commercial-data.ts`: fuente única de datos autorizados;
- `src/test/fixtures/catalog-products.ts`: datos exclusivos para pruebas.

La colección pública de productos está vacía y el contacto es `null`.

## Contenido y activos

- `src/content/site-content.ts`: textos estructurales;
- `src/config/authorized-assets.ts`: metadatos del logo;
- `public/assets/logo-shekinah.png`: único activo visual.

## Seguridad

- `public/_headers`: encabezados para Cloudflare Pages;
- `scripts/verify-security.mjs`: auditoría de CSP, secretos, recursos y salida;
- `scripts/verify-assets.mjs`: integridad del logo;
- `scripts/verify-automation.mjs`: auditoría del workflow y documentación.

## Build

- desarrollo: `npm run dev`;
- producción local: `npm run build`;
- Cloudflare Pages: `npm run build:pages`;
- validación completa: `npm run verify`.

La salida estática se genera en `dist`.
