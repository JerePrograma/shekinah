# Compra directa productiva — 2026-09-21

## Alcance y estado de esta evidencia

Se autorizó habilitar compra directa para retiro coordinado, consultar Dux en vivo,
crear una sola reserva automática y abrir Checkout Pro sin efectuar un pago real.
La configuración quedó desplegada, pero el smoke todavía no acredita el circuito
completo: la consulta real a Dux falló antes de crear una orden o reserva.

## Base y preservación

- Checkout: `C:\laburo\shekinah-release-20260910-155842`, rama `main`.
- SHA inicial y remoto comprobado después de fetch/pull fast-forward:
  `64a3f8822e5a75cacf2762dd0d5d3a26aa74a5d6`.
- Se preservó la modificación local preexistente de
  `COMMERCE_D1_ROLLOUT_2026-09-13.md`, sin restaurarla, stashearla ni prepararla.
  Su SHA-256 comprobado es
  `D124416017F13CA8A190B2310375B7F67F96F47B993F8D210068981B84F48D94`.
- No se reaplicaron migraciones ni se modificaron tablas para fabricar estados.

## Causa de los flags inefectivos y despliegue

El deployment anterior `bc057565-7123-4ee1-8d0b-950d3e227996` conservaba
`COMMERCE_ENABLED=false` y no tenía `DIRECT_CHECKOUT_ENABLED` en su configuración
de build. Una lectura nueva del proyecto ya mostraba ambos flags guardados como
texto `true`; el deployment anterior no incorporaba esos cambios.

Se reintentó una sola publicación de Production del mismo SHA, sin modificar
variables ajenas. El deployment
`9acb8254-274f-4c71-b6eb-e0d7d72e4705` terminó `success` y quedó asociado a
`shekinah.ar`. La relectura de la API Pages a las 03:58:34 UTC confirmó su identidad
canónica y el SHA exacto. Los build settings del nuevo deployment incluyen ambos
flags. La respuesta autenticada del dominio canónico los confirmó efectivos.

| Variable Production | Valor |
| --- | --- |
| `WEB_ORDERS_ENABLED` | `true` |
| `VITE_WEB_ORDERS_ENABLED` | `true` |
| `ASSISTED_CHECKOUT_ENABLED` | `true` |
| `DIRECT_CHECKOUT_ENABLED` | `true` |
| `COMMERCE_ENABLED` | `true` |
| `VITE_COMMERCE_ENABLED` | `false` |
| `DUX_API_ENABLED` | `true` |
| `DUX_SNAPSHOT_MAX_AGE_SECONDS` | `900`, sin cambios |

Mercado Pago conserva modo `production`; se acreditó presencia cifrada de sus
secretos y del secreto de acceso al pedido, sin publicar sus valores. El checkout
legacy permanece retirado.

## Readiness y D1

`GET /api/admin/commerce-readiness`, 03:59:16.173 UTC, devolvió:

- `directCheckout`: esquema, servidor e identidades listos; `ready=true`,
  `blockers=[]`, preparación 0 y revisión 0 antes del smoke.
- `assistedCheckout.blockers=[DUX_CATALOG_SNAPSHOT_STALE]`.
- Incidencias financieras, vínculos y operaciones que requieren atención: 0.
- Snapshot de 862 productos, publicado a las 01:34:45.905 UTC, obsoleto.

Las comprobaciones de sólo lectura de ambas D1 aprobaron 24 migraciones
continuas, 35 objetos críticos, 21 columnas críticas y cero incidencias de claves
foráneas. La última migración sigue siendo `0024_direct_dux_checkout.sql`, aplicada
el 15 de septiembre. Los recibos están en el directorio local ignorado del rollout.

## Reconciliación y smoke: intento fallido conservado

Una reconciliación manual controlada, iniciada a las 03:58:56.084 UTC y terminada a
las 03:59:56.948 UTC, falló con `DUX_PROVIDER_REJECTED`: cero productos procesados y
una falla. Conservó el snapshot anterior. No se amplió su vigencia.

Se recorrió catálogo, agregado al carrito, datos sintéticos y retiro coordinado
para una unidad de **ADOBO PIZZA GOURMET 100GR**, código Dux `799000001`.
El valor mostrado por el catálogo fue ARS 3.500 y el retiro ARS 0; no se consideran
un total definitivo porque la consulta viva no terminó correctamente.

La solicitud `req_klYbZQNnzcZBF1NAUWvxdJjN` quedó persistida con referencia pública
`WEB-klYbZQNnzcZBF1NAUWvxdJjN`. No se aceptó desde administración ni se creó un
pedido manual en Dux. El servidor devolvió `DUX_ORDER_QUERY_UNAVAILABLE` al leer
el producto. La recuperación se hizo sobre la misma solicitud.

A las 04:19:25.467 UTC, D1 confirmó para esa identidad: `submitted`,
`direct_checkout_state=preparing`, el mismo error, cero órdenes asociadas y cero
operaciones Dux globales. La prueba todavía necesita recuperación o cierre por un
flujo soportado. No se escribió D1 directamente para resolverla.

No se creó preferencia ni se abrió Checkout Pro, porque todavía no existe reserva
confirmada. No hubo cobro. No se acreditó variación de stock. El enlace opcional
de WhatsApp incluye la referencia de la solicitud y no reemplaza el pago; no se
envió ningún mensaje.

El operador renovó la sesión web de Dux. Su interfaz acredita token activo y
acceso total a recursos de lectura y escritura. No se renovó, eliminó ni amplió
el token. Esto no acredita por sí solo que la API acepte la consulta productiva.
Las demoras y desconexiones posteriores del control del navegador impidieron
completar la inspección; se solicitó recargar únicamente la pestaña de Dux.

## Validación local acreditada

Con Node.js 24.18.0 y npm 11.16.0:

- `npm ci`: exit 0.
- `npm run install:browsers`: exit 0.
- `npm run verify`: exit 0; 120 archivos, 771 tests aprobados y 14 omitidos;
  29 E2E aprobados. Incluye compra directa, solicitudes web, API Dux, Mercado Pago,
  webhook, readiness y carrito. Son pruebas locales con proveedores simulados.
- Parser PowerShell del migrador: cero errores; self-test JSON/nativo aprobado.
- `tests/finalize-dux-catalog.tests.ps1`: 27/27 mocks aprobados.
- `npm run build:pages`: exit 0 sobre la base, con 120 archivos, 771 tests aprobados
  y 14 omitidos; verificadores y compilación aprobados.

CI del SHA base: ejecución `35002660464`, job `104494605134`, `success`.
Artefacto: `shekinah-dist-64a3f8822e5a75cacf2762dd0d5d3a26aa74a5d6`.
No se confunde este resultado con un smoke productivo exitoso.

## Continuación del diagnóstico y corrección de cierre

El control del navegador se recuperó sin renovar credenciales. La lectura
autenticada de readiness a las 04:26:05.697 UTC conservó `ready=true`, `blockers=[]`,
preparación 1, revisión 0 e incidencias financieras/Dux 0. El snapshot seguía
obsoleto.

Se consultó el endpoint oficial `GET /v2/items` con el token ya activo y los
parámetros documentados `cod_item`, `id_deposito`, `offset=0` y `limit=50`. Hubo
una respuesta HTTP 200, luego HTTP 400 `ERROR_VALIDACION`, mensaje
`Formato desconocido.` (solicitud del proveedor `req_234a541a6d1f`), y otra
respuesta 200 a las 04:28:56.940 UTC (`req_d42f9b88f606`). Esta última acreditó
para `799000001`: precio 3.500, IVA 0, stock real 14, reservado 0 y disponible 14.
No se modificó stock ni se llamó al POST de pedidos desde ese diagnóstico.
Contrato: [listar items de Dux v2](https://developers.duxsoftware.com.ar/reference/listar_items).

La recuperación por enlace protegido y los reintentos del comprador mantuvieron
la misma solicitud y el error `DUX_ORDER_QUERY_UNAVAILABLE`. No se considera la
respuesta 200 aislada prueba de estabilidad ni prueba de reserva.

Se comprobó por código un defecto independiente: el rechazo administrativo sólo
cerraba `web_request_status` y dejaba la preparación directa abierta. La corrección
acotada cierra ambos estados en una sentencia condicionada a ausencia de orden y
lease vencido, invalida el claim para impedir escrituras tardías y conserva el
error/progreso. Mantiene el comportamiento de esquemas anteriores a 0024, sin
editar migraciones. Las reservas existentes conservan su circuito financiero y Dux.

El cliente Dux de compra directa incorpora diagnóstico sanitizado de estado HTTP
y fallas anteriores a los encabezados. No cambia contratos, tokens, retries,
límites ni decisiones de éxito. Las pruebas dirigidas iniciales aprobaron 67/67;
tras agregar el caso de transporte sin encabezados, `npm run verify` terminó con
exit 0: 120 archivos, 780 tests aprobados, 14 omitidos y 29 E2E aprobados. Incluye
los casos dirigidos de compra directa, solicitudes, Dux, Mercado Pago, webhook,
readiness y carrito. Se comprobó además la consulta de detección de esquema en
D1 Production mediante un SELECT de sólo lectura a las 04:38:04.425 UTC.

### Causa reproducida en el cliente directo de Cloudflare

La inspección posterior encontró `this.fetchImplementation = options.fetch ?? fetch`
en `DuxOrderApiClient`. Invocar ese `fetch` como método de la instancia cambia su
receptor. Cloudflare rechaza esa llamada antes del I/O con `Illegal invocation`;
el cliente convertía la excepción en `DUX_ORDER_QUERY_UNAVAILABLE`. El lector de
inventario ya empleaba un wrapper compatible, por lo que su HTTP 400 intermitente
no prueba la causa del fallo de compra directa.

Se reprodujo el mecanismo con Wrangler 4.131.0 y workerd local, sin credenciales,
bindings remotos ni llamadas a Dux, mediante un recurso `data:`: el receptor de
clase lanzó `Illegal invocation` y el wrapper devolvió HTTP 200. El primer arranque
del diagnóstico se detuvo porque ese binario admite fechas hasta 2026-09-17;
el segundo utilizó esa fecha únicamente en su configuración local ignorada.
No se cambió la fecha ni configuración del proyecto productivo.

La nueva prueba de regresión falló antes de la corrección con el mismo error
público de compra directa. Después de introducir un wrapper que conserva la
invocación nativa, las tres suites dirigidas aprobaron 62/62. Se conservan
inyección del cliente simulado, contrato HTTP, guards y ausencia de retry POST.
Referencias: [errores de invocación de Cloudflare](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors)
y [reproducción en workerd](https://github.com/cloudflare/workerd/issues/6904).

El build de Pages de la versión intermedia se interrumpió deliberadamente para
incorporar esta corrección; no se cuenta como aprobado. La suite completa y el
build final se deben acreditar sobre el cambio completo antes del push.

El primer `verify` de la corrección completa se detuvo en lint por cuatro errores
de los bundles temporales que Wrangler generó para la reproducción local, fuera
del código publicable. Se detuvo ese servidor y se conservaron sus bundles en un
directorio temporal externo al checkout. No se modificaron reglas ESLint ni
exclusiones para ocultar errores. La eliminación inicialmente propuesta fue
rechazada por revisión automática; se usó el traslado conservador, sin borrar
evidencia. La siguiente validación parte del checkout sin esos bundles generados.

`npm run verify` de la corrección completa terminó con exit 0: 120 archivos,
781 tests aprobados, 14 omitidos y 29 E2E aprobados. Se mantienen sin cambios las
dependencias, los workflows y las migraciones.

`npm run build:pages` de la misma corrección terminó con exit 0, incluyendo
781 tests aprobados, 14 omitidos, compilación y verificadores de activos,
seguridad y automatización. `git diff --check` aprobó antes de preparar las rutas
explícitas del cambio. La modificación local preexistente mantiene su SHA-256.

## Pendientes al registrar este intento

1. Precisar y resolver el rechazo de Dux; recuperar la misma solicitud sin
   duplicar el intento, acreditar reserva y total, abrir Checkout Pro sin pagar y
   cerrar la prueba por los mecanismos oficiales.
2. Conseguir snapshot fresco. La última reconciliación programada exitosa revisada
   fue `35551241324`; las ejecuciones observadas tienen separaciones de horas,
   incompatibles con el objetivo de cinco minutos. El umbral se mantiene en 900 s.
3. Correo conserva cotización previa; falta peso logístico estructurado y cobertura
   acreditada para automatizar los tramos comerciales. No bloquea el retiro.

Esta evidencia no declara terminada la activación comercial ni el smoke.
