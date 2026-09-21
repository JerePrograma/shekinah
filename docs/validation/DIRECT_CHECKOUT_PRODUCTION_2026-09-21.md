# Compra directa productiva — 2026-09-21

## Alcance y estado de esta evidencia

Se autorizó habilitar compra directa para retiro coordinado, consultar Dux en vivo,
crear una sola reserva automática y abrir Checkout Pro sin efectuar un pago real.
La configuración quedó desplegada. El primer intento de smoke falló al consultar
Dux antes de crear una orden o reserva; las secciones siguientes conservan ese
intento y documentan la recuperación posterior. El circuito completo sólo puede
declararse acreditado tras comprobar Checkout Pro y cerrar la prueba.

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

### Segundo hallazgo productivo: normalización de referencia

La corrección `d50cb0db3bb6eccfbf1a665c9e4a358349e70a4a` se publicó en `main`.
Pages `d590a97d-e5b4-4ce7-a6f0-21416dc88d6a` terminó `success`; la API confirmó
ese SHA asociado canónicamente a `shekinah.ar` a las 05:03:12 UTC. La lectura
autenticada posterior confirmó `directCheckout.ready=true`, sin blockers.
CI `35562947391`, job `106219139820`, terminó `success` y publicó el artefacto
`shekinah-dist-d50cb0db3bb6eccfbf1a665c9e4a358349e70a4a` (`10622777999`).

Al recuperar la misma solicitud desde el carrito, la consulta viva avanzó y
Shekinah la aceptó automáticamente con actor `system:direct_checkout`. Creó una
sola orden interna `ord_wNdSN3hQXcKHU4SPz1DsRUks` y un único intento Dux, registrado
a las 05:04:10.946 UTC. No hubo aceptación administrativa ni pedido manual.

La UI de Dux acreditó el pedido **00000001**, una unidad de `799000001`, importe
ARS 3.500, sin facturar ni remitir. El GET oficial `/v2/pedidos` devolvió HTTP 200,
id `3417590`, número `1`, moneda `1`, total `3500`, no anulado, y referencia
`SHEKINAH:WEB:REQ_KLYBZQNNZCZBF1NAUWVXDJJN`. Dux había convertido la referencia
ASCII completa a mayúsculas; la comparación literal impedía recuperar el pedido.
Se mantuvo la operación incierta y no se volvió a enviar el POST.

La lectura de stock posterior tuvo primero un HTTP 400 `ERROR_VALIDACION`,
conservando evidencia de la intermitencia del proveedor; una nueva lectura
HTTP 200 acreditó stock real **14**, reservado **1** y disponible **13**.
Se conserva así el stock real mientras la reserva ocupa una unidad.

La corrección acotada reconoce la referencia exacta o su forma ASCII en mayúsculas,
sin recortar, aceptar prefijos ni omitir cotejos comerciales. La evidencia final
conserva la identidad interna original y además la referencia literal del
proveedor en `providerReference`. No cambia migraciones ni guards financieros.
La prueba inicial reprodujo cuatro fallas antes del arreglo. Una iteración
intermedia detectó además el cotejo exacto del guard D1; se conservó ese guard y
se ajustó la representación normalizada con auditoría del valor original.
Las dos suites dirigidas finales aprobaron **56/56**, incluyendo recuperación,
reserva física, ambigüedad tras normalización y ausencia de segundo POST.

La primera invocación de pruebas filtradas mediante `npx.cmd` falló por la
interpretación de `|` por CMD; se ejecutó después directamente el binario Node
del repositorio. Ese intento no se cuenta como prueba ejecutada con éxito.
El primer `verify` de este segundo arreglo detectó seis errores de lint en las
pruebas nuevas (tipado de un resultado mock y continuación de línea). Se corrigió
el test usando el retorno tipado del mock y una invocación sin ambigüedad; no se
desactivaron reglas. La validación final se registra por separado.

Con el POST de reserva ya realizado y la recuperación pausada en el navegador,
se inició una nueva reconciliación controlada desde el botón existente del
backoffice, en el despliegue corregido. Es una revalidación posterior al intento
fallido conservado, no un cambio del umbral ni una secuencia de reintentos ciegos.
Esa reconciliación `dux_sync_fd98f23c-3bc1-4841-aa4d-febfcfb3f87d` terminó
`succeeded`: 862 procesados y cero fallas, desde 05:10:14.944 hasta
05:12:17.220 UTC. Readiness autenticado confirmó `snapshotFresh=true` y
`assistedCheckout.blockers=[]`. La única revisión Dux corresponde al smoke en
recuperación; no hubo incidencias financieras.

El endpoint productivo `POST /api/webhooks/mercadopago` rechazó un cuerpo vacío
`{}` sin firma con HTTP **401**, `WEBHOOK_SIGNATURE_MISSING`. No se envió un
identificador de pago ni se simuló aprobación. El primer intento mediante
PowerShell había fallado localmente por TLS `PartialChain`, sin respuesta HTTP;
la verificación acreditada se realizó después desde el navegador con TLS válido.

### Pendientes posteriores al segundo hallazgo

La validación final del arreglo de referencia terminó con exit 0 en
`npm run verify` (**788 tests aprobados, 14 omitidos, 29 E2E aprobados**) y en
`npm run build:pages` (**788 tests aprobados, 14 omitidos**, compilación y todos
los verificadores aprobados). `git diff --check` aprobó. La modificación local
preexistente conserva su SHA-256 y se excluye nuevamente del commit.

1. Precisar y resolver el rechazo de Dux; recuperar la misma solicitud sin
   duplicar el intento, acreditar reserva y total, abrir Checkout Pro sin pagar y
   cerrar la prueba por los mecanismos oficiales.
2. Conseguir snapshot fresco. La última reconciliación programada exitosa revisada
   fue `35551241324`; las ejecuciones observadas tienen separaciones de horas,
   incompatibles con el objetivo de cinco minutos. El umbral se mantiene en 900 s.
3. Correo conserva cotización previa; falta peso logístico estructurado y cobertura
   acreditada para automatizar los tramos comerciales. No bloquea el retiro.

Esta evidencia no declara terminada la activación comercial ni el smoke.

## Compra directa acreditada hasta Checkout Pro; limpieza en curso

La corrección de referencia se publicó en
`e788cba2904eed444afaf7763b2b5a96fdc14838`. Pages
`b636b48a-dbec-4cd6-a9f0-4f71ac5d4b3d` terminó `success` y se acreditó como
canónico de `shekinah.ar` a las 05:25:42 UTC. CI `35564370571`, job
`106223172047`, terminó `success`; artefacto
`shekinah-dist-e788cba2904eed444afaf7763b2b5a96fdc14838` (`10623820893`).
La API Pages confirmó además los ocho valores del deployment, incluido el umbral
900; no sólo los valores guardados en el proyecto.

Al abrir el enlace protegido del comprador, el servidor recuperó el pedido Dux
existente, volvió a consultar el stock y confirmó la reserva a las
**05:26:17.685 UTC**. El carrito mostró total definitivo **ARS 3.500** y
**Pagar con Mercado Pago**. No se aceptó, preparó ni retomó desde administración.

El clic del comprador creó la preferencia a las **05:26:37.034 UTC**, después
de la reserva confirmada. Checkout Pro abrió en el dominio productivo Mercado
Pago, mostrando **Shekinah**, **ADOBO PIZZA GOURMET 100GR**, importe y total
**$ 3.500**. La moneda ARS quedó persistida por el servidor. La referencia externa
del retorno generado por Mercado Pago coincide con la orden interna. Se acreditó
el vendedor visible; no se realizó una consulta autenticada independiente de
`collector_id`. No se pulsó el botón final Pagar ni se efectuó un cobro.

La preferencia única es `445638367-33977e51-a400-4956-896a-8f365dea388f`.
El retorno oficial **Volver a la tienda** llevó a Shekinah y mostró **Pago no
confirmado**, sin considerar la redirección una prueba financiera. El carrito
conservó la unidad de prueba y el vínculo opcional de WhatsApp con la referencia
pública; no se envió ningún mensaje.

Después del retorno se repitieron dos POST de preparación y dos POST de checkout
con la misma identidad: todos devolvieron HTTP 200, total `350000` y la misma URL
de Checkout Pro. La recarga conservó la solicitud. D1 acreditó a las 05:28:25 UTC
**una orden, una operación reserve, la misma preferencia, el mismo timestamp de
intento financiero y cero pagos**. La pérdida de respuesta forzada sigue cubierta
por pruebas locales; en producción se acreditó recuperación del resultado
incierto causado por la normalización Dux, sin segundo POST del proveedor.

Readiness posterior: direct listo, `blockers=[]`, preparación 0, revisión 0,
incidencias financieras 0, atención de vínculos 0 y operaciones Dux 0. El snapshot
de 05:12 volvió a quedar stale al superar 900 segundos: el schedule sigue sin
cumplir cinco minutos. La compra directa se completó mediante lecturas vivas.

La limpieza no puede ejecutarse antes de **05:56:37.034 UTC** por los guards
financieros existentes. Debe conciliar Mercado Pago, anular el pedido mediante
la UI oficial Dux, verificar stock real 14/reservado 0/disponible 14 y registrar
la liberación soportada en Shekinah. Este apartado todavía no acredita esa
limpieza; el registro posterior debe hacerlo antes de declarar cerrado el smoke.

La consulta autoritativa `POST /api/admin/orders/<orden>/reconcile` devolvió
HTTP 200 a las **05:34:02.206 UTC**, `checkedPayments=0`. Esto acredita ausencia
de pagos en la consulta del proveedor; no depende del retorno del navegador.
La limpieza requiere una nueva consulta inmediata al cierre después de vencer
la ventana, como exige el circuito soportado.

## Liberación física acreditada; conexión HTTPS interrumpida

Después de vencer la preferencia, la consulta autoritativa Mercado Pago devolvió
HTTP 200, `checkedPayments=0`, a las **05:56:47.847 UTC**. Se eligió **Anular**
en el pedido Dux **00000001**, cuya referencia completa y total ARS 3.500 se
revisaron antes de actuar. Se confirmó el diálogo oficial. Dux informó
**Comprobante anulado con éxito** y el listado de pedidos vigentes quedó vacío.
No se facturó, remitió ni modificó stock manualmente.

El GET oficial de producto devolvió HTTP 200 a las **05:58:19.621 UTC** y
acreditó código `799000001`, depósito operativo, stock real **14**, reservado
**0** y disponible **14**. La reserva física de prueba quedó liberada. La lectura
anterior había devuelto 200, pero el filtro del diagnóstico usó un nombre de
contenedor incorrecto y no imprimió cantidades; no se contó como evidencia de
stock. La segunda lectura usó el campo `datos` del contrato vigente.

La confirmación administrativa soportada de liberación no obtuvo respuesta HTTP.
Una lectura D1 de sólo lectura a las **05:58:47.348 UTC** acreditó estado local
`confirmed`, `released_at=null`, cero operaciones release. El reintento
idempotente tampoco conectó. La inspección de red de una lectura del mismo
endpoint confirmó **net::ERR_CERT_AUTHORITY_INVALID**; abrir una pestaña Chrome
nueva en el dominio reprodujo el rechazo. No se omitió validación TLS ni se
escribieron estados directamente en D1. Se solicitó recuperar una conexión HTTPS
válida para completar el cierre; no repetir la anulación Dux ya acreditada.

Readiness previo al problema de conexión, **05:52:12.968 UTC**: direct listo,
`blockers=[]`, preparación 0, revisión 0, incidencias financieras 0, atención de
vínculos 0 y operaciones 0; snapshot stale. El refresh posterior a la liberación
y el cierre lógico en Shekinah aún no están acreditados en este apartado.

La UI de Dux además mostró un aviso de facturas del servicio pendientes y posible
suspensión. Se registra como aviso operativo del proveedor, sin atribuirle la
intermitencia HTTP 400 ni efectuar pagos del servicio.

## Cierre completo del smoke y lectura final

El commit documental `1bc575f3fb922c4db5d0af8442c560de195c5d0e` se publicó en
main. CI `35566750281`, job `106230005084`, terminó `success`; artefacto
`shekinah-dist-1bc575f3fb922c4db5d0af8442c560de195c5d0e` (`10624408376`). Pages
`3be5cdb4-9a5c-46be-9fc8-6c34d4e0f42a` quedó `success` y canónico a las
06:05:20 UTC, con los mismos flags efectivos. No cambió el código funcional
validado por el smoke.

Mientras la conexión local fallaba se inició **una** ejecución manual del
workflow existente sobre main, `35566776925` (#181). La corrida
`dux_sync_d612bd30-ae55-4bc5-8c9f-b0f7199e8fbd` terminó `succeeded` con
**862 procesados y 0 fallas**, desde 06:02:58.127 hasta **06:04:58.827 UTC**.
La lectura remota D1 acreditó el resultado. Esta ejecución controlada posterior
a la liberación no acredita la cadencia del schedule ni modifica el umbral 900.

Tras la nueva publicación, la petición normal al dominio canónico volvió a
responder con HTTPS válido. No se instaló un certificado, desactivó TLS ni omitió
una advertencia. El motivo de esa recuperación de conexión no quedó determinado;
la coincidencia temporal con el despliegue no demuestra causalidad. Se retiró
la necesidad de intervención humana informando al titular.

El endpoint soportado `POST /api/admin/orders/<orden>/dux-lifecycle` devolvió
HTTP **200**, `action=release`, `changed=true`, `completed=true`,
`reservationStatus=released`, `paymentStatus=none`. Ejecutó la conciliación
financiera exigida antes de persistir. D1 de sólo lectura acreditó a las
**06:06:34.543 UTC**: `released_at=2026-09-21T06:05:46.018Z`, **una reserva,
una liberación y cero pagos**. No se efectuaron escrituras D1 manuales.

La consulta del comprador devolvió HTTP 200, `reservationStatus=released`,
`paymentRequiresReview=false`, `checkoutAvailable=false`. La recarga mostró
**La reserva de este pedido fue liberada**, sin botón de pago, conservando la
referencia e historial. Se eliminó únicamente el Adobo Pizza usado en la prueba;
el carrito quedó con cero productos. WhatsApp siguió siendo opcional y no se
envió ningún mensaje.

Readiness autenticado final, **06:06:46.334 UTC**:

- direct: `schemaReady=true`, `serverEnabled=true`, `identitiesConfigured=true`,
  `ready=true`, `blockers=[]`;
- assisted: `blockers=[]`;
- `snapshotFresh=true`, 862 productos, sincronización 06:04:58.827 UTC;
- `preparingCount=0`, `reviewCount=0`, `paymentIncidentCount=0`,
  `linkAttentionCount=0`, `operationAttentionCount=0`.

El recorrido normal hasta Checkout Pro y la limpieza están acreditados. No se
probó un cobro ni un webhook productivo de pago aprobado; su comportamiento
está cubierto por las pruebas locales, el rechazo productivo de firma ausente
y la consulta autoritativa real de cero pagos. Quedan como incidencias la cadencia
del scheduler, los HTTP 400 intermitentes Dux y el aviso de facturación del
servicio. Correo mantiene cotización previa por falta de pesos/cobertura
logísticos acreditados. No queda ninguna acción humana pendiente para este smoke.
