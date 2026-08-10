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
- panel administrativo de sólo lectura preparado para Cloudflare Access;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, peso, envío, moneda ni totales del Checkout Pro integrado. El backend vuelve a calcular el carrito desde `catalog/internal/catalog-index.json` antes de crear un pedido. El fallback manual no crea un pedido en D1 ni confirma automáticamente el pago: el comprador ingresa el total en Mercado Pago y envía el carrito por WhatsApp para que el comercio pueda asociarlo y coordinar la entrega.

## Estado productivo actual

Configuración pública autorizada el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

El sitio puede operar el flujo manual de carrito, Link de Pago y WhatsApp sin VPS. El Checkout Pro automatizado continúa cerrado con `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` hasta completar D1, credenciales productivas de Mercado Pago, webhook y verificaciones de producción. Cloudflare Pages Functions cubre el backend serverless previsto; no es necesario incorporar un VPS para esa arquitectura.

## Rutas públicas

- `/`: inicio;
- `/catalogo`: catálogo;
- `/carrito`: carrito y datos de entrega;
- `/privacidad`: política y controles de analítica;
- `/pago/exito`, `/pago/pendiente`, `/pago/error`: retorno y consulta autoritativa del pedido cuando Checkout Pro está habilitado;
- `/<slug>/`: ficha de producto;
- `/tienda/categoria/<slug>/`: categoría;
- cualquier otra dirección, incluida `/enfoque`: vista 404.

`/admin` y `/api/admin/*` no aparecen en la navegación y deben quedar protegidas por Cloudflare Access en el borde, además de la validación JWT interna.

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

Los secretos `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `ORDER_TOKEN_SECRET` y `ANALYTICS_HMAC_SECRET` deben cargarse exclusivamente como secretos de Cloudflare. Nunca deben usar el prefijo `VITE_`.

`VITE_WHATSAPP_NUMBER` y `VITE_MERCADO_PAGO_PAYMENT_LINK` son datos públicos. El código incluye como defaults únicamente los valores expresamente autorizados arriba y permite sobrescribirlos o deshabilitarlos mediante configuración de build.

La configuración externa, D1, Mercado Pago Checkout Pro, el webhook y Cloudflare Access deben completarse siguiendo `docs/COMMERCE_DEPLOYMENT.md`. El diseño de entrega y retención está documentado en `docs/FULFILLMENT_AND_RETENTION.md`. Tener el código en `main` o un CI verde no implica que esas integraciones estén vinculadas o activas.

## Producción

Cloudflare Pages debe conservar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- directorio raíz: raíz del repositorio;
- Node.js: `24.18.0`;
- dominio público: `https://shekinah-7dl.pages.dev` mientras no se autorice otro dominio primario.

La CSP permite conexiones únicamente al mismo origen mediante `connect-src 'self'`. Las conexiones de Checkout Pro y Cloudflare Access ocurren desde Pages Functions; el Link de Pago manual es una navegación HTTPS explícita del comprador hacia Mercado Pago.
