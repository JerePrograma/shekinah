# Limpieza autorizada de pruebas productivas — 2026-09-30

## Alcance y autorización

Base limpia `main`/`origin/main`:
`84846e61b8dfd06241fa702de930363870c281ad`. Se ejecutaron status, switch main,
fetch, pull ff-only, status y log antes de editar. No se crearon ramas,
worktrees, PR, stashes ni cambios sobre migraciones aplicadas.

El titular identificó siete solicitudes de prueba y sus tres órdenes y eligió
expresamente «Borrar definitivamente después de resolver Dux y verificar los pagos».
Luego habilitó sus sesiones Shekinah y Dux. Esta autorización puntual sustituye
la conservación de esos registros operativos; no autoriza borrar otras compras,
evidencia financiera ni el historial Git/documental. En la primera operación,
otros 15 pedidos quedaron fuera del alcance, incluso coincidencias de nombre o etiquetas de prueba
anteriores que no forman parte de estas siete solicitudes.

| Solicitud | Orden | Pedido Dux | Total ARS |
| --- | --- | --- | ---: |
| `req_klYbZQNnzcZBF1NAUWvxdJjN` | `ord_wNdSN3hQXcKHU4SPz1DsRUks` | 1 / 3417590 | 3.500 |
| `req_SSxw2QbNUO37Gn-x3C-_5syj` | `ord_QV2DVvj5lWELqOKLBJi0oCuZ` | 2 / 3421572 | 21.900 |
| `req_K6tG1vGCUOSoX8cU7Mp0gBH_` | `ord_l5iXS4a6bPMrSiu9hVOJm-FX` | 3 / 3422535 | 21.900 |
| `req_Xcfq-0wMTO23pDEkMWm0WtGq` | Sin orden | Sin pedido | — |
| `req_K7eKP-Nv0Wvfc-ZOj2ucvhwU` | Sin orden | Sin pedido | — |
| `req_Du-P7e_aRpJCO30Dics_bddw` | Sin orden | Sin pedido | — |
| `req_rGOZ82A8RKGmR_wien6g1ZJm` | Sin orden | Sin pedido | — |

Los IDs permiten auditar el alcance sin agregar nombres, teléfonos, direcciones,
tokens de consulta ni copias de los cuerpos personales eliminados.

## Cierre de proveedores y límites de evidencia

El pedido Dux 1 ya estaba anulado y su reserva liberada por el flujo soportado
desde `2026-09-21T06:05:46.018Z`, según
[el cierre original](DIRECT_CHECKOUT_PRODUCTION_2026-09-21.md). No se repitió.
En esta revisión el navegador bloqueó el detalle/API de esa orden con
`ERR_BLOCKED_BY_CLIENT`; no se sorteó el bloqueo. El titular abrió el pedido,
pulsó Verificar pago y comunicó el resultado actual: «Mercado Pago no informó
pagos para este pedido». Es verificación humana, separada de los controles
remotos ejecutados por el agente.

El agente consultó Verificar pago para las otras dos órdenes y observó cero
pagos informados. En Dux, comprobó los pedidos 00000002 y 00000003, las referencias
exactas `SHEKINAH:WEB:REQ_…`, SKU 799000516, cantidad 1 y total ARS 21.900 por
pedido, sin factura ni remito. Usó Anular y la confirmación oficial de cada
pedido existente. Los dos desaparecieron de VIGENTES y aparecieron, junto al
pedido 1, como ANULADO. No se creó otro pedido, cobro, reintegro o comprobante.

Consulta Stock del depósito 25566 acreditó SKU 799000516 con 7 real, 0 reservado
y 7 disponible. El stock real se conservó: se liberaron las dos reservas, sin
compensaciones locales ni modificaciones manuales de cantidades. Las columnas
temporales de consulta se devolvieron a su presentación original después de
observar ese resultado. La captura se conserva fuera de Git en `.wrangler`.

La confirmación soportada de liberación en Shekinah para el pedido 3 volvió a
conciliar Mercado Pago y registró `released` a `2026-09-30T15:51:54.419Z`, con
pago `none`. El pedido 2 nunca obtuvo reserva local confirmada: permanece
`requires_review`/`DIRECT_RESERVATION_UNVERIFIED` y su operación local `pending`
hasta la purga excepcional. No se inventó un estado `released` mediante SQL ni
se reutilizó la reanudación para repetir una reserva de un pedido ya anulado.

Las dos preferencias creadas el 21 de septiembre exceden la ventana de pago de
30 minutos. El código de creación exige `expires: true` y valida sus límites;
la liberación soportada comprueba el vencimiento y vuelve a conciliar el pago.
La tercera orden nunca intentó ni obtuvo preferencia. D1 registra cero pagos
globales. No se borran registros ni preferencias en Mercado Pago ni el historial
ANULADO del ERP. La eliminación corresponde a los registros activos de Shekinah;
el historial de Git/documentación y las políticas propias de los proveedores se
conservan.

## Operación puntual y verificaciones previas

`scripts/operations/purge-production-tests-2026-09-30.sql` es un archivo de
operación acotado, sin migración ni endpoint administrativo nuevo. Contiene los
siete IDs y tres órdenes exactos y rechaza otro tenant, fechas/estados/importe,
SKU/cantidad, leases activos, vínculos Dux incompatibles, pagos de cualquier
estado y operaciones de inventario ajenas. Exige que las reservas confirmadas
1 y 3 estén liberadas y conserva la identidad diagnóstica del pedido 2.

Se ejecuta exclusivamente como archivo completo por el import remoto de D1 de
Wrangler 4.131.0. El código oficial instalado de `executeRemotely` deriva `--file`
al import R2/processing de D1, anuncia indisponibilidad transitoria de consultas
y recuperación del estado inicial si falla. No se usa el endpoint de query
para enviar mutaciones separadas. Dentro de ese import aislado se retiran
únicamente los dos triggers que impiden borrar estos historiales, se eliminan
los registros expresamente autorizados y se recrean las definiciones originales.
Antes de terminar se comprueba ausencia de residuos y de violaciones FK.

La comprobación de sólo lectura de `2026-09-30T15:56:45.322Z`, sobre producción
`533c7c65-1dbb-4f15-be96-c6088700a8e1`, aprobó los 11 controles previos. Alcance:
7 checkout_intents, 3 orders, 3 order_items, 3 order_fulfillment, 3 dux_order_links,
5 dux_order_operations y 23 admin_audit. Cero pagos, cero violaciones FK y cero
tablas transitorias. Se calculan hashes de los datos comerciales fuera del
alcance sin guardar ni imprimir sus cuerpos personales.

Esquema inicial: 203 objetos, SHA-256
`2e8fd2ab80da2a376408ee423aa6edee37a59c4777e53de7cc4ed9fdebc34c53`.
Los 15 pedidos ajenos tienen SHA-256
`9b6e0b3efb83e6abdd54b2f291a82b9fba2b306aeed80afe163f228522ab2237`;
se comprueban también sus 30 líneas, 10 entregas y cuatro intenciones legacy.

## Validación y ejecución

`server/production-test-cleanup.test.ts` aplica todas las migraciones reales a
SQLite y prepara datos sintéticos, incluidos registros fuera del alcance. Con
todos los guards restaurados, verifica eliminación exacta, conservación de
otras compras, igualdad integral del esquema, rechazo de cualquier pago,
tenant/importe/inventario/lease incompatible, rechazo de una segunda ejecución
y rollback de datos y triggers ante un fallo después de comenzar el borrado.
El envoltorio BEGIN/ROLLBACK de la prueba simula el aislamiento del import; no
se introduce un BEGIN SQL en el archivo remoto.

La ejecución dirigida inicial de los 11 casos terminó aprobada. Node 24.18.0 y
npm 11.16.0: `npm ci` y `npm run install:browsers`, verificados. La instalación
informó cinco vulnerabilidades del lockfile existente (dos moderadas y tres
altas); no se alteraron dependencias ni se ejecutó audit fix.

La validación completa, el import productivo, la comprobación posterior y el
rollout del commit están pendientes al abrir este registro. Completar sus
recibos antes de declarar la limpieza concluida.

## Primera ejecución: verificada

`npm run verify` aprobó 125 archivos, 969 pruebas y 14 omitidas históricas,
47 E2E y todos los controles de lint, tipos, catálogo, activos, seguridad y
automatización. `npm run build:pages` terminó aprobado con los mismos 969 casos.

La lectura inmediata de `2026-09-30T16:12:41.498Z` repitió los 11 controles y
los conteos/hashes anteriores. El archivo ejecutado tiene SHA-256
`19e38738bbd307a3a2011832ff7e829cc749df4ce8255b7cdcc6bfcc1d807b1b`.
Wrangler confirmó la UUID productiva y un import `success`, 30 consultas,
34,12 ms, 4.612 filas leídas y 106 escritas, bookmark
`00000901-00000016-000050f6-5ca35cce3674ca84fc7627173eca920d`.
No hubo reintento de la mutación.

La comprobación posterior de `2026-09-30T16:14:00.390Z` acreditó cero filas en
las siete relaciones del alcance, incluidos los 23 registros de auditoría.
Los 15 pedidos externos, 30 líneas, 10 entregas y cuatro intenciones legacy
conservaron exactamente sus hashes. El esquema completo mantuvo los mismos
203 objetos y hash, sin tablas de operación ni violaciones FK. `payments`
siguió en cero. En Chrome, Solicitudes web y Pendientes comerciales mostraron
que no había registros; el informe de septiembre quedó vacío.

## Ampliación posterior autorizada: cinco pedidos legacy

Después de ese cierre el titular amplió expresamente el encargo a todos sus
pedidos, los que digan prueba/controlada y cualquier pendiente actual. La lectura
completa de los 15 pedidos restantes identificó exactamente cinco candidatos:

| Código visible | Orden | Canal / estado previo | Total ARS |
| --- | --- | --- | ---: |
| SHK-KIDFDOLX | `ord_rIMjecGO5jK2OOZdKIDfDOlX` | WhatsApp / approved, del titular | 1.500 |
| SHK-BMAIJVFZ | `ord_9GAeh-ZzHsn5wCoObMAijvFZ` | Checkout Pro / pending, controlada | 250 |
| SHK-CQC3EBP8 | `ord_krUrLYTgjjdzBL-ccQc3EBp8` | Checkout Pro / pending, prueba | 250 |
| SHK-6FQNAOAF | `ord_Flz23lHXjgcpdx6S6fQnaOAf` | Checkout Pro / pending, prueba | 250 |
| SHK-MNSJS9G- | `ord_rQ5c3obb0UKwB2bvMnSjs9g-` | Checkout Pro / pending, del titular | 250 |

No había otros pendientes ni coincidencias con los criterios. Todos son de
agosto, con una línea y retiro coordinado, cero stock local reservado/consumido,
cero pagos registrados y sin vínculos/operaciones Dux o de inventario ML. La
aprobación WhatsApp es un estado comercial, no un pago Mercado Pago registrado.

El informe ampliado del navegador devolvió `Failed to fetch`; no se declara
verificada esa consulta ni una comprobación financiera que no se ejecutó.
Se pidió al titular verificar los cuatro Checkout Pro. Su instrucción posterior
fue explícita: «NO verifiques los pagos, ninguno fue realizado». Para esta
segunda operación se utiliza esa declaración humana y no se consulta nuevamente
Mercado Pago. El guard SQL sigue rechazando cualquier evidencia existente en
`payments`, independientemente de su estado. Se conserva la diferencia entre
declaración del titular y verificación autoritativa de proveedor.

`scripts/operations/purge-owner-and-legacy-tests-2026-09-30.sql` contiene esos
cinco IDs exactos y sus importes, productos, fechas, canales y preferencias.
No usa un borrado dinámico por nombre o estado ni puede borrar futuros pedidos.
Elimina cuatro intenciones legacy, cinco órdenes y siete auditorías; las FK
eliminan sólo sus cinco líneas y cinco contactos. No retira ningún trigger ni
modifica estados, inventario, catálogo o proveedores. Dos pruebas adicionales
acreditan el cascade autorizado de la orden WhatsApp con sus guards intactos,
conservación de otra compra y del esquema, rechazo de reejecución/pago y rollback
de una interrupción después de borrar las órdenes. El archivo de pruebas
completo terminó con 13 casos aprobados.

El primer intento de lectura remota fue rechazado con HTTP 401 por la sesión
OAuth vencida. Se renovó la autorización existente mediante Wrangler sin
imprimir credenciales ni ampliar acceso. No hubo mutación en ese intento.
A las `2026-09-30T16:32:32.311Z`, los ocho controles previos aprobaron el
alcance. Los diez pedidos conservados tenían SHA-256
`3897497e2b4982f99f6fb8eb56a7174085cea1f2875c7a142d1889945c743049`;
también se calcularon hashes de sus 25 líneas y cinco contactos.

El archivo importado tiene SHA-256
`751491d30918b89923a44840f9de0f9300f469b095f9c27b6b4ff3a817c479f1`.
El import productivo terminó `success`, 19 consultas, 11,71 ms, 3.534 filas
leídas y 64 escritas, bookmark
`00000906-00000008-000050f6-c432bd4cb8de24e12828e56233a2906f`.
No se repitió la mutación. A las `2026-09-30T16:34:52.922Z` se verificaron cero
registros del segundo alcance, cero pagos y cero violaciones FK. Los diez pedidos
y todas sus líneas/contactos conservaron exactamente sus hashes. El esquema
mantiene los 203 objetos y el mismo hash original, sin tablas transitorias.
La selección completa posterior volvió a evaluar los criterios del titular y
devolvió cero candidatos entre los diez pedidos restantes.

Resultado acumulado: siete solicitudes web y ocho órdenes eliminadas de la base
activa de Shekinah, con sus datos personales y relaciones operativas. Diez
pedidos ajenos conservados, ninguna intención legacy/web pendiente, cero pagos
registrados. La validación completa del alcance ampliado y la publicación del
registro se acreditan en el cierre siguiente.

## Cierre local del alcance ampliado

Controles del candidato final, Node 24.18.0 / npm 11.16.0:

| Control | Clasificación | Resultado |
| --- | --- | --- |
| npm ci e instalación Chromium | Verificado | Completados; lockfile sin cambios |
| Prueba dirigida de ambas operaciones | Verificado | 13 casos aprobados |
| npm run verify | Verificado | 125 archivos, 971 pruebas, 14 omitidas históricas y 47 E2E; controles completos aprobados |
| npm run build:pages | Verificado | 971 pruebas y todas las comprobaciones aprobadas; dist generado fuera del índice |
| Imports productivos y postchecks | Verificado | Dos imports success; siete solicitudes y ocho órdenes purgadas; otros diez pedidos y esquema íntegros |
| Mercado Pago de las tres órdenes Dux | Verificado | Dos consultas del agente y una confirmación humana actual; sin pagos informados |
| Mercado Pago de las cuatro órdenes legacy | No disponible por instrucción del titular | No ejecutado; el titular declaró ausencia de pagos y pidió omitir la consulta |
| Informe ampliado Chrome | No disponible | Failed to fetch; no se presenta como control aprobado |
| Ausencia de cambios en runtime, flags, secretos, bindings y migraciones | Revisado por código | Sólo SQL operativo, pruebas y documentación; UUID productiva exacta |

Antes de publicar se revisan el diff íntegro, las seis rutas explícitas, enlaces,
ausencia de credenciales/PII no autorizada/binarios/dist y los controles
`git diff --check` y `git diff --cached --check`. El índice no contiene capturas,
recibos privados ni artefactos temporales. El workflow conserva `contents: read`
y no ejecuta estos archivos contra una base remota.

La base `84846e61b8dfd06241fa702de930363870c281ad` tiene
[CI #559 aprobado](https://github.com/JerePrograma/shekinah/actions/runs/36728568602)
y Pages Production `a22d89d6-7e2b-470f-b71a-18873b2b43a3`, success sobre el mismo
SHA, comprobados de nuevo durante el cierre. El push del registro requiere
acreditar CI, jobs/artefacto y canonical Pages de su SHA final; esos recibos se
informan por separado al publicar. Un push no acredita por sí mismo deployment
ni nuevas capacidades comerciales. No se crean compras ni se prueba un cobro
aprobado/webhook real en esta limpieza.

## Continuidad comercial

Esta operación no amplía el circuito de liberación normal para reservas nunca
confirmadas de compradores. Sigue requiriendo un coordinador validado. Los
rechazos Dux `/v2/items` HTTP 400 y el timeout 524 de la reconciliación #235
registrados en [el diagnóstico](DUX_DIRECT_RESERVATION_2026-09-30.md) son una
incidencia independiente: limpiar pruebas no acredita corregir el proveedor ni
el scheduler. Se conservan flags, secretos, bindings, catálogo e inventario,
fallback WhatsApp autorizado, checkout legacy y Link de Pago retirados.
