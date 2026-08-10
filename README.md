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
- catálogo de productos editable y pedidos/analítica de sólo lectura en un backoffice con login propio server-side;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, peso, envío, moneda ni totales del Checkout Pro integrado. El backend vuelve a calcular el carrito desde el catálogo efectivo, compuesto por la base canónica y las mutaciones persistidas en D1, antes de crear un pedido. El fallback manual no crea un pedido en D1 ni confirma automáticamente el pago: el comprador ingresa el total en Mercado Pago y envía el carrito por WhatsApp para que el comercio pueda asociarlo y coordinar la entrega.

## Estado productivo actual

Configuración pública autorizada el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

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
- dominio público: `https://shekinah-7dl.pages.dev` mientras no se autorice otro dominio primario.

La CSP permite conexiones únicamente al mismo origen mediante `connect-src 'self'`. El login y el ABM usan exclusivamente APIs first-party y una cookie `HttpOnly`; las conexiones de Checkout Pro y del fallback opcional de Access ocurren desde Pages Functions. El Link de Pago manual es una navegación HTTPS explícita del comprador hacia Mercado Pago.
