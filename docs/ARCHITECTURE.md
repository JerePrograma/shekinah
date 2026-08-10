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

El candidato agrega `stockQuantity` como atributo opcional dentro del mismo payload de mutación: ausencia significa stock no controlado y conserva el comportamiento de los 510 productos legacy. Si está presente debe ser un entero entre 0 y 1.000.000. `isProductEffectivelyAvailable` centraliza la regla disponibilidad manual activa y, además, stock no controlado o mayor que cero. El carrito limita cada línea a `min(99, stock)` y `server/dynamic-cart.ts` vuelve a comprobar disponibilidad y existencia antes del checkout. No existe reserva ni decremento automático.

La compatibilidad de categorías también es deliberada: los 75 productos legacy sin categoría continúan editables y aparecen bajo el filtro administrativo «Sin categoría». Sólo el alta de un producto nuevo exige al menos una de las categorías canónicas; no se fuerza una clasificación ficticia sobre el catálogo base.

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

`/admin` sirve la SPA sin asumir que el HTML autoriza al usuario. `src/admin/AdminBackoffice.tsx` consulta la sesión y muestra el login o monta el backoffice. La credencial se verifica en servidor con PBKDF2-HMAC-SHA-256; el helper operativo genera 100.000 iteraciones, costo comprobado dentro del límite CPU efectivo del runtime Bundled (32 ms en un smoke remoto negativo con credencial ficticia). La sesión se transporta en una cookie `__Host-` firmada con HMAC, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` y vencimiento de ocho horas. La contraseña, su derivado y los secretos nunca llegan al bundle ni a Web Storage.

`src/admin/ProductManager.tsx` coordina la experiencia de catálogo y delega la presentación en `ProductList`, `ProductEditor` y `ProductImageField`: resumen operativo, búsqueda normalizada, filtros y orden local, listado con miniatura y estados, editor agrupado, slug automático con opción avanzada, categorías del catálogo real, cambios rápidos de stock/disponibilidad, feedback accesible y protección ante cambios sin guardar. Los IDs existentes permanecen estables. Las variantes existentes se conservan en el contrato de producto sin exponer JSON como interfaz cotidiana. El upload sólo se ofrece cuando la API informa `imageStorageConfigured`.

`functions/api/admin/_middleware.ts` valida en cada operación protegida una sesión propia. Sólo cuando no existe cookie propia intenta el JWT RS256 de Cloudflare Access como fallback compatible; una cookie propia presente pero inválida siempre se rechaza. Los tres endpoints de autenticación son la única exclusión exacta del middleware. El login y logout exigen mismo origen, y las mutaciones conservan ese control. `server/admin-login-rate-limit.ts` aplica límites persistentes por IP y usuario mediante claves HMAC opacas en D1; no almacena ninguno de esos valores en claro.

Los productos admiten alta, modificación y baja lógica; pedidos, analítica, exportaciones y auditoría continúan de sólo lectura. La identidad propia usa un actor sintético para no persistir el nombre de usuario en la cookie ni en auditoría.

### Imágenes administradas

El candidato mantiene dos orígenes deliberadamente distintos:

- assets legacy versionados bajo `/images/original/catalog/`, inmutables desde administración;
- objetos administrados en R2, servidos por rutas first-party `/api/catalog-images/*` y escritos únicamente mediante la API autenticada.

El binding configurado es `CATALOG_IMAGES`: production reutiliza el bucket existente `shekinah` y preview usa el bucket aislado `shekinah-preview`. Ambos conservan clase Standard/default y `publicR2DevEnabled=false`; la única lectura pública prevista es la ruta first-party de Pages. La carga acepta JPEG, PNG y WebP de hasta 4 MiB, valida magic bytes y genera keys UUID controladas por servidor. Un alta común nace sin imagen y el `PUT` común sólo puede conservar los mismos `src`; cualquier alta, reemplazo o eliminación de una referencia de imagen pasa por `/api/admin/products/:id/image`. La ruta pública admite únicamente `GET` y `HEAD`, sin listado de objetos.

En reemplazo se carga el objeto nuevo, se persiste la referencia D1 y recién después se intenta limpiar el objeto anterior si pertenece al almacenamiento administrado y ya no está referenciado. Si falla D1 se intenta retirar sólo el objeto recién creado. La baja lógica exige el binding cuando el producto referencia una imagen administrada, persiste primero el tombstone y luego intenta limpiar sólo objetos propios que hayan quedado sin referencias. Este cleanup es best-effort: un fallo externo de `R2.delete` puede dejar un objeto huérfano que debe auditarse y reintentarse sin tocar referencias activas ni assets legacy.

La infraestructura R2 y los bindings de production/preview quedaron verificados por API. La configuración de R2 no alteró `DB`, variables, nombres de secretos administrativos ni `fail_open=false` en Pages. El código del candidato todavía no tiene commit, CI, deployment ni smoke remoto final; una preview local o la mera presencia del binding no prueban persistencia productiva.

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
