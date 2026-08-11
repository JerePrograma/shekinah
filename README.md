# Shekinah

Aplicación comercial de hierbas, especias, alimentos y productos naturales construida con React, TypeScript estricto, Vite y Cloudflare Pages Functions.

## Funcionalidad

- 510 productos y 16 categorías según la fuente canónica vigente;
- búsqueda, filtro, paginación y fichas individuales;
- carrito persistente y sincronizado entre pestañas;
- datos de entrega sin PII en `localStorage`;
- retiro o entrega personal coordinada y Correo Argentino con cálculo autoritativo;
- cobro manual temporal mediante un Link de Pago autorizado de Mercado Pago sin monto predefinido: el carrito copia el total y abre el enlace para que el comprador lo ingrese;
- Checkout Pro de Mercado Pago por redirección preparado para activación serverless cuando existan D1, credenciales y webhook verificados;
- envío manual del carrito por WhatsApp al número expresamente autorizado;
- pedidos, pagos, webhooks y analítica first-party consentida preparados sobre Cloudflare D1;
- catálogo editable desde un backoffice visual con búsqueda, filtros, miniaturas, editor agrupado, stock opcional y disponibilidad; pedidos/analítica continúan de sólo lectura;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, peso, envío, moneda ni totales del Checkout Pro integrado. El backend vuelve a calcular el carrito desde el catálogo efectivo, compuesto por la base canónica y las mutaciones persistidas en D1, antes de crear un pedido. El fallback manual no crea un pedido en D1 ni confirma automáticamente el pago: el comprador ingresa el total en Mercado Pago y envía el carrito por WhatsApp para que el comercio pueda asociarlo y coordinar la entrega.

En el candidato actual, `stockQuantity` es opcional: si está ausente, el producto conserva el comportamiento legacy sin control de stock. Si existe, debe ser un entero entre 0 y 1.000.000; cero lo vuelve no comprable aunque la disponibilidad manual esté activa. El carrito limita cada línea a `min(99, stock)` y el servidor vuelve a validar al iniciar Checkout Pro. Este control no reserva ni descuenta unidades automáticamente.

## Estado productivo actual

Configuración pública autorizada el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

`https://shekinah.ar` es el dominio público canónico de producción: el custom domain de Pages está activo, usa un CNAME proxied al dominio técnico y responde 200 con TLS confiable emitido por Google. `https://shekinah-7dl.pages.dev` se conserva para Pages y preview. El alias `www` tiene una Bulk Redirect HTTPS `301` al apex que preserva path y query; al seguirla se obtiene el apex 200. Su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico, no un origen. El pack Universal está activo, usa Google Trust Services WE1, cubre `shekinah.ar` y `*.shekinah.ar`, y el handshake negociado usa TLS 1.3.

El sitio puede operar el flujo manual de carrito, Link de Pago y WhatsApp sin VPS. D1 ya está separada y migrada para production/preview, pero Checkout Pro automatizado continúa cerrado con `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` hasta completar credenciales productivas de Mercado Pago, webhook y verificaciones propias de ese flujo. Cloudflare Pages Functions cubre el backend serverless previsto; no es necesario incorporar un VPS para esa arquitectura.

## Rutas públicas

- `/`: inicio;
- `/catalogo`: catálogo;
- `/carrito`: carrito y datos de entrega;
- `/privacidad`: política y controles de analítica;
- `/pago/exito`, `/pago/pendiente`, `/pago/error`: retorno y consulta autoritativa del pedido cuando Checkout Pro está habilitado;
- `/<slug>/`: ficha de producto;
- `/tienda/categoria/<slug>/`: categoría;
- cualquier otra dirección, incluida `/enfoque`: vista 404.

`/admin` no aparece en la navegación y sirve únicamente la pantalla de acceso hasta que el servidor confirma una sesión. `/api/admin/auth/login`, `/api/admin/auth/session` y `/api/admin/auth/logout` administran la sesión; todas las demás rutas `/api/admin/*` exigen en cada solicitud una cookie propia válida o, como compatibilidad opcional, un JWT válido de Cloudflare Access.

La gestión visual de imágenes del candidato admite JPEG, PNG y WebP de hasta 4 MiB, con preview local y validación server-side de tipo y firma binaria. Los binarios administrados requieren un bucket R2 mediante el binding `CATALOG_IMAGES`; las imágenes públicas se sirven por una ruta first-party. Los 484 assets legacy versionados nunca se borran desde el backoffice.

R2 quedó habilitado y vinculado en Pages: producción reutiliza el bucket existente `shekinah`, preview usa el bucket aislado `shekinah-preview` y ambos se exponen a Functions como `CATALOG_IMAGES`. Los dos buckets conservan la clase Standard/default y `publicR2DevEnabled=false`; la lectura pública se realiza exclusivamente por la ruta first-party de Pages, sin dominio `r2.dev`. La infraestructura está verificada, pero el upload del candidato todavía requiere commit, CI, deployment del SHA definitivo y smoke autenticado antes de considerarse productivo.

## Desarrollo

Requisitos:

- Node.js `24.18.0`;
- npm `>=11.0.0`.

```bash
npm ci
npm run install:browsers
npm run dev
```

## Validación

```bash
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

`npm run verify` ejecuta ESLint, TypeScript, Vitest, verificadores de catálogo, pesos, comercio, activos, seguridad y automatización, build de producción y Playwright.

## Configuración segura

Los flags de las capacidades server-side quedan desactivados por defecto:

```text
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
VITE_COMMERCE_ENABLED=false
VITE_ANALYTICS_ENABLED=false
```

Los secretos `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `ORDER_TOKEN_SECRET`, `ANALYTICS_HMAC_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` y `ADMIN_RATE_LIMIT_SECRET` deben cargarse exclusivamente como secretos de Cloudflare. Nunca deben usar el prefijo `VITE_`. La contraseña administrativa se transforma fuera del repositorio mediante PBKDF2-HMAC-SHA-256 con salt aleatoria; no se carga ni se conserva en claro.

`VITE_WHATSAPP_NUMBER` y `VITE_MERCADO_PAGO_PAYMENT_LINK` son datos públicos. El código incluye como defaults únicamente los valores expresamente autorizados arriba y permite sobrescribirlos o deshabilitarlos mediante configuración de build.

La configuración externa, D1, Mercado Pago Checkout Pro, el webhook y la autenticación administrativa deben operarse siguiendo `docs/COMMERCE_DEPLOYMENT.md`. Cloudflare Access es un fallback opcional y no un requisito del login propio. El diseño de entrega y retención está documentado en `docs/FULFILLMENT_AND_RETENTION.md`. Tener el código en `main` o un CI verde no implica que esas integraciones estén vinculadas o activas.

## Producción

Cloudflare Pages debe conservar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- directorio raíz: raíz del repositorio;
- Node.js: `24.18.0`;
- dominio público canónico de producción: `https://shekinah.ar`;
- dominio técnico de Pages y origen documentado para preview: `https://shekinah-7dl.pages.dev`;
- alias `www`: redirección permanente `301` a `https://shekinah.ar`.

La CSP permite conexiones únicamente al mismo origen mediante `connect-src 'self'`. El login y el ABM usan exclusivamente APIs first-party y una cookie `HttpOnly`; las conexiones de Checkout Pro y del fallback opcional de Access ocurren desde Pages Functions. El Link de Pago manual es una navegación HTTPS explícita del comprador hacia Mercado Pago.
