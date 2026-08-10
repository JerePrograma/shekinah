# Despliegue del comercio

## Regla de activación

La presencia del código no habilita Checkout Pro ni analítica. Mantener inicialmente:

```text
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
VITE_COMMERCE_ENABLED=false
VITE_ANALYTICS_ENABLED=false
```

No cambiar esos flags hasta completar el checklist de sandbox, webhooks, D1, privacidad y aprobación comercial. La autenticación administrativa es un control separado y no habilita Checkout Pro.

Existe un fallback manual separado y expresamente autorizado el 2026-08-10: Link de Pago de Mercado Pago sin monto predefinido más envío del carrito por WhatsApp. Ese fallback no equivale a `COMMERCE_ENABLED=true`, no usa D1 y no habilita el webhook.

El nombre remoto del proyecto Pages es `shekinah`; `shekinah-7dl.pages.dev` es su dominio. Existe además un Worker independiente llamado `shekinah`: no configurar bindings ni variables en ese Worker.

No se necesita VPS. El fallback manual es cliente puro y el Checkout Pro integrado usa Cloudflare Pages Functions como backend y D1 como persistencia.

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
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

`src/commerce/env.ts` contiene únicamente los dos defaults públicos de cliente necesarios para que el fallback manual funcione aunque Pages no tenga variables de build: WhatsApp y Link de Pago. Una variable `VITE_*` presente puede sobrescribir el default; una cadena vacía lo deshabilita. No colocar credenciales en esos valores.

`PUBLIC_SITE_URL` es configuración server-side y debe cargarse explícitamente antes de habilitar Checkout Pro. Debe conservar exactamente el origen HTTPS, sin path ni barra final adicional.

### Funcionamiento del fallback manual

- el Link de Pago autorizado está configurado sin monto predefinido;
- para un envío con total determinístico, el carrito intenta copiar el total y abre el enlace en otra pestaña;
- el comprador ingresa el monto en Mercado Pago;
- después envía el carrito por WhatsApp para que el comercio pueda asociar el pago y coordinar la entrega;
- si Correo Argentino requiere cotización manual, el Link de Pago queda bloqueado y se deriva a WhatsApp;
- este flujo no crea `orders`, no genera `external_reference`, no recibe webhook y no puede marcar el pedido como aprobado automáticamente.

No agregar parámetros no documentados al Link de Pago para intentar precargar el monto.

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

Antes de una migración remota sobre una base que ya contenga datos, conservar una exportación o bookmark verificable y documentar el punto de reversión. En una configuración con `database_id` y `preview_database_id`, aplicar primero preview y después producción:

```powershell
npx wrangler d1 time-travel info shekinah-commerce-preview --json
npx wrangler d1 migrations apply DB --remote --preview
npx wrangler d1 migrations list DB --remote --preview
npx wrangler d1 time-travel info shekinah-commerce --json
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations list DB --remote
```

No aplicar SQL manual distinto de las migraciones versionadas.

El flujo aplica en orden `0001` a `0005`. `migrations/0004_catalog_admin.sql` crea la persistencia del ABM; antes de ella, las lecturas públicas conservan los 510 productos base y toda escritura administrativa responde `CATALOG_MIGRATION_REQUIRED`. `migrations/0005_admin_auth.sql` crea el rate limiting persistente del login; sin ella, el login falla cerrado. Verificar `d1_migrations`, `sqlite_schema`, índices y conteos sin consultar PII.

## 4. Configurar variables no secretas del Checkout Pro

En producción y, de forma separada, en preview:

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
ALLOWED_SITE_ORIGINS=https://shekinah-7dl.pages.dev
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
ANALYTICS_RETENTION_DAYS=730
```

`PUBLIC_SITE_URL` construye las URLs de retorno y webhook. Si más adelante se autoriza un dominio propio, sustituirlo explícitamente y volver a validar todas las URLs.

Esos valores quedaron verificados en producción y preview el 2026-08-10. `MERCADO_PAGO_CHECKOUT_MODE` y los secretos del proveedor permanecen sin configurar porque Checkout Pro sigue deshabilitado. Si se habilita el fallback opcional de Access, agregar recién entonces `CLOUDFLARE_ACCESS_TEAM_DOMAIN` y `CLOUDFLARE_ACCESS_AUD` reales.

## 5. Configurar secretos

### Autenticación administrativa

Crear por entorno, sin reutilizar valores:

- `ADMIN_USERNAME`: cuenta server-side; no se incorpora al frontend;
- `ADMIN_PASSWORD_HASH`: `pbkdf2-sha256$iteraciones$salt-base64url$derivado-base64url`, generado con salt criptográfica aleatoria y PBKDF2-HMAC-SHA-256. El valor operativo usa 100.000 iteraciones: 300.000 y 600.000 excedieron el límite CPU efectivo del runtime Bundled, mientras que 100.000 completó una verificación remota negativa con credencial ficticia en 32 ms de CPU; no reducir el costo sin repetir benchmark y smoke productivo;
- `ADMIN_SESSION_SECRET`: al menos 32 bytes aleatorios codificados en base64url;
- `ADMIN_RATE_LIMIT_SECRET`: al menos 32 bytes aleatorios independientes, codificados en base64url.

La contraseña sólo se ingresa mediante prompt protegido en el proceso que genera el derivado. No se escribe en scripts versionados, argumentos, archivos temporales ni salida. Cargar los cuatro valores como `secret_text` en production y preview; `wrangler pages secret ... --env production|preview` selecciona el entorno aunque el flag no aparezca en algunas ayudas de la CLI. Comprobar después únicamente los nombres:

```powershell
npx wrangler pages secret list --project-name shekinah --env production
npx wrangler pages secret list --project-name shekinah --env preview
```

Para rotar contraseña: generar un hash nuevo con salt nueva y 100.000 iteraciones, actualizar `ADMIN_PASSWORD_HASH` en ambos entornos y desplegar para materializar el nuevo snapshot. Si se requiere cierre global de sesiones, rotar además `ADMIN_SESSION_SECRET`; no basta con cambiar el hash porque las cookies ya emitidas siguen firmadas hasta vencer.

### Comercio y analítica

Crear valores aleatorios independientes, de al menos 32 bytes, para `ORDER_TOKEN_SECRET` y `ANALYTICS_HMAC_SECRET`. No pegarlos en archivos, documentación, argumentos de línea de comandos ni logs.

Cargar cada valor mediante prompt cifrado de Wrangler o desde el panel de Pages:

```powershell
npx wrangler pages secret put MERCADO_PAGO_ACCESS_TOKEN --project-name shekinah
npx wrangler pages secret put MERCADO_PAGO_WEBHOOK_SECRET --project-name shekinah
npx wrangler pages secret put ORDER_TOKEN_SECRET --project-name shekinah
npx wrangler pages secret put ANALYTICS_HMAC_SECRET --project-name shekinah
npx wrangler pages secret list --project-name shekinah
```

La lista debe mostrar nombres, nunca valores.

Los cuatro secretos administrativos quedaron presentes y cifrados en ambos entornos el 2026-08-10; sus valores no se registran. Los secretos de Mercado Pago, pedidos y analítica continúan ausentes mientras esas capacidades permanezcan deshabilitadas.

## 6. Configurar Mercado Pago Checkout Pro

1. Usar primero credenciales de prueba y `MERCADO_PAGO_CHECKOUT_MODE=sandbox`.
2. Registrar la URL de notificación exacta: `https://shekinah-7dl.pages.dev/api/webhooks/mercadopago`, salvo que antes se autorice otro dominio primario.
3. Habilitar eventos de pagos.
4. Copiar el secreto de firma de Webhooks en `MERCADO_PAGO_WEBHOOK_SECRET`.
5. Confirmar que el proveedor envía `x-signature` y `x-request-id`.
6. Realizar pagos de prueba aprobados, pendientes y rechazados.
7. Verificar en D1 que el importe y la moneda coincidan y que un webhook duplicado no duplique pagos ni eventos.

La creación de preferencias no depende de un encabezado de idempotencia no documentado por Checkout Pro. D1 reclama un único intento por pedido. Si la respuesta del proveedor es incierta, las solicitudes siguientes recuperan por `external_reference` y permanecen cerradas si no pueden demostrar un resultado único.

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
- repetición, recarga o segunda pestaña con el mismo carrito dentro de 30 minutos: misma UUID, pedido y preferencia;
- misma UUID con otro carrito: `409 IDEMPOTENCY_CONFLICT`;
- firma de webhook inválida: `401` y pedido sin aprobar;
- retorno `?status=approved` sin webhook: pedido no aprobado;
- evento duplicado: una sola actualización lógica;
- analítica rechazada o sin decidir: cero POST a `/api/analytics/events`;
- retiro de consentimiento: borrado de sesión y eventos en D1, con HMAC revocado para bloquear solicitudes en vuelo;
- exportaciones CSV: sin fórmulas ejecutables;
- artefacto `dist`: sin secretos ni `.map`.

Validar por separado el fallback manual:

- botón/link visible sólo con total de envío definido;
- `href` exacto `https://link.mercadopago.com.ar/shekinahmoreno`;
- WhatsApp habilitado al número `5492236216559`;
- mensaje incluye carrito y total de referencia;
- no se crea ninguna solicitud `/api/checkout/preferences` al usar el fallback;
- la interfaz informa que la asociación y confirmación de pago son manuales.

## 9. Activar Checkout Pro de forma escalonada

1. Desplegar con ambos flags server-side en `false`.
2. Confirmar Functions, binding, migraciones y autenticación administrativa; Access es opcional.
3. Habilitar `ANALYTICS_ENABLED=true` sólo con política de retención y texto de privacidad aprobados.
4. Habilitar `COMMERCE_ENABLED=true` y `VITE_COMMERCE_ENABLED=true` sólo después de la compra controlada y aprobación del titular de Mercado Pago.
5. Supervisar webhooks, estados e importes durante la ventana inicial.
6. Resolver explícitamente la coexistencia o retiro del fallback manual.

## Estados que deben informarse por separado

| Estado | Evidencia mínima |
| --- | --- |
| Código preparado | archivos y pruebas locales |
| Validación local | comandos ejecutados y resultados |
| CI aprobado | workflow exitoso sobre SHA exacto |
| Pages desplegado | deployment asociado al SHA |
| Fallback manual público | Link de Pago y WhatsApp visibles y probados |
| D1 vinculado | binding `DB` visible y consulta correcta |
| Migración aplicada | tabla de migraciones/consultas remotas |
| Mercado Pago Checkout Pro configurado | sandbox y webhook verificados |
| Login administrativo configurado | cookie segura, API 401/200, logout y rate limit |
| Access opcional | JWT permitido/denegado sin bloquear el login propio |
| Checkout Pro productivo | flags, credenciales productivas y compra controlada |

No declarar una fila como cumplida usando evidencia de otra.
