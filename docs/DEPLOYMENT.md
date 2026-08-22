# Despliegue

## Configuración de Cloudflare Pages

Nombre exacto del proyecto Pages: `shekinah`

Dominio público canónico: `shekinah.ar`

Dominio técnico de Pages y origen de preview: `shekinah-7dl.pages.dev`

Alias `www`: Bulk Redirect HTTPS `301` a `https://shekinah.ar`, preserva path/query y termina en 200

Rama de producción: `main`

Comando de build: `npm run build:pages`

Directorio de salida: `dist`

Versión de Node.js: `24.18.0`

Directorio raíz: raíz del repositorio.

Pages Functions: `functions/`.

Configuración de referencia: `wrangler.example.jsonc`.

Existe un Worker independiente también llamado `shekinah`. Verificar siempre que la ruta del panel sea `pages/view/shekinah`; los settings bajo `workers/services/view/shekinah` pertenecen al recurso equivocado.

## Estado externo verificado el 2026-08-22

- build `npm run build:pages`, salida `dist`, rama `main` y deployments automáticos: verificados;
- binding `DB`: `shekinah-commerce` en producción y `shekinah-commerce-preview` en preview;
- migraciones `0001` a `0008`: aplicadas y sin pendientes en ambas D1;
- variables server-side: analítica activa y retención 730 en ambos; backend de comercio cerrado en producción y habilitado sólo para sandbox de preview, con botón público cerrado en ambos;
- secretos administrativos: cuatro nombres cifrados presentes en ambos entornos, valores no inspeccionables;
- secreto analítico: `ANALYTICS_HMAC_SECRET` presente como `secret_text` con valor independiente por entorno;
- Zero Trust y Access: no configurados; el código lo admite sólo como fallback opcional;
- runtime de producción y preview: `Fail closed`;
- Checkout Pro: continúa deshabilitado. Producción tiene los nombres cifrados requeridos y modo `production`, pero la credencial expuesta debe rotarse, Webhooks debe limitarse a pagos y falta un pago productivo controlado; analítica first-party permanece activa bajo consentimiento.
- R2: activo, con bucket existente `shekinah` reutilizado en producción y bucket aislado `shekinah-preview` en preview;
- binding `CATALOG_IMAGES`: configurado en producción y preview; ambos buckets Standard/default, `publicR2DevEnabled=false` y lectura pública exclusivamente first-party mediante Pages;
- upload administrativo: infraestructura y deployment listos; smoke autenticado de imágenes no repetido en esta activación por ausencia de credencial en claro.
- zona DNS `shekinah.ar`: `active`, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`;
- DNSSEC: deshabilitado, sin DS publicado en `.ar`; estado inicial válido y sin cadena rota;
- custom domain del apex, verificación y validación: `active`; CNAME proxied al dominio técnico de Pages;
- apex HTTPS: 200 con certificado confiable emitido por Google;
- `www`: Bulk Redirect HTTPS `301` al apex preservando path/query y destino final 200; el A proxied `192.0.2.1` es el placeholder oficial para entregar tráfico a la regla, no un origen;
- TLS de apex y `www`: pack Universal `active` de Google Trust Services WE1, SAN `shekinah.ar` y `*.shekinah.ar`, TLS 1.3 verificado.

Como `/api/*`, `/admin` y `/admin/*` están incluidos en `public/_routes.json`, ambos entornos deben conservar `Fail closed`. Cloudflare documenta la diferencia en <https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed>.

## Configuración pública autorizada el 2026-08-10

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

Los dos valores `VITE_*` son públicos y están incluidos como defaults autorizados en el código para permitir el fallback manual de carrito, Link de Pago y WhatsApp aunque Pages no tenga variables de build. La API confirmó `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS` en `https://shekinah.ar` para production y en `https://shekinah-7dl.pages.dev` para preview. `PUBLIC_SITE_URL` debe permanecer explícito como variable server-side antes de habilitar Checkout Pro.

El apex fue agregado mediante Custom Domains del proyecto Pages, sin usar IPs circunstanciales ni registros A/AAAA inventados. Conservar el CNAME proxied administrado y no reemplazar el placeholder de `www` por una supuesta IP de origen. Apex, `www`, TLS y redirección quedaron verificados por separado.

El fallback manual no necesita VPS. El Link de Pago externo no usa D1, pero el pedido WhatsApp publicado depende de Pages Functions, D1 y `0007` para persistir y reservar antes de abrir la conversación. Checkout Pro tampoco requiere VPS y continúa deshabilitado hasta completar su configuración externa.

## Estados separados

Debe registrarse por separado:

1. SHA publicado en GitHub;
2. GitHub Actions para ese SHA;
3. deployment de Pages;
4. fallback manual público;
5. bindings disponibles;
6. D1 creado y vinculado;
7. migraciones aplicadas;
8. secretos configurados;
9. Mercado Pago Checkout Pro y webhook;
10. autenticación administrativa propia y Access opcional;
11. activación de Checkout Pro;
12. activación analítica;
13. pruebas de humo.
14. R2, buckets y binding de imágenes administrativas.

## Variables y secretos

No almacenar secretos en Git ni exponerlos mediante variables `VITE_*`.

Los nombres y requisitos concretos se obtienen desde:

- `.env.example`;
- `wrangler.example.jsonc`;
- `server/config.ts`;
- `docs/COMMERCE_DEPLOYMENT.md`.

Los números de WhatsApp, dominios públicos y Links de Pago no son secretos, pero sólo pueden incorporarse cuando hayan sido autorizados expresamente.

## D1

Las migraciones versionadas son `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql`, `migrations/0003_checkout_intent_cart_fingerprint.sql`, `migrations/0004_catalog_admin.sql`, `migrations/0005_admin_auth.sql`, `migrations/0006_analytics_manual_payment_click.sql`, `migrations/0007_whatsapp_order_reservations.sql` y `migrations/0008_checkout_pro_stock_and_whatsapp_identity.sql`; deben aplicarse en ese orden. La evidencia remota del 2026-08-22 cubre `0001` a `0008` en preview y producción, con bookmarks previos, esquema, triggers, conteos y claves foráneas verificados.

El endpoint `/query` de D1 devolvió `7500 incomplete input` al intentar `0008` con triggers y revirtió todo. El cierre usó `wrangler d1 execute --file`, que invoca el import oficial, con el SQL versionado y la inserción exacta de su nombre en `d1_migrations`; producción sólo se migró después de la verificación funcional y limpieza de preview.

Antes de aplicarlas:

- confirmar dos bases separadas y sus entornos;
- usar `shekinah-commerce` sólo para producción y `shekinah-commerce-preview` sólo para preview;
- conservar un plan de reversión;
- revisar el SQL real;
- ejecutar primero en un entorno no productivo cuando exista;
- registrar la salida completa.

## R2 e imágenes administrativas

El candidato de código usa el binding `CATALOG_IMAGES` con aislamiento entre entornos:

- producción: bucket existente `shekinah`;
- preview: bucket aislado `shekinah-preview`.

Las rutas first-party aceptan únicamente JPEG, PNG y WebP de hasta 4 MiB y validan magic bytes en servidor. Las referencias se persisten en la mutación D1 existente; los binarios viven en R2. Un reemplazo no borra la imagen anterior hasta persistir la nueva referencia, y nunca elimina assets legacy.

R2 y ambos bindings quedaron verificados por API. Los buckets conservan clase Standard/default y `publicR2DevEnabled=false`; no habilitar un dominio público `r2.dev`, porque la lectura debe pasar por la ruta first-party de Pages. La relectura de Pages confirmó que `DB`, variables, nombres de secretos administrativos y `fail_open=false` no cambiaron. No considerar productiva la capacidad del candidato hasta verificar deployment del SHA exacto y smoke autenticado de upload/reemplazo/delete.

## Mercado Pago

### Fallback manual actual

El Link de Pago `https://link.mercadopago.com.ar/shekinahmoreno` está autorizado como solución temporal sin monto predefinido. El carrito copia el total y abre el enlace; el comprador ingresa el monto. Al solicitar WhatsApp, cliente y servidor exigen nombre, celular y domicilio completos; luego el flujo crea un pedido pendiente y reserva stock mediante Pages Functions/D1. No crea una preferencia ni verifica pagos por webhook.

### Checkout Pro integrado pendiente de activación

- usar primero credenciales de prueba;
- configurar secretos fuera de Git;
- registrar la URL definitiva del webhook;
- no aceptar precios ni estados enviados por el cliente;
- comprobar firma, consulta autoritativa e idempotencia.
- renovar toda credencial expuesta y actualizarla directamente como secreto cifrado;
- suscribir únicamente eventos de pagos, porque la Function no procesa otros tópicos;
- validar reserva, pago pendiente, aprobación, idempotencia, consumo de stock y reconciliación mediante un pago real controlado antes de habilitar el botón público.

## Autenticación administrativa

La protección primaria es server-side: PBKDF2 para la credencial, cookie `__Host-` HMAC de ocho horas y middleware para todo `/api/admin/*` excepto las tres rutas exactas de autenticación. Los cuatro valores `ADMIN_*` son secretos cifrados por entorno. El rate limiting depende de D1 y de `0005_admin_auth.sql`.

Cloudflare Access no es obligatorio. El JWT interno se conserva como fallback cuando no existe cookie propia. No aplicar una política externa a `/admin*` o a todo `/api/admin/*` que intercepte el login antes de Pages Functions.

## Activación

- fallback manual de Link de Pago y WhatsApp: autorizado en código desde el 2026-08-10;
- Checkout Pro automatizado: código, D1, CI y deployment listos; activación productiva bloqueada por rotación, Webhooks, pago controlado y calidad de integración;
- analítica first-party: habilitada desde el 2026-08-11 en preview y producción, siempre bajo consentimiento y con retención 730;
- administración: configuración externa lista; sólo se considera productiva sobre un SHA con deployment y smoke autenticado verificados.

## Verificación

Después del despliegue:

- comprobar rutas públicas;
- comprobar encabezados;
- comprobar que el Link de Pago visible tenga el `href` exacto autorizado;
- comprobar que WhatsApp use el número `5492236216559` y el mensaje incluya carrito y total;
- comprobar que usar el fallback no llame a `/api/checkout/preferences`;
- comprobar que los endpoints server-side deshabilitados fallen de forma segura;
- comprobar administración protegida;
- comprobar creación idempotente de pedidos WhatsApp aun con Checkout Pro cerrado, y comprobar pedidos Checkout Pro sólo cuando ese canal esté configurado;
- comprobar webhook con eventos controlados antes de activar Checkout Pro;
- comprobar que ningún secreto aparezca en respuestas o bundles.
- comprobar semántica legacy de stock no controlado, stock cero y disponibilidad manual;
- comprobar que cliente y servidor rechacen cantidades superiores a `min(99, stock)`;
- comprobar formato/tamaño/firma, rutas first-party y cleanup en R2 sin tocar assets legacy ni habilitar `r2.dev`.

La configuración de Pages, D1, migraciones `0001` a `0006`, bindings `DB`/`CATALOG_IMAGES`, nombres de secretos administrativos y analíticos, `Fail closed` y aislamiento R2 quedó verificada el 2026-08-11. Zero Trust/Access continúa ausente por diseño opcional y Mercado Pago Checkout Pro permanece deshabilitado. El SHA funcional `bcb6ec0956fa46bba95b2bb5aa8b645657202da8`, CI `31452548845`, deployments y smokes analíticos quedaron comprobados; el smoke autenticado de administración no se repitió por ausencia de credencial en claro.
