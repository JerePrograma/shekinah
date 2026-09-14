# Activación comercial — 2026-09-14

## Alcance y estado de esta ejecución

Continuación exclusiva en `C:\laburo\shekinah-release-20260910-155842`, sobre `main`. El checkout original `C:\laburo\shekinah` no se consultó ni modificó. El archivo local `COMMERCE_D1_ROLLOUT_2026-09-13.md` contiene una edición ajena que el usuario pidió conservar exactamente; no forma parte de los commits de esta ejecución.

La base encontrada fue `b4c6f34f7bf4204609aef2a7b3f9b68314f905b9`. El cambio de diagnóstico publicado es `bffec969d27c4bd03450b3617c8f5681b85321ab`. La activación WEB → ASSISTED → COMMERCE todavía no está acreditada por este registro. Los avances de inventario que siguen no prueban por sí solos un circuito de venta activo.

## D1 ya cerrada y nuevamente verificada

Preview y Production conservan exactamente 0001–0023 en orden contiguo, sin pendientes ni migraciones posteriores. Wrangler 4.131.0 devolvió `No migrations to apply` en ambas. Se verificaron los 14 objetos y 15 columnas críticas del migrador, cero incidencias de `PRAGMA foreign_key_check`, ausencia de la tabla transitoria de 0021 y conservación de los hashes de siete tablas históricas. No se reaplicaron migraciones ni se realizó restore.

El 13 de septiembre ambas bases habían comenzado en estado A, con 0001–0019 aplicadas y las cuatro objetivo pendientes. El reintento en Preview identificó `7500 incomplete input: SQLITE_ERROR` en 0020 mediante `/query`, sin fila de 0020 ni cambios en los datos comprobados. La corrección forward usó el import oficial de Wrangler (`d1 execute --file`), con los bytes SQL originales y el registro exacto de cada migración; se completó Preview antes de Production. El log más antiguo por sí solo no permitía identificar cuál subconsulta interna había fallado.

La causa del diagnóstico PowerShell truncado ya estaba corregida: `ErrorActionPreference=Stop`, stderr nativo y `2>&1` producían un `ErrorRecord` de PowerShell 5.1 antes de evaluar limpiamente `LASTEXITCODE`. `Invoke-Native` conserva la relajación acotada, captura de ambas salidas, exit code inmediato y restauración de la preferencia; no se reemplazó por otro mecanismo.

Las fechas originales de aplicación, la incidencia Cloudflare 7500 y los bookmarks están en [el registro de D1](COMMERCE_D1_ROLLOUT_2026-09-13.md). Los recibos nuevos y las copias de comprobación están bajo `.wrangler/commerce-d1-rollout/20260914-commerce-activation`, ignorados por Git. Se preservaron los bookmarks originales, incluido `20260913-172748Z/preview-before.json`.

El historial remoto registra estas aplicaciones del 2026-09-13, en UTC:

| Migración | Preview | Production |
| --- | --- | --- |
| 0020 | 19:48:54 | 19:52:23 |
| 0021 | 19:49:12 | 19:53:10 |
| 0022 | 19:49:50 | 19:53:38 |
| 0023 | 19:50:33 | 19:54:15 |

Los 14 objetos comprobados en cada base son `idx_web_request_id`, `idx_web_request_token`, `web_request_initial_guard`, `web_request_snapshot_immutable`, `web_request_resolution_guard`, `web_request_preserve_history`, `idx_orders_web_request_id`, `web_request_checkout_order_insert_guard`, `web_request_checkout_source_immutable`, `assisted_order_items_require_dux_catalog_snapshot`, `dux_order_link_assisted_guard`, `idx_dux_assisted_order_number_unique`, `dux_assisted_release_financial_guard` y `dux_assisted_finalize_financial_guard`.

Las 15 columnas comprobadas son: en `checkout_intents`, `intent_kind`, `web_request_id`, `web_request_token_hash`, `web_request_owner_hash`, `web_request_fingerprint`, `web_request_json`, `web_request_status`, `web_request_updated_at`, `web_request_resolved_at` y `web_request_resolved_by`; en `orders`, `web_request_id` y `assisted_checkout_fingerprint`; en `dux_order_links`, `verification_method`, `verification_actor` y `verification_note`.

Además del bookmark original, permanecen `20260913-194042Z/preview-before.json`, `20260913-resume-readonly/preview-before-import.json` y `20260913-resume-readonly/production-before-import.json`, todos bajo `.wrangler/commerce-d1-rollout`. Sus valores privados no se publican.

Al comenzar esta continuación, una consulta Wrangler mostró 7403 después de refrescar OAuth. Las lecturas posteriores de cuenta, historial y listado funcionaron sin modificar bases ni bindings. No se pudo demostrar la causa de esa respuesta transitoria. Dos invocaciones locales con forwarding incorrecto de argumentos no ejecutaron el listado previsto y no se cuentan como verificaciones; las invocaciones posteriores de `npx.cmd` sí lo acreditaron. Una consulta de diagnóstico usó inicialmente una columna inexistente y se corrigió tras revisar el esquema, sin escribir datos.

## Incidencias Dux y cambio acotado

Dos sincronizaciones administrativas reales fallaron con `DUX_PROVIDER_REJECTED`: 11:36:07.708–11:36:28.576 UTC y 11:41:06.255–11:42:17.115 UTC. Ambas procesaron cero productos, conservaron la publicación anterior y dejaron su generación fallida. La captura de Functions acreditó la segunda petición, pero el código desplegado no registraba el status HTTP para esta clase de rechazo. No se atribuye el incidente a un status concreto, a autenticación, a TLS ni a un endpoint interno sin evidencia.

El commit `bffec969d27c4bd03450b3617c8f5681b85321ab` amplía exclusivamente el diagnóstico terminal sanitizado de `server/dux-api.ts`: agrega `provider_rejected` junto con endpoint, status HTTP y fase. No altera contratos, credenciales, retries, timeout, redirecciones ni decisiones de éxito/fallo. `server/dux-api.test.ts` cubre 400, 404 y 422, un único intento y ausencia de token, cuerpo, headers o query en el diagnóstico.

Una nueva sincronización manual, después de CI y Pages verdes, finalizó correctamente entre 12:00:48.849 y 12:02:22.551 UTC: 754 productos, cero errores, cero ambigüedades y publicación completa. El delta fue de 238 productos. La coincidencia temporal con el cambio de diagnóstico no demuestra que éste resolviera los rechazos del proveedor.

## Validación del código publicado

Verificado con Node.js 24.18.0 y npm 11.16.0:

- `npm ci` e instalación de navegadores: aprobados.
- `npm run verify`: lint, TypeScript, 114 archivos de tests, 683 tests aprobados y 14 omitidos; verificadores de catálogo, catálogo comercial, pesos, build, assets, seguridad y automatización aprobados; 27 E2E aprobados.
- `npm run build:pages`: aprobado, incluidos 114 archivos y 683 tests aprobados, 14 omitidos.
- Prueba dirigida del cliente Dux: 47/47 aprobadas; mocks Dux: 27/27 aprobados.
- Self-test del migrador en Windows PowerShell 5.1: aprobado; parser PowerShell: cero errores.
- Diff revisado, rutas preparadas explícitamente y checks Git aprobados. `package-lock.json` no cambió.

La validación final de la documentación detectó inicialmente dos variables sin uso en archivos temporales de captura bajo `.wrangler`; no eran archivos del producto ni candidatos al commit. Se corrigieron esos helpers locales, se conservó el log fallido y su lint dirigido aprobó antes de repetir la validación completa. Esa repetición terminó aprobada: `npm run verify` confirmó 114 archivos, 683 tests aprobados, 14 omitidos y 27 E2E aprobados; `npm run build:pages` también terminó con exit code 0 y los mismos conteos unitarios. No se modificó ESLint ni se deshabilitó ningún control para ocultarlos.

[Verify 34840771217](https://github.com/JerePrograma/shekinah/actions/runs/34840771217) terminó `success` a las 11:59:45 UTC. [Pages](https://fc84e81b.shekinah-7dl.pages.dev) terminó `success` a las 11:58:50 UTC. Ambos corresponden al mismo SHA `bffec969d27c4bd03450b3617c8f5681b85321ab`, publicado en `origin/main` sin force-push.

## Reconciliación periódica

El usuario autorizó expresamente habilitar y verificar el scheduler después de acreditar el sync real y consultar el consumo D1 de toda la cuenta. La revisión automática había rechazado el intento anterior antes de ejecutarlo con «bloqueado por política», sin otra razón; no se eludió ese rechazo mediante otro reloj.

`DUX_RECONCILIATION_ENABLED` pasó de `false` a `true` a las 12:12 UTC, en el repositorio GitHub. Se conservó `.github/workflows/dux-reconcile.yml`, programado cada cinco minutos, con concurrencia serializada, secreto del environment, límites de lecturas/escrituras, cooldown y validación de publicación. El relay Cloudflare sigue sin programación. La medición previa de cuenta reportó 49.342 filas leídas y 2.540 escritas durante el día UTC; no equivale a una garantía de cuota futura.

La [ejecución manual del workflow 34842145442](https://github.com/JerePrograma/shekinah/actions/runs/34842145442) confirmó un ciclo `scheduled` entre 12:12:37.878 y 12:14:08.780 UTC: 754 productos, cero errores y cinco cambios, con generación publicada. La comprobación de las 754 fichas y sus rutas SPA terminó a las 12:17:09 UTC y el workflow quedó `success`. Se acreditaron HTTPS canónico, 14 categorías, 599 precios utilizables, 87 placeholders, 68 ausentes/cero y cero inválidos. Una ejecución despachada manualmente no prueba la cadencia del cron; la consulta autenticada y sin caché de las 12:50:30 UTC confirmó rama predeterminada `main`, workflow `active` y gate `true`, pero todavía no mostraba ejecuciones automáticas nuevas. La última era de las 06:37:52 UTC, omitida cuando el gate estaba cerrado. El umbral vigente de frescura continúa en 900 segundos y no se amplió: la última publicación conocida venció a las 12:29:08.780 UTC.

GitHub documenta que los eventos programados pueden retrasarse o descartarse por carga, pero esto sólo es una posibilidad y no demuestra la causa de este repositorio. Su página de estado informaba Actions operativo, sin incidente abierto, durante la consulta. No se cambió la expresión cron ni se agregó otro reloj por conjetura. Fuentes: [eventos programados](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) y [estado GitHub](https://www.githubstatus.com/).

## Diagnóstico comercial previo a los flags

El readiness autenticado de las 12:03:20.770 UTC confirmó 0020, esquema asistido y guards financieros listos, catálogo fresco, secreto de acceso a solicitudes configurado, cero solicitudes y cero incidencias de pagos/vínculos/operaciones. La única barrera de solicitudes web fue `WEB_ORDERS_DISABLED`.

El checkout asistido mostró `PAYMENT_APPLICATION_MISMATCH` y los tres flags cerrados. El portal del proveedor confirmó la aplicación Shekinah autorizada; acceder a su secreto requirió login y una segunda verificación humana. El campo Access Token devolvió vacío al control del navegador, y Cloudflare no devuelve el valor de sus secretos cifrados. La carga y guardado de la credencial quedó pendiente del usuario en el formulario productivo. No se confundió la Public Key con el Access Token ni se relajó el guard de aplicación.

El checkout automático conserva `DUX_ORDER_LIFECYCLE_UNAVAILABLE` y sus bloqueos de contrato; esas barreras son distintas del flujo asistido autorizado. La documentación oficial Dux describe creación de pedidos con reserva en el depósito elegido y anulación que libera la reserva; el smoke debe verificar esos efectos reales antes de confirmarlos en Shekinah. Fuentes: [gestión de pedidos](https://ayuda.duxsoftware.com.ar/es/articles/8886589-gestion-de-pedidos) y [reserva de stock](https://ayuda.duxsoftware.com.ar/es/articles/8736752-como-utilizar-reserva-de-stock).

Se preparó únicamente un carrito local con una unidad de ADOBO PIZZA GOURMET 100GR, sin registrar solicitud, reserva, preferencia ni cobro. El carrito se vació y el formulario Dux se abandonó sin guardar. No se enviaron mensajes por WhatsApp ni correo. Los identificadores técnicos de ciclos, respuestas y logs permanecen en evidencia local ignorada; no se publican secretos, payloads de clientes ni IDs privados de configuración.

## Primera etapa web y rollback de flags

Se aplicó una actualización parcial de Pages Production: `WEB_ORDERS_ENABLED=true` y `VITE_WEB_ORDERS_ENABLED=true`. La relectura confirmó ambos valores y la conservación de las demás variables, secretos y bindings de los dos entornos. [La publicación web](https://17eebdae.shekinah-7dl.pages.dev), sobre el mismo SHA `bffec969d27c4bd03450b3617c8f5681b85321ab`, terminó correctamente a las 12:21:19 UTC. ASSISTED y COMMERCE permanecieron cerrados.

La verificación posterior no pudo comenzar: al recargar el administrador, el navegador local devolvió `ERR_CERT_AUTHORITY_INVALID` para `shekinah.ar`. Una lectura HTTPS desde PowerShell había fallado también con `HttpRequestException` por validación TLS. El diagnóstico de las 12:28 UTC comprobó un certificado para `shekinah.ar` emitido por Fortinet y `RemoteCertificateChainErrors`; la conexión fue rechazada con `AuthenticationException`, manteniendo la validación normal y sin enviar una petición HTTP. Esto se registra como bloqueo de acceso del entorno operativo; la comprobación externa de GitHub acababa de validar el sitio canónico. No hay evidencia que atribuya el error de certificado al cambio de flags o a D1.

A las 12:22:57 UTC se confirmó el rollback exclusivamente de `WEB_ORDERS_ENABLED` y `VITE_WEB_ORDERS_ENABLED` a `false`, conservando el resto de la configuración. [La publicación de cierre](https://5c2befe6.shekinah-7dl.pages.dev) terminó `success` a las 12:25:01 UTC sobre el mismo SHA. El recibo local `web-rollback-deployment-status.json` confirma ambos flags cerrados. No se hizo rollback de D1, restore ni cambios de seguridad.

La relectura de D1 a las 12:27 UTC detectó una solicitud `submitted`, creada a las 12:21:33.297 UTC durante la apertura WEB, sin marca de prueba. El agente no la envió. No tiene orden asistida, vínculo Dux ni operación asociada. El usuario confirmó después que era una prueba suya y autorizó cerrarla por el flujo soportado. Su identificador queda en `external-web-request-observed.json`, dentro de la evidencia local; no se publica el nombre ni el contacto. Esa persistencia no se atribuye al smoke del agente ni acredita su idempotencia. El cierre administrativo debe quedar confirmado antes de considerarla resuelta.

La comprobación posterior en Chrome permitió cargar `/admin` a las 12:33:01.528 UTC con HTTP 200, `securityState=secure` y emisor público `WE1`, sin excepciones de certificado. Por tanto, la continuación puede usar esa conexión HTTPS válida; el fallo Fortinet persiste en PowerShell y en el navegador interno. El usuario completó el login y se acreditaron la sesión propia de Administrador y la visibilidad de la solicitud en la lista administrativa. Antes de abrir el detalle, la conexión de control devolvió `Debugger unattached`; la pestaña y sesión seguían presentes, pero ni la lectura de accesibilidad, la alternativa documentada ni el reinicio de la conexión recuperaron el control. Se solicitó reactivar la conexión de Chrome, sin pedir otro login ni enviar una resolución incierta.

La comprobación remota de las 12:53:37 UTC confirmó la publicación de cierre `success` en el SHA indicado y la solicitud todavía `submitted`, sin fecha de resolución. Cloudflare había devuelto antes `10000 Authentication error`; el refresco normal de OAuth mediante `wrangler whoami` terminó con exit code 0 y permitió esta relectura, sin intervención humana ni cambios de permisos. La captura de Functions conectada entre 12:21:57 y 12:26:57 UTC no recibió eventos; por tanto, no demuestra ausencia global de errores ni cubre la petición de las 12:21:33.

| Flag | Preview | Production |
| --- | --- | --- |
| `WEB_ORDERS_ENABLED` | Ausente, efectivo `false` | `false` |
| `VITE_WEB_ORDERS_ENABLED` | Ausente, efectivo `false` | `false` |
| `ASSISTED_CHECKOUT_ENABLED` | Ausente, efectivo `false` | Ausente, efectivo `false` |
| `COMMERCE_ENABLED` | `false` | `false` |
| `VITE_COMMERCE_ENABLED` | `false` | `false` |
| `DUX_API_ENABLED` | `true` | `true` |

El gate GitHub `DUX_RECONCILIATION_ENABLED=true` es independiente de estos flags Pages. No se crearon preferencias ni se completó ningún cobro. La reserva asistida, la idempotencia comercial real, la redirección/retorno y el webhook siguen sin acreditarse con un smoke productivo.

## Recuperación de Chrome y cierre de la prueba

El usuario reactivó la extensión. La pestaña anterior conservó el fallo de control, pero una pestaña nueva del mismo Chrome recuperó el acceso con la sesión administrativa existente, sin volver a autenticar ni trasladar cookies. Se abrió el detalle de la solicitud exacta, se eligió `Rechazar solicitud` y se confirmó la resolución por la interfaz soportada.

D1 acredita `rejected` a las 12:57:00.749 UTC, con responsable registrado, una entrada `admin.web_requests.resolve` de status 200 y cero órdenes asociadas. La comprobación de las 12:58:55 UTC confirmó cero incidencias de claves foráneas. El recibo `controlled-user-test-closed.json` conserva el ID técnico y la secuencia sin publicar datos personales. No se borró la solicitud ni se modificó directamente su estado mediante SQL.

El readiness autenticado de las 12:57:25.096 UTC mostró una solicitud registrada y cero pendientes; cero vínculos Dux, operaciones e incidencias financieras que requieran atención; esquema disponible y flags cerrados. Persisten `PAYMENT_APPLICATION_MISMATCH` y snapshot Dux obsoleto, con última publicación a las 12:14:08.780 UTC. Esta lectura acredita el cierre de la prueba y las barreras actuales, pero no la activación comercial.

## Pendientes concretos

1. Guardar el Access Token productivo de la aplicación Shekinah en el secreto `MERCADO_PAGO_ACCESS_TOKEN` de Pages Production. El formulario quedó preparado para la entrada y confirmación del titular. Después, publicar y volver a consultar readiness; no inferir vigencia por la existencia del nombre del secreto.
2. Acreditar la frecuencia efectiva del scheduler con las ejecuciones automáticas reales. El gate abierto y el workflow manual exitoso no demuestran una actualización cada cinco minutos. Mantener el umbral de 900 segundos; si el proveedor sigue sin emitir eventos, conservar los recibos para su diagnóstico y no declarar un servicio continuo.
3. Retomar WEB → smoke persistente/idempotencia/admin → ASSISTED → reserva Dux real verificada → COMMERCE → preferencia/redirect/retorno sin cobro → conciliación y liberación soportada. No acreditar estos pasos con los tests locales ni con el catálogo leído.

El control administrativo quedó recuperado en Chrome y la prueba del usuario quedó cerrada. El agente no creó registros transaccionales de prueba ni dejó una reserva o preferencia nueva abierta. El acceso PowerShell/navegador interno todavía requiere resolver la cadena Fortinet en esa conexión; no se necesitan excepciones de seguridad para continuar mediante Chrome. D1 está terminada; el producto comercial completo sigue pendiente de estas verificaciones externas.

## Corrección del circuito mostrado en el carrito

Sobre `aefdc452e9d561ec90ecfd2bc94923150b3e552e`, el usuario mostró el fallo real: envío a cotizar por peso no determinístico, botón de Mercado Pago y envío por WhatsApp que terminaba rechazado por `DUX_ORDER_LIFECYCLE_UNAVAILABLE`. El carrito usaba la capacidad de registrar solicitudes tanto para habilitar el registro como para elegir el circuito de interfaz. Cuando esa capacidad era falsa —por flags cerrados, consulta pendiente o catálogo vencido— volvía a mostrar el checkout anterior, aunque los productos del catálogo público Dux tienen `checkoutEligible=false`.

`src/pages/CartPage.tsx` conserva ahora el circuito de solicitudes para esos productos Dux aun cuando el registro no esté disponible. La disponibilidad sigue controlando estrictamente el alta; el carrito muestra el impedimento y conserva los productos, sin ofrecer los botones ni invocar los endpoints anteriores. El envío continúa pendiente de cotización y no se inventan pesos, precios, reservas ni contratos del proveedor. La recuperación de una solicitud existente permanece en su componente actual. No se modificaron flags, guards de frescura, contratos de Dux o Mercado Pago mediante este cambio.

Las pruebas dirigidas de carrito y solicitudes aprobaron 22/22; el nuevo E2E reprodujo el caso con catálogo Dux asistido y capacidad cerrada, y confirmó cero llamadas a los endpoints anteriores. `npm run verify` terminó con exit code 0: 114 archivos, 686 tests aprobados y 14 omitidos; lint, TypeScript, catálogo, catálogo comercial, pesos, build, assets, seguridad y automatización aprobados; 28 E2E aprobados. `npm run build:pages` también terminó con exit code 0 y los mismos conteos unitarios. Los logs quedan en `cart-flow-verify.log` y `cart-flow-build-pages.log` dentro de la evidencia local ignorada. Esta corrección de interfaz no acredita todavía una compra productiva ni sustituye los pendientes de activación anteriores.

El cambio se publicó sin force-push en `0bec3e13ed206d1d296257bb0d846c31e94fa059`. [Verify 34852409073](https://github.com/JerePrograma/shekinah/actions/runs/34852409073) terminó `success` a las 14:00:16 UTC y [Pages](https://1da2e578.shekinah-7dl.pages.dev) a las 14:00:09 UTC, ambos para ese SHA. La comprobación en Chrome sobre `https://shekinah.ar/carrito` conservó la unidad existente y su estimación de $21.900; al seleccionar Correo Argentino mostró cotización pendiente y registro no disponible, sin los botones anteriores ni el mensaje de peso determinístico. No se enviaron datos personales ni un pedido. La consola observada no mostró errores; la captura de Functions de 14:05:02 a 14:07:02 UTC registró dos GET `Ok`, a `/api/catalog` y `/api/orders/request-capability`. Esto cubre esas peticiones, no prueba ausencia global de errores. Los recibos están en `cart-flow-production-smoke.json` y `pages-tail-cart-release-receipt.json`.

## Prueba acotada del relay Cloudflare

La consulta posterior encontró una ejecución realmente automática de GitHub: [34848416876](https://github.com/JerePrograma/shekinah/actions/runs/34848416876), evento `schedule`, creada a las 13:18:17 UTC. D1 confirmó `scheduler:github-actions`, 754 productos y cero errores entre 13:18:30 y 13:20:01 UTC. No aparecieron ciclos cada cinco minutos después; el snapshot volvió a vencer. Este dato amplía el historial anterior y no convierte el dispatch manual en evidencia de cadencia automática.

Se inspeccionaron el código ya desplegado y la configuración del relay `shekinah-dux-scheduler`: handler `scheduled`, endpoint autorizado, binding del secreto independiente y observabilidad habilitada. Antes de probarlo se acreditaron cero workflows Dux activos y cero sincronizaciones en curso. El gate GitHub pasó a `false` a las 13:46:04 UTC; la API oficial de Cloudflare confirmó una única programación `*/5 * * * *` a las 13:46:08 UTC. No se cambiaron límites, cooldown, frescura ni contratos, y no se agregó un servicio nuevo.

Se fijó antes de observar un plazo de primer ciclo hasta 14:08:08 UTC, contemplando propagación y duración del ciclo, y se exigieron cuatro ciclos automáticos consecutivos para acreditar continuidad. El tail conectado desde 13:47:20 UTC no recibió eventos durante el plazo. D1 confirmó cero sincronizaciones desde el comienzo del ensayo. La consulta GraphQL de métricas a las 14:11:05 UTC tampoco devolvió invocaciones para el Worker desde las 13:40 UTC; se conserva como evidencia adicional, con las limitaciones de entrega de telemetría del proveedor. No se determinó una causa interna de Cloudflare ni se atribuye esta ausencia a Dux.

La programación de prueba se retiró y su relectura devolvió una lista vacía a las 14:09:47 UTC. El gate GitHub permaneció cerrado durante la propagación de esa retirada para evitar superposición. El código y la configuración versionados del scheduler no se cambiaron. Las APIs aceptaron las operaciones de configuración, pero eso no acreditó su ejecución periódica. La documentación oficial contempla hasta 15 minutos para propagar altas o bajas de cron: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/). La consulta de métricas siguió el [ejemplo oficial GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).

Incidencias locales del diagnóstico: expiró OAuth con respuesta `10000`, recuperado mediante el refresco normal de Wrangler sin cambiar permisos; un preflight de cierre interpretó como texto una fecha que PowerShell ya había convertido a `DateTime`, y se corrigió preservando ese valor antes de efectuar llamadas remotas. Ninguno de esos fallos modificó D1 ni explica la ausencia de eventos programados. La evidencia privada completa permanece bajo `cloudflare-clock-*` dentro del directorio ignorado del rollout.

La revalidación remota de las 14:16 UTC volvió a confirmar en ambas bases la secuencia exacta 0001–0023, los 14 objetos, las 15 columnas requeridas y cero incidencias de claves foráneas. Los cuatro bookmarks mantienen los hashes anteriores. `cart-release-d1-final-verification.json` conserva ese resultado; fue una comprobación de sólo lectura, sin reaplicar SQL ni realizar restore.

## Restitución del scheduler y smoke web controlado

Después de esperar los 15 minutos de propagación de la retirada del cron Cloudflare, se restituyó el gate GitHub a `true`. La primera relectura inmediata todavía devolvió el valor anterior; se detuvo el helper y una consulta de sólo lectura a las 14:26:06 UTC confirmó `true`, actualizado a las 14:25:39 UTC. No se repitió la modificación ni se dejaron dos relojes habilitados. El tail Cloudflare terminó a las 14:22:16 UTC sin eventos recibidos; la señal de terminación corresponde al límite local de captura, no a un fallo observado del Worker.

La [ejecución manual 34855646094](https://github.com/JerePrograma/shekinah/actions/runs/34855646094), sobre `0bec3e13ed206d1d296257bb0d846c31e94fa059`, terminó `success`, incluidas la sincronización y la comprobación de todas las fichas públicas. La lectura de stock fue a las 14:26:58.323 UTC y la publicación a las 14:28:29.145 UTC, con 754 productos. La frescura comercial toma la lectura del stock, no sólo la fecha posterior de publicación; el diagnóstico administrativo basado en `synced_at` puede mostrar una ventana distinta. Esta diferencia diagnóstica se registra sin cambiar el umbral ni mezclar otro cambio de código.

Con el catálogo fresco se abrió únicamente WEB, backend y frontend, a las 14:34:50 UTC. [La publicación de prueba](https://e0fdfe7d.shekinah-7dl.pages.dev) terminó `success` a las 14:38:12 UTC, conservando el SHA del arreglo del carrito. El readiness de las 14:39:55 UTC confirmó esquema, protección del token, snapshot vigente y ausencia de bloqueos o advertencias para solicitudes. ASSISTED y COMMERCE continuaron cerrados.

El smoke creó una solicitud claramente identificada como prueba, con una unidad de ADOBO PIZZA GOURMET 100GR y retiro en local. Se ejecutó mediante los endpoints existentes en la URL HTTPS verificada de esa publicación, con la validación TLS normal y el origen canónico permitido. No alteró el carrito del usuario ni envió mensajes por WhatsApp o correo. La identidad y el secreto de recuperación se guardaron localmente antes de la primera petición, en archivos ignorados.

La creación respondió 201 a las 14:40:22 UTC; la repetición con la misma identidad respondió 200 y la recuperación respondió 200, conservando una única referencia. El estado público fue `submitted`, sin pago solicitado, sin reserva y sin checkout disponible. D1 confirmó una sola fila para esa identidad y el precio observado de Dux de 350.000 unidades menores ($3.500), cantidad uno. Esto acredita persistencia, idempotencia, recuperación y ausencia de pago previo a la reserva.

La solicitud se vio en Administración y se cerró mediante `Rechazar solicitud` y `Confirmar resolución`. D1 registró `rejected` a las 14:41:39.576 UTC, responsable informado y cero órdenes asociadas. La comprobación de las 14:44:13 UTC confirmó dos solicitudes históricas, cero pendientes y cero incidencias de claves foráneas. Los identificadores técnicos y las respuestas privadas están en `controlled-web-smoke-*`; no se publican tokens, identidad de recuperación ni payloads personales. Un error posterior de limpieza de variables locales hizo terminar el comando de verificación con exit code 1; los recibos ya se habían escrito y se releyeron correctamente. No se repitió la transacción ni se cuenta ese comando completo como exit code 0.

La consulta de continuidad a las 14:42:28 UTC encontró el mismo stock leído a las 14:26:58 UTC, ya mayor que 900 segundos, y la capacidad pública pasó a `false`. Se cerró exclusivamente el par WEB a las 14:42:50 UTC. [La publicación de cierre](https://a0f78abb.shekinah-7dl.pages.dev) terminó `success` a las 14:45:54 UTC y se confirmó como canónica a las 14:49:24 UTC, sobre el mismo SHA. No se atribuye este vencimiento al arreglo del carrito: falta acreditar una actualización automática sostenida.

## Estado comercial después del smoke

El usuario volvió a iniciar sesión en Dux. A las 14:49 UTC se observó el panel autenticado, pero navegar a Pedidos y al enlace visible de Nuevo Pedido volvió a presentar el login. No se determinó la causa de esa pérdida de acceso ni se intentó modificar cookies, eludir autenticación o guardar una reserva incierta. No se creó ningún pedido Dux. El próximo paso de acceso es comprobar con el titular que Pedidos permanece abierto después del login; no basta volver a mostrar el panel inicial.

El readiness de las 14:50:29 UTC seguía mostrando `PAYMENT_APPLICATION_MISMATCH`, snapshot vencido, cero solicitudes pendientes y cero vínculos Dux, operaciones o incidencias financieras que requirieran atención. El frontend que ya estaba cargado conservaba temporalmente el flag de la publicación anterior; la configuración remota y el servidor ya estaban cerrados. Después de recargar, el diagnóstico de las 14:51:23 UTC confirmó backend y frontend WEB cerrados, con los mismos pendientes externos. El secreto productivo correcto de Mercado Pago continúa pendiente de carga y guardado por el titular en el formulario preparado.

La última configuración remota confirmada conserva WEB y COMMERCE en `false`, ASSISTED ausente y efectivo `false`, Dux API en `true`, el gate GitHub en `true` y el relay Cloudflare sin cron. La prueba del usuario y la prueba del agente quedaron rechazadas mediante el flujo administrativo soportado. No se crearon nuevas órdenes asistidas, reservas, preferencias ni cobros, y no hubo restore ni migraciones posteriores a 0023.

El circuito web tiene un smoke real completo y cerrado; el circuito comercial integral sigue sin acreditarse. Permanecen tres dependencias concretas: ejecución automática con frescura sostenida, acceso operativo a Pedidos Dux y credencial productiva de Mercado Pago correspondiente a la aplicación autorizada. Después corresponde retomar la activación secuencial, verificar reserva y liberación reales y, sólo con readiness válido, probar preferencia, redirección y retorno sin efectuar un cobro real. La ausencia de incidencias en las capturas acotadas no se presenta como ausencia global de errores de producción.
