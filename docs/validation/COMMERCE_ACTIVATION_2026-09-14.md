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
