# Shekinah

Aplicación comercial de hierbas, especias, alimentos y productos naturales construida con React, TypeScript estricto, Vite y Cloudflare Pages Functions.

## Funcionalidad

- 510 productos y 16 categorías según la fuente canónica vigente;
- búsqueda, filtro, paginación y fichas individuales;
- carrito persistente y sincronizado entre pestañas;
- datos de entrega sin PII en `localStorage`;
- retiro o entrega personal coordinada y Correo Argentino con cálculo autoritativo;
- cobro manual temporal mediante un Link de Pago autorizado de Mercado Pago sin monto predefinido: el carrito copia el total y abre el enlace para que el comprador lo ingrese;
- Checkout Pro de Mercado Pago por redirección con reserva atómica de stock ligada a la preferencia y consumo autoritativo por webhook;
- registro server-side del pedido pendiente, datos completos y reserva de stock antes de abrir WhatsApp al número expresamente autorizado;
- pedidos, pagos, webhooks y analítica first-party consentida preparados sobre Cloudflare D1; el flujo manual registra `manual_payment_click` como interacción, nunca como pago;
- Backoffice V2 con Resumen, Productos, Pedidos, Analítica y Auditoría; conserva el ABM de catálogo y permite aprobar o rechazar únicamente los pedidos pendientes de WhatsApp;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, peso, envío, moneda ni totales. El backend vuelve a calcular el carrito desde el catálogo efectivo, compuesto por la base canónica y las mutaciones persistidas en D1, antes de crear tanto un pedido de Checkout Pro como un pedido pendiente de WhatsApp. El canal manual no confirma automáticamente el pago: persiste primero el pedido y reserva stock; después el comprador abre WhatsApp y el comercio aprueba o rechaza manualmente desde el backoffice.

En el modelo actual, `stockQuantity` es opcional: si está ausente, el producto conserva el comportamiento legacy sin control de stock. Si existe, debe ser un entero entre 0 y 1.000.000; cero disponible lo vuelve no comprable aunque la disponibilidad manual esté activa. El disponible resta las reservas WhatsApp pendientes y las reservas Checkout Pro vigentes. Checkout Pro reserva antes de crear la preferencia durante la misma ventana de 30 minutos; un pago pendiente verificado mantiene la reserva y un pago aprobado —o un reembolso observado sin aprobación previa— descuenta el físico exactamente una vez. Un reembolso no repone mercadería automáticamente. WhatsApp conserva su resolución administrativa: aprobar consume y rechazar libera.

## Estado productivo actual

Configuración pública autorizada el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

`https://shekinah.ar` es el dominio público canónico de producción: el custom domain de Pages está activo, usa un CNAME proxied al dominio técnico y responde 200 con TLS confiable emitido por Google. `https://shekinah-7dl.pages.dev` se conserva para Pages y preview. El alias `www` tiene una Bulk Redirect HTTPS `301` al apex que preserva path y query; al seguirla se obtiene el apex 200. Su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico, no un origen. El pack Universal está activo, usa Google Trust Services WE1, cubre `shekinah.ar` y `*.shekinah.ar`, y el handshake negociado usa TLS 1.3.

El flujo de WhatsApp usa Pages Functions y D1 sin requerir VPS. El 2026-08-12 se aplicó y verificó `0007` primero en preview y luego en producción; el SHA funcional `c19d88dc03f9d98c0c615256bda374769bd2b7a7` obtuvo CI verde, deployment Pages exitoso y smoke público no destructivo. La migración `0008` extiende esa garantía a Checkout Pro y hace obligatorios los datos mínimos de coordinación antes de reservar por WhatsApp. La activación pública de Checkout Pro continúa separada: producción conserva `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` hasta completar rotación de credenciales, webhook, compra controlada y calidad de integración.

La analítica first-party quedó activada de forma independiente de Checkout Pro el 2026-08-11 en preview y producción. Requiere consentimiento explícito, excluye `/admin`, usa secretos HMAC server-side distintos por entorno y retención verificada de 730 días. El flujo manual mide `manual_payment_click` y `whatsapp_open` sin monto, carrito ni PII; ambos son interacciones y nunca pagos confirmados. Las migraciones `0001` a `0006`, el deployment del SHA funcional `bcb6ec0956fa46bba95b2bb5aa8b645657202da8` y los smokes de consentimiento, rechazo, captura y revocación quedaron verificados en D1 aisladas.

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

Tras autenticarse, la navegación administrativa separa Resumen, Productos, Pedidos, Analítica y Auditoría. `ProductManager` permanece montado al cambiar de sección para conservar ediciones sin guardar. El detalle de pedido se consulta bajo demanda mediante `GET /api/admin/orders/[id]` y no expone mutaciones de estados, importes ni timestamps financieros.

La gestión visual de imágenes del candidato admite JPEG, PNG y WebP de hasta 4 MiB, con preview local y validación server-side de tipo y firma binaria. Los binarios administrados requieren un bucket R2 mediante el binding `CATALOG_IMAGES`; las imágenes públicas se sirven por una ruta first-party. Los 484 assets legacy versionados nunca se borran desde el backoffice.

R2 quedó habilitado y vinculado en Pages: producción reutiliza el bucket existente `shekinah`, preview usa el bucket aislado `shekinah-preview` y ambos se exponen a Functions como `CATALOG_IMAGES`. Los dos buckets conservan la clase Standard/default y `publicR2DevEnabled=false`; la lectura pública se realiza exclusivamente por la ruta first-party de Pages, sin dominio `r2.dev`. El deployment actual preserva ambos bindings. En esta activación no se repitió un smoke autenticado de upload/reemplazo/delete porque no se dispuso de la credencial administrativa en claro.

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

Los defaults de código permanecen cerrados. La configuración externa verificada habilita únicamente analítica en preview y producción; no copiar estos defaults sobre Pages sin revisar el estado operativo:

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
