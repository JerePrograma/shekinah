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

Pendiente de recibos del SHA de esta ampliación: CI, Pages, 0024 Preview, 0024 Production, apertura gradual de flags, reserva Dux real, preferencia Checkout Pro sin cobro y cierre de la prueba. No atribuir estos resultados a las pruebas locales.

El scheduler GitHub está configurado cada cinco minutos, pero sus ejecuciones observadas del 15 de septiembre fueron espaciadas: 05:09, 10:02 y 14:51 UTC. Las tres terminaron correctamente; la expresión cron no acredita esa frecuencia efectiva. La compra directa consulta Dux en vivo antes de reservar y no usa el snapshot obsoleto como autorización de stock o precio. La demora del scheduler sigue siendo una incidencia operativa a observar.

No hubo restore, recreación de D1, force-push, cambios de credenciales, cobros reales ni modificación de datos de clientes en esta ampliación. Los IDs privados, identidades de prueba, payloads y bookmarks permanecen en evidencia local ignorada.
