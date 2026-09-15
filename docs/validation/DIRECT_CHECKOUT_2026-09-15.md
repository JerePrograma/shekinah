# Compra directa: validación y operación del 15 de septiembre de 2026

Este registro distingue implementación, publicación, migración y activación. La autorización expresa del titular amplía el alcance histórico 0020–0023 para permitir la compra directa y `0024_direct_dux_checkout.sql`. El contrato y el procedimiento están en [DIRECT_CHECKOUT.md](../DIRECT_CHECKOUT.md).

## Estado inicial comprobado

Base local y remota: `17cb2594352458e8cc230782db180b5ff533fff7`, rama `main`. Se trabaja exclusivamente en el checkout de release; se preserva sin preparar la edición local ajena de `COMMERCE_D1_ROLLOUT_2026-09-13.md`. No se accede al checkout original.

Ambas D1 se consultaron nuevamente antes de aplicar 0024: historial exacto y continuo 0001–0023, sólo 0024 pendiente, 14 objetos y 15 columnas críticos existentes, `PRAGMA foreign_key_check` vacío. Última migración registrada: Preview 2026-09-13 19:50:33 UTC y Production 2026-09-13 19:54:15 UTC. Los recibos completos se conservan en `.wrangler/commerce-d1-rollout/20260915-direct-purchase`.

La administración confirmó el 2026-09-15 a las 16:41:05 UTC: WEB y COMMERCE cerrados, Dux API habilitada, secretos de pago/webhook/pedido presentes, tres solicitudes anteriores y ninguna pendiente, cero vínculos u operaciones Dux comerciales. El snapshot de 754 productos era de las 14:52:46 UTC y estaba obsoleto. Este diagnóstico correspondía al SHA base, anterior a la implementación directa.

## Cambio implementado

- Preparación persistente desde la misma solicitud y los mismos datos del comprador; retiro coordinado sin cargo.
- Lecturas vivas de precio, IVA y stock Dux; cantidades enteras obtenidas con `floor` sobre el stock decimal.
- Un único intento de creación de pedido; recuperación por referencia ante incertidumbre, sin reenviar el POST.
- Confirmación mediante pedido activo, líneas, importe y efecto físico de reserva antes de ofrecer Checkout Pro.
- Guards 0024 para identidad automática, idempotencia y finanzas; conservación de las garantías asistidas 0023.
- Total confirmado en el resumen del carrito; WhatsApp opcional y recuperación administrativa de la preparación.
- Coordinación de llamadas Dux con el sincronizador dentro del presupuesto D1 Free, sin nuevos servicios ni dependencias.

Correo mantiene cotización cuando falta peso logístico estructurado o cobertura. Los tramos autorizados no se aplican sobre un peso inferido del nombre. La liberación/finalización Dux conserva el flujo administrativo soportado; no hay cancelación automática de reservas abandonadas.

## Evidencia local e incidencias del entorno

Node.js 24.18.0, npm 11.16.0 y Wrangler 4.131.0. `npm ci` e instalación de Chromium completados; `package-lock.json` no cambió. Se observaron cuatro avisos de auditoría de dependencias existentes, sin ejecutar correcciones automáticas ni actualizar versiones.

Pruebas dirigidas de preparación, idempotencia, lifecycle, APIs y sincronización aprobadas. La prueba de sincronización con 1.000 productos acredita 44 consultas D1 con un retry y reserva seis de margen hasta 50. Con dos retries agota el presupuesto de forma cerrada y conserva el catálogo anterior.

El parser y self-test histórico del migrador pasaron en Windows PowerShell 5.1, incluido stderr, código nativo y restauración de `ErrorActionPreference`. Los mocks operativos Dux pasaron 27/27 en PowerShell 7. La solución histórica de `Invoke-Native` no fue reemplazada ni modificada.

Wrangler aplicó localmente 0001–0024: historial continuo, 21 objetos nuevos presentes y cero incidencias de foreign keys. El archivo de import de 0024 y su inserción de historial se validaron juntos en SQLite y tienen manifiesto SHA-256 local. Esto todavía no acredita la migración remota.

Una ejecución integral sufrió timeout al iniciar un worker de Vitest; otra tuvo timeout al terminarlo y fue interrumpida. No se acreditan como aprobadas. Se registró presión de memoria en Windows y se limitó la validación a un trabajador, sin cambiar la configuración versionada. La prueba aislada posterior a `npm ci` pasó 3/3 en 4,06 segundos. La suite completa posterior (`npm run test -- --bail=1 --reporter=verbose`) terminó con exit code 0: **120 archivos, 771 pruebas aprobadas y 14 omitidas**, desde las 16:36:25 UTC, duración 746,06 segundos.

`npm run verify` y `npm run build:pages` no tienen una aprobación integral local: se interrumpieron en el ejecutor de pruebas de Windows; el segundo había completado lint y TypeScript. No se determinó una causa raíz única del arranque/terminación de workers ni una dependencia faltante. Como evidencia alternativa, todos sus componentes se ejecutaron por separado con exit code 0: lint, typecheck, la suite completa anterior, `verify:catalog`, `verify:commerce-catalog`, `verify:shipping-weights`, `build`, `verify:assets`, `verify:security`, `verify:automation` y **29 E2E aprobados en 2,4 minutos**. Los agregados normales deben acreditarse además en CI y Cloudflare para el SHA publicado antes de activar el producto.

El control de una pestaña Chrome respondió `Debugger unattached`. Se recuperó una pestaña nueva mediante la API documentada. Dux requirió después autenticación humana por sesión duplicada; tras ella se acreditó la página de gestión de pedidos. No se crearon pedidos durante ese diagnóstico ni se eludió autenticación.

## Estado de publicación y activación

El estado previo a la publicación dejaba pendientes CI, Pages, ambas migraciones remotas y todos los smokes. Los recibos posteriores acreditan las etapas siguientes, sin atribuirlas a las pruebas locales.

### Publicación acreditada

Commit `f642b76fbcdd55613d09fc908275cd8ecb75cf7b`, `feat: permitir compra directa con reserva autoritativa Dux`, publicado en `origin/main`. [CI 34998487540](https://github.com/JerePrograma/shekinah/actions/runs/34998487540) y su [job Verify](https://github.com/JerePrograma/shekinah/actions/runs/34998487540/job/104480688792) terminaron con success a las 17:03:19 UTC. La ejecución normal acreditó 120 archivos, 771 pruebas aprobadas, 14 omitidas, 29 E2E, parser PowerShell, mocks Dux y artefacto `shekinah-dist-f642b76fbcdd55613d09fc908275cd8ecb75cf7b` de 52.273.461 bytes. El agregado normal de Pages también pasó: [deployment inicial](https://4bc8dd0f.shekinah-7dl.pages.dev), success a las 17:03:23.406143 UTC para el mismo SHA. Esto resuelve la validación de agregados pendiente por el entorno Windows, sin borrar sus intentos fallidos.

### D1 remota acreditada

La única migración nueva fue `0024_direct_dux_checkout.sql`, expresamente autorizada. Se aplicó mediante import oficial de Wrangler 4.131.0, SQL exacto más registro de historial, desde Windows PowerShell 5.1. SHA-256 del SQL: `8EBECFACCDDAB5908F0B668D653A85FCBACF0933F641ECFC5F8B0AE5ADFA7B5A`. Preview pasó antes de comenzar Production.

| Entorno | `applied_at` de 0024, UTC | Verificación terminada, UTC | Bookmark previo, archivo local |
| --- | --- | --- | --- |
| Preview | 2026-09-15 17:06:32 | 17:06:59.6674232 | `preview-before-0024-20260915-170509Z.json` |
| Production | 2026-09-15 17:08:11 | 17:08:25.1294813 | `production-before-0024-20260915-170740Z.json` |

Ambas bases: historial exacto y continuo 0001–0024; `No migrations to apply`; ninguna migración posterior; 35 objetos críticos y 21 columnas presentes; `PRAGMA foreign_key_check` sin filas; conteos de órdenes, vínculos, operaciones e intenciones preservados durante la migración. Los 35 objetos incluyen los 14 históricos y los 21 declarados en `DIRECT_CHECKOUT_GUARDS` de `server/direct-checkout-schema.ts`. Las columnas verificadas son las 15 del migrador histórico más `direct_checkout_state`, `direct_checkout_claim_token`, `direct_checkout_updated_at`, `direct_checkout_error_code`, `direct_checkout_lease_until_ms` y `direct_checkout_progress_json` de `checkout_intents`.

Recibos privados: `preview-apply-receipt.json`, `production-apply-receipt.json`, `*-verified-preapply.json`, `*-verified-after.json` y `*-list-after-0024.log`. Los bookmarks nuevos están en el directorio privado de esta ampliación; también se preservaron `20260913-172748Z/preview-before.json`, `20260913-194042Z/preview-before.json` y los bookmarks de import Preview/Production de `20260913-resume-readonly`. No hubo restore, recreación ni modificación del SQL histórico. Una relectura de Production después de cerrar la prueba volvió a confirmar 24 migraciones, 35 objetos, 21 columnas y cero incidencias FK.

### Activación por etapas y prueba cerrada

Se configuraron las dos identidades operativas Dux existentes y verificadas a las 17:09:03 UTC, sin cambiar credenciales. Los valores privados no se publican. Se preservó toda configuración ajena a cada etapa.

| Etapa Production | Cambio UTC | Despliegue del mismo SHA | Resultado |
| --- | --- | --- | --- |
| WEB y frontend WEB a true | 17:10:10.6977082 | [747abb6f](https://747abb6f.shekinah-7dl.pages.dev), success 17:13:19.483588 | Readiness sin bloqueos a las 17:15:24.569; persistencia, replay, recuperación y visibilidad administrativa verificados |
| ASSISTED a true | 17:20:20.4364162 | [660d3bc8](https://660d3bc8.shekinah-7dl.pages.dev), success 17:23:23.180144 | Reserva real no ejecutada: Dux impidió abrir Nuevo Pedido por sesión duplicada |
| ASSISTED nuevamente false | 17:31:55.9115294 | [b5e4c73e](https://b5e4c73e.shekinah-7dl.pages.dev), success 17:36:20.396747 | Cierre del único flag recién habilitado; DIRECT y COMMERCE permanecieron cerrados |

La primera consulta Cloudflare al intentar abrir ASSISTED devolvió `10000 Authentication error` antes de cualquier PATCH. Se preservó el error, se refrescó la sesión OAuth existente mediante Wrangler y una sola nueva ejecución configuró la etapa correctamente. No fue un fallo de D1 ni motivó restore.

La prueba WEB claramente identificada se creó a las 17:15:48.894 UTC: creación HTTP 201, replay HTTP 200 y recuperación HTTP 200 con la misma identidad. Pago `not_requested`, reserva `not_reserved`, checkout cerrado y total sin confirmar. Se observó en administración y se rechazó por su resolución soportada a las 17:33:37.120 UTC. Auditoría `admin.web_requests.resolve` con HTTP 200 a las 17:33:37.424 UTC. D1 confirmó una sola solicitud rechazada, cero órdenes vinculadas y cero solicitudes pendientes. La referencia técnica completa y los recibos `controlled-web-smoke-*.json` quedan locales; no se publica el token de consulta ni la identidad protegida. No se creó pedido Dux, reserva ni preferencia Mercado Pago en esta ampliación.

Logs observados de Functions: WEB, 215 eventos completos con resultado ok; ASSISTED, 15 eventos completos con resultado ok. En ambas muestras: cero excepciones, logs de error e incidencias D1. El último objeto de cada captura quedó incompleto al detener el tail y no se contó. Estas muestras no acreditan un smoke de reserva o pago que no ocurrió.

El diagnóstico de las 17:37:08.347 UTC confirma esquema 0024 e identidades presentes, WEB abierto, DIRECT y COMMERCE cerrados, cuatro solicitudes registradas y ninguna pendiente, cero compras en preparación/revisión, cero operaciones Dux e incidencias financieras. El catálogo de 754 productos publicado a las 17:11:34.658 UTC aparece obsoleto; no se presenta este readiness como completamente saludable. Preview conserva sus flags comerciales cerrados. `VITE_COMMERCE_ENABLED` continúa false porque corresponde al checkout anterior retirado.

### Bloqueos de continuidad

Dux devolvió HTTP 200 para `access-duplied.faces` al pulsar Nuevo Pedido; la navegación al formulario publicado por el propio menú mostró «Se cerró esta sesión porque tu usuario entró en otro dispositivo». El tablero visible no acreditaba una sesión operativa. No se determinó quién originó el otro acceso. Chrome también perdió las pestañas durante la operación; una pestaña nueva recuperó la sesión Shekinah y permitió cerrar la prueba. Dux quedó en inicio de sesión, sin credenciales expuestas ni controles eludidos.

Se requiere un acceso Dux que permita abrir y operar Nuevo Pedido. Después: refrescar catálogo, verificar readiness, completar ASSISTED con reserva y cierre reales; habilitar DIRECT y confirmar reserva autoritativa; abrir COMMERCE y verificar preferencia, redirección y retorno sin cobro; respetar las ventanas y conciliación financiera al cerrar la reserva de prueba. Nada de esto queda acreditado por un build. El producto todavía no está terminado.

El scheduler GitHub está configurado cada cinco minutos, pero sus ejecuciones observadas del 15 de septiembre fueron espaciadas: 05:09, 10:02 y 14:51 UTC. Las tres terminaron correctamente; la expresión cron no acredita esa frecuencia efectiva. La [ejecución manual 34999515994](https://github.com/JerePrograma/shekinah/actions/runs/34999515994), despachada a las 17:09:48 UTC sobre el SHA funcional, también terminó con success y publicó 754 productos; incluyó la verificación de todas sus fichas. La compra directa consulta Dux en vivo antes de reservar y no usa el snapshot obsoleto como autorización de stock o precio. La demora del scheduler sigue siendo una incidencia operativa pendiente.

No hubo restore, recreación de D1, force-push, cambios de credenciales, cobros reales ni modificación de datos de clientes en esta ampliación. Los IDs privados, identidades de prueba, payloads y bookmarks permanecen en evidencia local ignorada.
