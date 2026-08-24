# Despliegue del comercio

## Extensión Mercado Libre

Desde el 2026-08-24, aplicar también la secuencia completa de `docs/MERCADO_LIBRE_CATALOG_AND_STOCK.md`. La integración agrega la migración `0009`, variables y secretos de Mercado Libre, el flag independiente `MERCADO_LIBRE_CATALOG_ENABLED` y una única reconciliación GitHub Actions cada cinco minutos. `MERCADO_LIBRE_SCHEDULER_SECRET` debe existir cifrado tanto en Pages producción como en el environment GitHub `cloudflare-pages-production`; no se reutiliza una sesión administrativa. El Link de Pago manual ya no es un mecanismo de rollback: el cierre seguro consiste en ocultar el botón y bloquear nuevas preferencias, manteniendo webhooks y conciliación.

## Regla de activación

La presencia del código no habilita capacidades por sí sola. Los defaults de código permanecen cerrados, pero el estado externo verificado desde el 2026-08-11 es:

```text
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENABLED=true
```

No cambiar los flags de comercio hasta completar el checklist de sandbox, webhooks, D1 y aprobación comercial. La analítica es una capacidad separada, opt-in y ya activada después de migración, secretos independientes, preview y smoke productivo. La autenticación administrativa tampoco habilita Checkout Pro.

WhatsApp permanece como canal separado y no equivale a `COMMERCE_ENABLED=true`; requiere Pages Functions, D1 y las migraciones vigentes para persistir y reservar antes de abrir el mensaje. El Link de Pago manual fue retirado.

El nombre remoto del proyecto Pages es `shekinah`; `shekinah-7dl.pages.dev` es su dominio técnico y de preview, mientras que `https://shekinah.ar` es el origen público canónico de producción. Existe además un Worker independiente llamado `shekinah`: no configurar bindings ni variables en ese Worker.

No se necesita VPS. Tanto el pedido WhatsApp como Checkout Pro usan Pages Functions y D1.

La zona `shekinah.ar` figura `active` en Cloudflare y está delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`. DNSSEC permanece deshabilitado y `.ar` no publica un DS, estado válido para esta etapa. El custom domain del apex, su verificación y validación figuran `active`; el CNAME proxied apunta al dominio técnico de Pages y `https://shekinah.ar` responde 200 con TLS confiable emitido por Google. La Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` hacia el apex preservando path y query y termina en 200. Su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico, no una IP de origen ni un destino de Pages. El pack Universal está activo con Google Trust Services WE1, SAN para `shekinah.ar` y `*.shekinah.ar`, y TLS 1.3 verificado.

## 1. Validar el commit exacto

Desde un checkout limpio de `main`:

```powershell
npm ci --no-audit --no-fund
npm run install:browsers
npm run verify
npm run build:pages
```

Comprobar además:

```powershell
Get-ChildItem .\dist -Recurse -File -Filter *.map
```

El último comando no debe devolver archivos. Registrar el SHA con `git rev-parse HEAD` y verificar que GitHub Actions aprobó ese mismo SHA, no solamente la rama.

## 2. Configuración pública autorizada

Valores reales autorizados el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
```

`src/commerce/env.ts` contiene únicamente el número público autorizado. Una cadena vacía lo deshabilita. No colocar credenciales en valores `VITE_*`.

`PUBLIC_SITE_URL` es configuración server-side y debe cargarse explícitamente antes de habilitar Checkout Pro. Debe conservar exactamente el origen HTTPS, sin path ni barra final adicional.

### Comportamiento con Checkout cerrado

- **Pagar con Mercado Pago** aparece deshabilitado;
- no existe enlace fijo, copia del total ni campo de importe;
- antes de abrir WhatsApp, la Function recalcula el carrito, crea un pedido pendiente idempotente y reserva stock;
- después envía el mensaje con el identificador para coordinar la entrega;
- si Correo Argentino requiere cotización manual, Checkout Pro queda bloqueado y se deriva a WhatsApp;
- este flujo crea `orders` con `channel='whatsapp'` e items; no genera una preferencia ni marca el pedido como pago aprobado.

## 3. Crear, migrar y vincular D1

Estado verificado el 2026-08-10: la cuenta partía de cero bases y se crearon exactamente `shekinah-commerce` para producción y `shekinah-commerce-preview` para preview. Ambas estaban vacías, se obtuvieron bookmarks de Time Travel antes del primer cambio y quedaron vinculadas por separado al binding `DB`. No compartir una base entre entornos.

Para reconstruir esa configuración sólo si las bases no existen y el inventario de cuenta lo confirma inequívocamente:

```powershell
npx wrangler d1 create shekinah-commerce-preview
npx wrangler d1 create shekinah-commerce
npx wrangler d1 info shekinah-commerce
```

Copiar `wrangler.example.jsonc` a `wrangler.jsonc` únicamente cuando se conozcan los IDs reales. Reemplazar `database_id` y `preview_database_id`; no dejar marcadores en una configuración activa ni rastrear el archivo.

El binding debe llamarse exactamente `DB`. Producción refiere `shekinah-commerce`; preview usa exclusivamente `shekinah-commerce-preview`.

Validar la migración local:

```powershell
npx wrangler d1 migrations apply shekinah-commerce --local
npx wrangler d1 execute shekinah-commerce --local --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
```

Antes de una migración remota sobre una base que ya contenga datos, conservar una exportación o bookmark verificable y documentar el punto de reversión. Con la configuración completa de Pages —preview en el nivel superior y production en `env.production`— aplicar primero preview y después producción:

```powershell
npx wrangler d1 time-travel info shekinah-commerce-preview --json
npx wrangler d1 migrations apply DB --remote --preview
npx wrangler d1 migrations list DB --remote --preview
npx wrangler d1 time-travel info shekinah-commerce --json
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler d1 migrations list DB --remote --env production
```

No aplicar SQL manual distinto de las migraciones versionadas.

El flujo versionado aplica en orden `0001` a `0008`. `0004` crea la persistencia del ABM, `0005` el rate limiting, `0006` amplía el CHECK analítico, `0007` agrega canal/resolución de pedidos y reservas WhatsApp, y `0008` incorpora la reserva/consumo de Checkout Pro y la huella de datos WhatsApp. `0007` quedó aplicada y verificada el 2026-08-12 primero en preview y luego en producción. `0008` debe repetir el orden preview → verificación → producción antes de desplegar Functions dependientes: confirmar columnas, índice, triggers, conteos, `PRAGMA foreign_key_check` y migración registrada.

`0007` ni `0008` deben revertirse editando o borrando una migración aplicada. Ante rollback de código, primero cortar nuevas preferencias, conciliar pagos y resolver de forma controlada todas las reservas activas; sólo entonces volver a una versión anterior, dejando el esquema aditivo sin uso. Mantener código anterior con reservas Checkout Pro activas haría que el catálogo ignore unidades comprometidas y que un webhook deje de consumirlas.

### 3.1. R2 para imágenes administrativas

El candidato usa un binding Pages llamado exactamente `CATALOG_IMAGES`:

| Entorno | Bucket requerido |
| --- | --- |
| production | `shekinah` (existente, reutilizado) |
| preview | `shekinah-preview` (aislado, creado para este entorno) |

No compartir bucket entre entornos y no configurar estos bindings en el Worker homónimo. Antes de cualquier cambio futuro, inventariar la cuenta y confirmar que los nombres siguen siendo inequívocamente de Shekinah. Después de modificar un binding, redeployar y releer el deployment para comprobar que quedó materializado.

Estado externo verificado el 2026-08-10: R2 está activo, production reutiliza `shekinah`, preview usa `shekinah-preview` y Pages tiene `CATALOG_IMAGES` correctamente separado por entorno. Ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`; la lectura pública debe pasar exclusivamente por `/api/catalog-images/*` en Pages, sin dominio `r2.dev`. La relectura de Pages confirmó además que `DB`, variables, los cuatro nombres de secretos administrativos y `fail_open=false` permanecen sin cambios. No se leyeron ni registraron valores secretos.

Clasificación: infraestructura `VERIFICADA`, capacidad del candidato `PENDIENTE_DEPLOYMENT_Y_SMOKE`. No afirmar que el upload está desplegado aunque el código, una preview local o los tests sean correctos. No usar base64 en D1, Git, almacenamiento local del navegador u otro proveedor como sustituto.

Antes de publicar o modificar esta integración:

1. listar buckets y detenerse ante candidatos ambiguos;
2. comprobar `shekinah` para production y `shekinah-preview` para preview sin recrearlos ni reemplazarlos;
3. releer `CATALOG_IMAGES`, clase Standard/default y `publicR2DevEnabled=false` en ambos entornos;
4. desplegar el SHA definitivo;
5. probar lectura pública first-party y escritura/reemplazo/delete sólo con sesión administrativa;
6. comprobar que assets legacy y objetos compartidos no se eliminen.

## 4. Configurar variables no secretas del Checkout Pro

En producción:

```text
PUBLIC_SITE_URL=https://shekinah.ar
ALLOWED_SITE_ORIGINS=https://shekinah.ar
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENABLED=true
ANALYTICS_RETENTION_DAYS=730
```

En preview:

```text
PUBLIC_SITE_URL=https://mp-sandbox.shekinah-7dl.pages.dev
ALLOWED_SITE_ORIGINS=https://mp-sandbox.shekinah-7dl.pages.dev
COMMERCE_ENABLED=true
VITE_COMMERCE_ENABLED=false
ANALYTICS_ENABLED=true
VITE_ANALYTICS_ENABLED=true
ANALYTICS_RETENTION_DAYS=730
MERCADO_PAGO_CHECKOUT_MODE=sandbox
```

`PUBLIC_SITE_URL` construye las URLs de retorno y webhook. Production debe usar el apex canónico y preview el dominio técnico de Pages; no intercambiar ambos entornos.

Los valores anteriores se releyeron el 2026-08-22. Preview permite llamadas backend controladas en sandbox pero mantiene oculto el botón público; producción conserva ambos flags en `false` y `MERCADO_PAGO_CHECKOUT_MODE=production`. `VITE_*` exige un build nuevo porque se incorpora al bundle. Si se habilita el fallback opcional de Access, agregar recién entonces `CLOUDFLARE_ACCESS_TEAM_DOMAIN` y `CLOUDFLARE_ACCESS_AUD` reales.

## 5. Configurar secretos

### Autenticación administrativa

Crear por entorno, sin reutilizar valores:

- `ADMIN_USERNAME`: cuenta server-side; no se incorpora al frontend;
- `ADMIN_PASSWORD_HASH`: `pbkdf2-sha256$iteraciones$salt-base64url$derivado-base64url`, generado con salt criptográfica aleatoria y PBKDF2-HMAC-SHA-256. El valor operativo usa 100.000 iteraciones: 300.000 y 600.000 excedieron el límite CPU efectivo del runtime Bundled, mientras que 100.000 completó una verificación remota negativa con credencial ficticia en 32 ms de CPU; no reducir el costo sin repetir benchmark y smoke productivo;
- `ADMIN_SESSION_SECRET`: al menos 32 bytes aleatorios codificados en base64url;
- `ADMIN_RATE_LIMIT_SECRET`: al menos 32 bytes aleatorios independientes, codificados en base64url.

La contraseña sólo se ingresa mediante prompt protegido en el proceso que genera el derivado. No se escribe en scripts versionados, argumentos, archivos temporales ni salida. Cargar los cuatro valores como `secret_text` independientes en production y preview mediante el selector de entorno de Pages o la API autenticada. La versión de Wrangler verificada no expone un selector de entorno en `pages secret put`; no asumir que un comando sin selector escribe ambos. Comprobar después únicamente presencia, nombre y tipo, nunca valores.

Para rotar contraseña: generar un hash nuevo con salt nueva y 100.000 iteraciones, actualizar `ADMIN_PASSWORD_HASH` en ambos entornos y desplegar para materializar el nuevo snapshot. Si se requiere cierre global de sesiones, rotar además `ADMIN_SESSION_SECRET`; no basta con cambiar el hash porque las cookies ya emitidas siguen firmadas hasta vencer.

### Comercio y analítica

Crear valores aleatorios independientes, de al menos 32 bytes, para `ORDER_TOKEN_SECRET` y `ANALYTICS_HMAC_SECRET`. No pegarlos en archivos, documentación, argumentos de línea de comandos ni logs.

Cargar cada valor como `secret_text` en el entorno exacto desde Pages o mediante la API autenticada. Confirmar después únicamente nombres y tipos; nunca leer, copiar ni registrar valores.

Los cuatro secretos administrativos quedaron presentes y cifrados en ambos entornos el 2026-08-10; sus valores no se registran. `ANALYTICS_HMAC_SECRET` quedó presente con valores independientes en ambos entornos el 2026-08-11. El 2026-08-22 se verificó por nombre —sin leer valores— que producción también contiene `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `ORDER_TOKEN_SECRET`. La presencia no certifica vigencia: una credencial expuesta debe rotarse en el proveedor y actualizarse en Pages antes de cualquier activación.

### Precaución con deployments directos

Si un `wrangler.jsonc` local contiene `pages_build_output_dir`, Cloudflare lo trata como fuente de verdad del deployment y puede reemplazar variables o bindings configurados en el dashboard. El archivo operativo real está ignorado por Git y contiene IDs; no publicarlo. Para un upload manual, mantener preview completo en el nivel superior y production completo en `env.production`: variables, D1 y R2 deben figurar en ambos. En particular, el `database_id` del nivel superior debe ser la D1 preview; `preview_database_id` no sustituye ese valor al publicar Pages. Releer después por API los destinos reales de `DB` y `CATALOG_IMAGES`, los flags, secretos por nombre y `fail_open=false` antes de ejecutar smoke.

## 6. Configurar Mercado Pago Checkout Pro

1. Usar primero credenciales de prueba y `MERCADO_PAGO_CHECKOUT_MODE=sandbox`.
2. Registrar la URL de notificación exacta: `https://shekinah.ar/api/webhooks/mercadopago`. Al crear cada preferencia, el backend agrega `source_news=webhooks` para solicitar ese formato de notificación sin cambiar el endpoint público.
3. Habilitar únicamente el tópico de pagos usado por Checkout Pro. No suscribir eventos que el endpoint no procesa.
4. Copiar el secreto de firma de Webhooks en `MERCADO_PAGO_WEBHOOK_SECRET`.
5. Confirmar que el proveedor envía `x-signature`; validar `x-request-id` dentro del manifiesto cuando el header esté presente, sin inventarlo cuando el proveedor lo omita.
6. Realizar pagos de prueba aprobados, pendientes y rechazados.
7. Verificar en D1 que cada pago coincida individualmente en `external_reference`, `metadata.order_id`, importe total y moneda; que `live_mode` corresponda al entorno; que el `user_id` de la notificación coincida con el `collector_id` consultado; y que un webhook duplicado no duplique pagos ni efectos. El endpoint rechaza bodies que excedan 64.000 bytes durante la lectura del stream.
8. Probar la conciliación desde el backoffice: debe consultar por `external_reference`, validar nuevamente pago y entorno, registrar `admin.order.reconcile` y conservar exactamente un consumo de stock ante repeticiones.

La creación de preferencias no depende de un encabezado de idempotencia no documentado por Checkout Pro. D1 reclama un único intento por pedido y la preferencia vence al concluir la misma ventana de 30 minutos, calculada desde `orders.created_at`. Si la respuesta del proveedor es incierta, las solicitudes siguientes recuperan por `external_reference` y permanecen cerradas si no pueden demostrar un resultado único con carrito y vigencia exactos.

Los productos con `stockQuantity` son elegibles sólo con `0008` aplicada. D1 reserva antes de llamar al proveedor, comparte disponibilidad con WhatsApp y serializa la última unidad. La reserva vence con la preferencia salvo que exista un pago `pending`; `approved` o `refunded` consume el físico una vez. No activar Functions nuevas contra un esquema anterior ni tratar un reembolso como reposición de mercadería.

Cada `provider_payment_id` aceptado debe cubrir por sí solo el total exacto en ARS y referenciar el pedido; no se suman pagos parciales. Ante varios pagos compatibles, el pedido se deriva del conjunto persistido con prioridad `approved` → `refunded` → `pending` → `rejected` → `cancelled`. La facturación administrativa cuenta el pedido una vez, pero `Pagos aprobados` conserva el conteo de IDs exactos para evidenciar un posible doble cobro.

Los parámetros de retorno nunca constituyen prueba de pago. La prueba válida es el estado recuperado con el access token después de un webhook firmado.

Antes de pasar a producción, cambiar el access token y `MERCADO_PAGO_CHECKOUT_MODE=production`, volver a desplegar y repetir una compra controlada de bajo importe. No reutilizar credenciales de sandbox.

Cuando Checkout Pro productivo quede validado, decidir explícitamente si se retira el fallback manual o si ambos flujos deben coexistir. No habilitarlos silenciosamente como equivalentes porque tienen garantías operativas distintas.

## 7. Configurar autenticación administrativa y Access opcional

La autenticación propia es el mecanismo primario y funciona sin Zero Trust:

1. `/admin` debe poder servir la SPA para mostrar el login.
2. `POST /api/admin/auth/login` verifica credenciales, origen, tamaño y rate limiting D1.
3. `GET /api/admin/auth/session` confirma la cookie `__Host-`.
4. `POST /api/admin/auth/logout` la elimina.
5. El middleware exige identidad en todo el resto de `/api/admin/*`.

No crear una política externa de Access que intercepte obligatoriamente `/admin*` o `/api/admin/*`: impediría llegar al login y no reconoce la cookie propia. Zero Trust permanecía ausente en el inventario del 2026-08-10 y no es un bloqueo para este flujo.

`server/access.ts` se conserva como fallback interno. Si se habilita en el futuro, configurar Team Domain y AUD reales y diseñar la política de borde de modo que no bloquee los tres endpoints propios. Una cookie propia presente pero inválida nunca cae a Access.

Pruebas obligatorias:

- `/admin` sin sesión muestra el formulario;
- API administrativa sin sesión responde 401;
- usuario o contraseña incorrectos reciben el mismo 401;
- cookie alterada o vencida recibe 401;
- sesión válida permite una operación y logout vuelve a cerrar la API;
- JWT Access válido funciona sólo como fallback, si se configuró.

Producción y preview deben usar `Fail closed`. Este valor quedó verificado en ambos el 2026-08-10; `public/_routes.json` incluye `/api/*`, `/admin` y `/admin/*` y no debe caer a activos estáticos si se agota la cuota de Pages Functions.

## 8. Validar preview

Con D1 de preview y sandbox:

- usar únicamente la D1 y los secretos aislados de preview; si se restringe el entorno con Access, no confundir esa barrera adicional con la prueba del login propio en producción;
- catálogo: exactamente 510 productos y 16 categorías, salvo cambio comercial autorizado en el repositorio;
- `/enfoque`: 404 de aplicación;
- `/privacidad`: disponible;
- persistencia y sincronización del carrito entre pestañas;
- modificación manual del total en el navegador: sin efecto en el importe del servidor para Checkout Pro;
- repetición, recarga o segunda pestaña con el mismo carrito dentro de 30 minutos: misma UUID, pedido y preferencia con vigencia coincidente; vencida la ventana, la URL anterior no se devuelve;
- misma UUID con otro carrito: `409 IDEMPOTENCY_CONFLICT`;
- firma de webhook inválida: `401` y pedido sin aprobar;
- `live_mode`, cuenta notificadora o `metadata.order_id` ajenos: evento ignorado, sin mutar pedido, pago ni stock;
- retorno `?status=approved` sin webhook: pedido no aprobado;
- evento duplicado: una sola actualización lógica; varios IDs de pago exactos para un pedido conservan filas separadas y disparan conciliación operativa;
- analítica rechazada o sin decidir: cero POST a `/api/analytics/events`;
- retiro de consentimiento: borrado de sesión y eventos en D1, con HMAC revocado para bloquear solicitudes en vuelo;
- exportaciones CSV: sin fórmulas ejecutables;
- artefacto `dist`: sin secretos ni `.map`.
- inventario legacy: ausencia de `stockQuantity` conserva Checkout Pro sin control; stock 0 controlado queda no disponible;
- cantidades: cliente limita a `min(99, disponible)`; el servidor y los triggers rechazan carreras y sobre-reservas entre Checkout Pro y WhatsApp;
- Checkout Pro con stock: reserva antes de preferencia, replay de la misma UUID sin auto-bloqueo, vencimiento a 30 minutos, extensión por pago pendiente, aprobación exactamente una vez y reembolso sin reposición automática;
- conciliación administrativa: sesión y origen requeridos, búsqueda autoritativa, repetición idempotente y auditoría por solicitud;
- WhatsApp: datos completos obligatorios, creación anterior a la navegación externa, precio autoritativo, idempotencia, reserva de última unidad y operación multi-item todo-o-nada;
- administración: aprobar descuenta físico exactamente una vez; rechazar libera por derivación; estados cruzados y clicks repetidos no duplican efectos;
- imágenes: JPEG/PNG/WebP hasta 4 MiB, magic bytes, auth, ruta first-party y cleanup seguro;
- R2: `shekinah` y `shekinah-preview` aislados, `CATALOG_IMAGES` visible en el deployment y `publicR2DevEnabled=false`, sin confundir infraestructura con persistencia ya probada.

Validar por separado el retiro del fallback manual:

- no existe botón, enlace ni campo público para ingresar o copiar un importe;
- no existe una URL fija de Mercado Pago en el bundle público;
- Checkout Pro cerrado se presenta como no disponible, sin desviar al comprador a otro cobro;
- WhatsApp continúa habilitado al número `5492236216559` como canal de pedido, no como confirmación de pago;
- se crea exactamente una solicitud al endpoint de pedido WhatsApp y ninguna a `/api/checkout/preferences` al usar ese canal.

## 9. Activar Checkout Pro de forma escalonada

1. Mantener `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`; la analítica opt-in puede permanecer activa de forma independiente.
2. Confirmar Functions, binding, `0008` en preview y producción, reservas/consumo y autenticación administrativa; Access es opcional.
3. Conservar `ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENABLED=true`, retención 730 y secretos independientes; no mezclar eventos manuales con métricas financieras.
4. Rotar cualquier credencial expuesta, actualizar el secreto cifrado de Pages y dejar en Webhooks únicamente el tópico de pagos.
5. Habilitar `COMMERCE_ENABLED=true` y `VITE_COMMERCE_ENABLED=true` sólo después de una compra controlada con comprador distinto del vendedor, webhook procesado, stock consumido y aprobación del titular de Mercado Pago.
6. Supervisar webhooks, estados, importes y reservas durante la ventana inicial.
7. Confirmar que el fallback manual continúa retirado y que el bundle no contiene una URL fija de pago.

## Estados que deben informarse por separado

| Estado | Evidencia mínima |
| --- | --- |
| Código preparado | archivos y pruebas locales |
| Validación local | comandos ejecutados y resultados |
| CI aprobado | workflow exitoso sobre SHA exacto |
| Pages desplegado | deployment asociado al SHA |
| Canales públicos | Sin Link de Pago manual; Checkout Pro directo o cerrado y WhatsApp reservado |
| D1 vinculado | binding `DB` visible y consulta correcta |
| Migración aplicada | tabla de migraciones/consultas remotas |
| R2 habilitado | inventario autenticado de buckets sin error `10042` |
| Imágenes administrativas vinculadas | `CATALOG_IMAGES` separado en production/preview y deployment exacto |
| Mercado Pago Checkout Pro configurado | sandbox y webhook verificados |
| Login administrativo configurado | cookie segura, API 401/200, logout y rate limit |
| Access opcional | JWT permitido/denegado sin bloquear el login propio |
| Checkout Pro productivo | flags, credenciales productivas y compra controlada |

No declarar una fila como cumplida usando evidencia de otra.
