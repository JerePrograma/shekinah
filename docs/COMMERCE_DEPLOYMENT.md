# Despliegue del comercio

## Regla de activación

La presencia del código no habilita Checkout Pro ni analítica. Mantener inicialmente:

```text
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
VITE_COMMERCE_ENABLED=false
VITE_ANALYTICS_ENABLED=false
```

No cambiar esos flags hasta completar el checklist de sandbox, webhooks, D1, Access, privacidad y aprobación comercial.

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

## 3. Crear y vincular D1 para Checkout Pro

El inventario autenticado del 2026-08-04 encontró cero bases D1. Se requieren dos bases separadas. El nombre de producción está documentado; el de preview debe obtenerse de una decisión explícita y no puede inventarse.

Crear primero preview, una vez autorizado su nombre exacto:

```powershell
npx wrangler d1 create NOMBRE_D1_PREVIEW_AUTORIZADO
```

Crear luego producción:

```powershell
npx wrangler d1 create shekinah-commerce
npx wrangler d1 info shekinah-commerce
```

Copiar `wrangler.example.jsonc` a `wrangler.jsonc` únicamente cuando se conozcan los valores reales. Reemplazar `database_id`, dominio primario, Team Domain y AUD; no dejar marcadores en una configuración activa.

El binding debe llamarse exactamente `DB`. Producción debe referir `shekinah-commerce`; preview debe usar exclusivamente la base no productiva autorizada. No vincular ambos entornos a la misma base.

Validar la migración local:

```powershell
npx wrangler d1 migrations apply shekinah-commerce --local
npx wrangler d1 execute shekinah-commerce --local --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
```

Antes de una migración remota sobre una base que ya contenga datos, conservar una exportación o backup verificable y documentar el punto de reversión. Aplicar luego:

```powershell
npx wrangler d1 migrations apply shekinah-commerce --remote
npx wrangler d1 execute shekinah-commerce --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
```

No aplicar SQL manual distinto de las migraciones versionadas.

El flujo debe aplicar también `migrations/0004_catalog_admin.sql`. Antes de esa migración, las lecturas públicas conservan los 510 productos base y cualquier alta, modificación o baja administrativa responde `CATALOG_MIGRATION_REQUIRED`.

## 4. Configurar variables no secretas del Checkout Pro

En producción y, de forma separada, en preview:

```text
PUBLIC_SITE_URL=https://shekinah-7dl.pages.dev
MERCADO_PAGO_CHECKOUT_MODE=sandbox
COMMERCE_ENABLED=false
ANALYTICS_ENABLED=false
ANALYTICS_RETENTION_DAYS=730
CLOUDFLARE_ACCESS_TEAM_DOMAIN=EQUIPO.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUD=AUD_REAL_DE_LA_APLICACION
```

`PUBLIC_SITE_URL` construye las URLs de retorno y webhook. Si más adelante se autoriza un dominio propio, sustituirlo explícitamente y volver a validar todas las URLs.

El inventario autenticado del 2026-08-04 encontró producción y preview sin variables. El código mantiene los flags server-side cerrados ante su ausencia, pero antes de pruebas externas deben cargarse explícitamente con valor `false`.

## 5. Configurar secretos

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

El inventario autenticado del 2026-08-04 no encontró secretos en producción ni en preview.

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

## 7. Configurar Cloudflare Access

Zero Trust no estaba configurado en el inventario autenticado del 2026-08-04. Definir primero un Team Domain autorizado; no inventarlo.

Crear políticas de Access para los dos recursos:

```text
https://shekinah-7dl.pages.dev/admin*
https://shekinah-7dl.pages.dev/api/admin/*
```

Ambos deben pertenecer a la misma aplicación o usar el mismo AUD esperado por Functions. Limitar la política a los administradores aprobados, habilitar MFA según la política del negocio y copiar el Team Domain y AUD reales a las variables.

La protección de borde no reemplaza la validación interna: `functions/admin.ts` y `functions/api/admin/_middleware.ts` vuelven a validar firma RS256, issuer, audiencia y expiración del JWT `Cf-Access-Jwt-Assertion`.

Pruebas obligatorias:

- sin sesión de Access: `/admin` y `/api/admin/summary` deben rechazarse;
- usuario no autorizado: rechazo en el borde;
- usuario autorizado: carga del resumen y creación de una fila en `admin_audit`;
- AUD incorrecto o token expirado: rechazo desde la Function.

En Pages > Settings > Runtime, cambiar producción y preview de `Fail open` a `Fail closed`. `public/_routes.json` incluye `/api/*`, `/admin` y `/admin/*`; no deben caer a activos estáticos si se agota la cuota de Pages Functions.

## 8. Validar preview

Con D1 de preview y sandbox:

- restringir los previews públicos mediante Cloudflare Access antes de introducir datos de prueba;
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
2. Confirmar Functions, binding, migración, secretos y Access.
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
| Access configurado | pruebas de acceso permitido y denegado |
| Checkout Pro productivo | flags, credenciales productivas y compra controlada |

No declarar una fila como cumplida usando evidencia de otra.
