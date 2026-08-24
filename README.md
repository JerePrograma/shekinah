# Shekinah

Aplicación comercial de hierbas, especias, alimentos y productos naturales construida con React, TypeScript estricto, Vite y Cloudflare Pages Functions.

## Funcionalidad

- 510 productos y 16 categorías según la fuente canónica vigente;
- búsqueda, filtro, paginación y fichas individuales;
- carrito persistente y sincronizado entre pestañas;
- datos de entrega sin PII en `localStorage`;
- retiro o entrega personal coordinada y Correo Argentino con cálculo autoritativo;
- integración fail-closed de Mercado Libre como catálogo y stock runtime, con mapeo exacto por SKU, OAuth cifrado y reserva upstream versionada;
- Checkout Pro de Mercado Pago por redirección con reserva atómica de stock ligada a la preferencia y consumo autoritativo por webhook;
- registro server-side del pedido pendiente, datos completos y reserva de stock antes de abrir WhatsApp al número expresamente autorizado;
- pedidos, pagos, webhooks y analítica first-party consentida preparados sobre Cloudflare D1; `manual_payment_click` se conserva únicamente como interacción histórica;
- Backoffice V2 con Resumen, Productos, Pedidos, Mercado Libre, Analítica y Auditoría; conserva el ABM editorial, sincroniza el catálogo autoritativo y permite aprobar o rechazar únicamente los pedidos pendientes de WhatsApp;
- política de privacidad, accesibilidad y vista 404.

El navegador no decide precios, disponibilidad, peso, envío, moneda ni totales. Cuando la integración nueva está activada, el backend vuelve a consultar Mercado Libre, recalcula el carrito desde el espejo D1, reserva el stock versionado antes de crear Checkout Pro o WhatsApp y falla cerrado ante datos obsoletos o modalidades no protegibles. El canal WhatsApp persiste primero el pedido y reserva stock; después el comercio aprueba o rechaza manualmente desde el backoffice.

En el modelo actual, `stockQuantity` es opcional: si está ausente, el producto conserva el comportamiento legacy sin control de stock. Si existe, debe ser un entero entre 0 y 1.000.000; cero disponible lo vuelve no comprable aunque la disponibilidad manual esté activa. El disponible resta las reservas WhatsApp pendientes y las reservas Checkout Pro vigentes. Checkout Pro reserva antes de crear la preferencia durante la misma ventana de 30 minutos; un pago pendiente verificado mantiene la reserva y un pago aprobado —o un reembolso observado sin aprobación previa— descuenta el físico exactamente una vez. Un reembolso no repone mercadería automáticamente. WhatsApp conserva su resolución administrativa: aprobar consume y rechazar libera.

## Estado productivo actual

Configuración pública vigente:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
```

`https://shekinah.ar` es el dominio público canónico de producción: el custom domain de Pages está activo, usa un CNAME proxied al dominio técnico y responde 200 con TLS confiable emitido por Google. `https://shekinah-7dl.pages.dev` se conserva para Pages y preview. El alias `www` tiene una Bulk Redirect HTTPS `301` al apex que preserva path y query; al seguirla se obtiene el apex 200. Su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico, no un origen. El pack Universal está activo, usa Google Trust Services WE1, cubre `shekinah.ar` y `*.shekinah.ar`, y el handshake negociado usa TLS 1.3.

El flujo de WhatsApp usa Pages Functions y D1 sin requerir VPS. El 2026-08-12 se aplicó y verificó `0007` primero en preview y luego en producción; el SHA funcional `c19d88dc03f9d98c0c615256bda374769bd2b7a7` obtuvo CI verde, deployment Pages exitoso y smoke público no destructivo. La migración `0008` extiende esa garantía a Checkout Pro y hace obligatorios los datos mínimos de coordinación antes de reservar por WhatsApp. La activación pública de Checkout Pro continúa separada: producción conserva `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` hasta completar rotación de credenciales, webhook, compra controlada y calidad de integración.

La migración aditiva `0009` y el código de Mercado Libre incorporan OAuth, catálogo espejo, variaciones, frescura, notificaciones y ledger upstream. `MERCADO_LIBRE_CATALOG_ENABLED=false` y `VITE_MERCADO_LIBRE_CATALOG_ENABLED=false` siguen siendo los defaults seguros: no deben activarse hasta verificar el seller, aplicar la migración, completar la sincronización real y demostrar que las unidades vendibles usan stock `seller_warehouse` versionado.

La analítica first-party quedó activada de forma independiente de Checkout Pro el 2026-08-11 en preview y producción. Requiere consentimiento explícito, excluye `/admin`, usa secretos HMAC server-side distintos por entorno y retención verificada de 730 días. `whatsapp_open` continúa como interacción; `manual_payment_click` sólo conserva la semántica de los datos históricos y ninguno representa pagos confirmados.

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

Los secretos `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `ORDER_TOKEN_SECRET`, `MERCADO_LIBRE_CLIENT_SECRET`, `MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY`, `ANALYTICS_HMAC_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` y `ADMIN_RATE_LIMIT_SECRET` deben cargarse exclusivamente como secretos de Cloudflare y separarse por entorno. Nunca deben usar el prefijo `VITE_`. La contraseña administrativa se transforma fuera del repositorio mediante PBKDF2-HMAC-SHA-256 con salt aleatoria; no se carga ni se conserva en claro.

`VITE_WHATSAPP_NUMBER` es un dato público autorizado. El Link de Pago fijo y su variable pública fueron retirados del carrito; no existe fallback automático que solicite al comprador ingresar un monto.

La configuración externa, D1, Mercado Libre, Mercado Pago Checkout Pro, webhooks y autenticación administrativa deben operarse siguiendo `docs/MERCADO_LIBRE_CATALOG_AND_STOCK.md` y `docs/COMMERCE_DEPLOYMENT.md`. Tener el código en `main` o un CI verde no implica que esas integraciones estén vinculadas o activas.

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

La CSP permite conexiones únicamente al mismo origen mediante `connect-src 'self'`. El login, el catálogo runtime y el backoffice usan APIs first-party y una cookie `HttpOnly`; las conexiones con Mercado Libre y Mercado Pago ocurren exclusivamente desde Pages Functions.
