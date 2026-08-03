# Shekinah

Aplicación comercial de hierbas, especias, alimentos y productos naturales construida con React, TypeScript estricto, Vite y Cloudflare Pages Functions.

## Funcionalidad

- 510 productos y 16 categorías según la fuente canónica vigente;
- búsqueda, filtro, paginación y fichas individuales;
- carrito persistente y sincronizado entre pestañas;
- Checkout Pro de Mercado Pago por redirección, sin captura de tarjetas;
- alternativa manual por WhatsApp sólo cuando existe un número autorizado;
- pedidos, pagos, webhooks y analítica first-party consentida sobre Cloudflare D1;
- panel administrativo de sólo lectura protegido por Cloudflare Access;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, moneda ni totales. El backend vuelve a calcular el carrito desde `catalog/internal/catalog-index.json` antes de crear un pedido.

## Rutas públicas

- `/`: inicio;
- `/catalogo`: catálogo;
- `/carrito`: carrito;
- `/privacidad`: política y controles de analítica;
- `/pago/exito`, `/pago/pendiente`, `/pago/error`: retorno y consulta autoritativa del pedido;
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

`npm run verify` ejecuta ESLint, TypeScript, Vitest, verificadores de catálogo, comercio, activos, seguridad y automatización, build de producción y Playwright.

## Configuración segura

Los flags quedan desactivados por defecto:

```text
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
VITE_COMMERCE_ENABLED=false
VITE_ANALYTICS_ENABLED=false
```

Los secretos `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `ORDER_TOKEN_SECRET` y `ANALYTICS_HMAC_SECRET` deben cargarse exclusivamente como secretos de Cloudflare. Nunca deben usar el prefijo `VITE_`.

La configuración externa, D1, Mercado Pago, el webhook, Cloudflare Access y el número de WhatsApp deben completarse siguiendo `docs/COMMERCE_DEPLOYMENT.md`. Tener el código en `main` o un CI verde no implica que esas integraciones estén vinculadas o activas.

## Producción

Cloudflare Pages debe conservar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- directorio raíz: raíz del repositorio;
- Node.js: `24.18.0`;
- dominio público configurado explícitamente mediante `PUBLIC_SITE_URL`.

La CSP permite conexiones únicamente al mismo origen mediante `connect-src 'self'`. Las conexiones con Mercado Pago y Cloudflare Access ocurren desde Pages Functions, no desde el navegador.
