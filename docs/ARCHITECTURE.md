# Arquitectura

## Resumen

Shekinah es una aplicación full-stack liviana construida con React, TypeScript estricto y Vite, desplegada mediante Cloudflare Pages.

La interfaz pública continúa siendo una SPA. Las capacidades de servidor se implementan con Cloudflare Pages Functions y Cloudflare D1. Mercado Pago Checkout Pro se integra por redirección y webhook. Mientras esa integración permanezca cerrada, existe un fallback manual autorizado de Link de Pago más WhatsApp.

La arquitectura comercial detallada se encuentra en `docs/FULL_STACK_COMMERCE.md`.

## Frontend

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y proveedores globales;
- `src/App.tsx`: layout, navegación y selección de vista;
- `src/pages/`: inicio, catálogo, producto, carrito, retornos de pago, privacidad, administración y 404;
- `src/cart/`: estado persistente del carrito;
- `src/commerce/`: contratos, API, sesión de checkout y configuración pública autorizada de fallback;
- `src/analytics/`: consentimiento y cliente first-party;
- `src/data/authorized-commercial-data.ts`: acceso tipado al catálogo;
- `src/styles.css`, `src/catalog.css`, `src/routing.css` y `src/commerce.css`: estilos locales.

## Navegación

El router propio conserva History API y enlaces HTML reales.

`src/routing/routes.ts` resuelve las rutas públicas, comerciales y administrativas. Las rutas desconocidas continúan mostrando la vista 404.

## Catálogo

La fuente canónica conserva 510 productos y 16 categorías. `server/catalog-store.ts` construye el catálogo efectivo como base canónica más altas y overrides D1, menos tombstones D1. Si D1 o la tabla nueva no están disponibles, las lecturas públicas conservan el catálogo base; las escrituras administrativas fallan de forma explícita.

El índice se mantiene en `catalog/internal/catalog-index.json`. El servidor resuelve productos, disponibilidad y precios desde el catálogo efectivo; no acepta nombres, precios ni totales enviados por el cliente como autoridad para Checkout Pro.

## Backend

- `functions/api/`: endpoints públicos y administrativos;
- `functions/admin.ts` y `functions/admin/[[path]].ts`: superficie administrativa;
- `server/`: dominio, persistencia, Mercado Pago, validación, analítica y autenticación/autorización administrativa;
- `migrations/0001_commerce.sql`: esquema inicial de D1;
- `migrations/0002_fulfillment_and_retention.sql`: intención de entrega, fulfillment y mantenimiento de retención;
- `migrations/0003_checkout_intent_cart_fingerprint.sql`: huella autoritativa del carrito en intenciones, con backfill desde pedidos existentes;
- `migrations/0004_catalog_admin.sql`: altas, overrides y tombstones del catálogo administrativo;
- `migrations/0005_admin_auth.sql`: contadores opacos y persistentes para limitar intentos de login;
- `wrangler.example.jsonc`: configuración de referencia sin secretos.

No se requiere VPS: Pages Functions cubre el backend serverless previsto y D1 la persistencia.

## Pagos

### Fallback manual vigente

Cuando `VITE_COMMERCE_ENABLED` no vale `true`, el carrito puede abrir el Link de Pago autorizado `https://link.mercadopago.com.ar/shekinahmoreno`, configurado sin monto. Antes valida los datos de entrega, copia el total visible y solicita luego enviar el carrito por WhatsApp al número autorizado. Este flujo no crea pedidos, no usa webhook y no confirma pagos automáticamente.

### Checkout Pro preparado

La creación de preferencias ocurre en servidor. El navegador es redirigido a Checkout Pro y los retornos no prueban un pago.

El webhook valida la firma y consulta el estado autoritativo en Mercado Pago. Las transiciones se registran con idempotencia y auditoría.

## Administración

`/admin` sirve la SPA sin asumir que el HTML autoriza al usuario. `src/admin/AdminBackoffice.tsx` consulta la sesión y muestra el login o monta el backoffice. La credencial se verifica en servidor con PBKDF2-HMAC-SHA-256 y la sesión se transporta en una cookie `__Host-` firmada con HMAC, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` y vencimiento de ocho horas. La contraseña, su derivado y los secretos nunca llegan al bundle ni a Web Storage.

`functions/api/admin/_middleware.ts` valida en cada operación protegida una sesión propia. Sólo cuando no existe cookie propia intenta el JWT RS256 de Cloudflare Access como fallback compatible; una cookie propia presente pero inválida siempre se rechaza. Los tres endpoints de autenticación son la única exclusión exacta del middleware. El login y logout exigen mismo origen, y las mutaciones conservan ese control. `server/admin-login-rate-limit.ts` aplica límites persistentes por IP y usuario mediante claves HMAC opacas en D1; no almacena ninguno de esos valores en claro.

Los productos admiten alta, modificación y baja lógica; pedidos, analítica, exportaciones y auditoría continúan de sólo lectura. La identidad propia usa un actor sintético para no persistir el nombre de usuario en la cookie ni en auditoría.

## Analítica y privacidad

La analítica es first-party, opcional y condicionada al consentimiento. La retención debe configurarse sólo después de su autorización.

## Seguridad

- no exponer secretos mediante variables `VITE_*`;
- validar entradas en el límite HTTP;
- recalcular totales en servidor para Checkout Pro;
- usar consultas parametrizadas;
- aplicar idempotencia;
- proteger administración mediante sesión propia server-side y middleware fail-closed; Access es sólo un fallback opcional;
- mantener Checkout Pro y analítica deshabilitados por defecto;
- permitir el fallback manual sólo con datos públicos expresamente autorizados y una allowlist exacta del Link de Pago;
- no tratar el fallback manual como confirmación de pago;
- conservar una CSP compatible únicamente con conexiones al mismo origen; la salida hacia el Link de Pago es navegación HTTPS, no una conexión API desde la SPA.

## Build

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

La salida pública se genera en `dist`. Las Pages Functions se publican desde `functions/`.
