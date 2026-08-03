# Arquitectura

## Resumen

Shekinah es una aplicación full-stack liviana construida con React, TypeScript estricto y Vite, desplegada mediante Cloudflare Pages.

La interfaz pública continúa siendo una SPA. Las capacidades de servidor se implementan con Cloudflare Pages Functions y Cloudflare D1. Mercado Pago Checkout Pro se integra por redirección y webhook.

La arquitectura comercial detallada se encuentra en `docs/FULL_STACK_COMMERCE.md`.

## Frontend

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y proveedores globales;
- `src/App.tsx`: layout, navegación y selección de vista;
- `src/pages/`: inicio, catálogo, producto, carrito, retornos de pago, privacidad, administración y 404;
- `src/cart/`: estado persistente del carrito;
- `src/commerce/`: contratos, API y sesión de checkout;
- `src/analytics/`: consentimiento y cliente first-party;
- `src/data/authorized-commercial-data.ts`: acceso tipado al catálogo;
- `src/styles.css`, `src/catalog.css`, `src/routing.css` y `src/commerce.css`: estilos locales.

## Navegación

El router propio conserva History API y enlaces HTML reales.

`src/routing/routes.ts` resuelve las rutas públicas, comerciales y administrativas. Las rutas desconocidas continúan mostrando la vista 404.

## Catálogo

La fuente canónica conserva 510 productos y 16 categorías.

El índice se mantiene en `catalog/internal/catalog-index.json`. El servidor resuelve productos y precios desde esa fuente; no acepta nombres, precios ni totales enviados por el cliente como autoridad.

## Backend

- `functions/api/`: endpoints públicos y administrativos;
- `functions/admin.ts` y `functions/admin/[[path]].ts`: superficie administrativa;
- `server/`: dominio, persistencia, Mercado Pago, validación, analítica y acceso;
- `migrations/0001_commerce.sql`: esquema inicial de D1;
- `wrangler.example.jsonc`: configuración de referencia sin secretos.

## Pagos

La creación de preferencias ocurre en servidor. El navegador es redirigido a Checkout Pro y los retornos no prueban un pago.

El webhook valida la firma y consulta el estado autoritativo en Mercado Pago. Las transiciones se registran con idempotencia y auditoría.

## Administración

`/admin` y `/api/admin/*` requieren Cloudflare Access. La identidad administrativa se obtiene de cabeceras verificadas por la plataforma y se valida nuevamente en Functions.

## Analítica y privacidad

La analítica es first-party, opcional y condicionada al consentimiento. La retención debe configurarse sólo después de su autorización.

## Seguridad

- no exponer secretos mediante variables `VITE_*`;
- validar entradas en el límite HTTP;
- recalcular totales en servidor;
- usar consultas parametrizadas;
- aplicar idempotencia;
- proteger administración mediante Access;
- mantener comercio, analítica y WhatsApp deshabilitados por defecto;
- conservar una CSP compatible únicamente con conexiones al mismo origen.

## Build

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

La salida pública se genera en `dist`. Las Pages Functions se publican desde `functions/`.