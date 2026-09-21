# Estado actual

## Retiro directo operativo hasta Checkout Pro — 2026-09-21

El SHA funcional `e788cba2904eed444afaf7763b2b5a96fdc14838` tiene CI aprobado y
Pages `b636b48a-dbec-4cd6-a9f0-4f71ac5d4b3d` publicado en `shekinah.ar`.
WEB, VITE_WEB, ASSISTED, DIRECT, COMMERCE y DUX_API están efectivamente en `true`;
`VITE_COMMERCE_ENABLED=false` conserva retirado el checkout legacy. Ambas D1
mantienen 0001–0024, sin reaplicar ni modificar migraciones.

El cliente de la prueba obtuvo una reserva Dux automática, total ARS 3.500 y
Checkout Pro con vendedor visible Shekinah, sin aceptar ni preparar el pedido
desde administración. Dux mantuvo stock real 14, reservó 1 y dejó disponible 13.
La recuperación y los POST repetidos conservaron una orden, una reserva y una
preferencia. El retorno mostró pago no confirmado: no hubo pago real.

La limpieza respetó la ventana financiera iniciada a las 05:26:37.034 UTC.
Mercado Pago confirmó cero pagos a las 05:56:47.847 UTC; la UI Dux anuló el pedido
00000001 y su API acreditó stock real 14, reservado 0 y disponible 14 a las
05:58:19.621 UTC. Falta registrar la liberación en Shekinah: Chrome empezó a
rechazar el certificado HTTPS del dominio, también en una pestaña nueva.
La última lectura D1 mantiene la reserva local `confirmed`, sin operación release.
No repetir la anulación ni escribir D1; seguir el
[registro operativo](validation/DIRECT_CHECKOUT_PRODUCTION_2026-09-21.md).
A las 05:52 UTC se observaron cero preparaciones,
revisiones e incidencias financieras/Dux. La reconciliación de 862 productos
terminó sin fallas a las 05:12:17.220 UTC; el snapshot volvió a quedar obsoleto
porque el scheduler no cumple su cadencia. El umbral sigue en 900 segundos y la
compra directa verifica Dux en vivo. Persisten HTTP 400 intermitentes del proveedor
y cotización previa de Correo; WhatsApp es coordinación opcional.

Los estados fechados siguientes son históricos; no representan una instrucción
para cerrar la compra directa vigente ni para introducir un gate administrativo.

## Compra directa autorizada — 2026-09-15

La ampliación descrita en [DIRECT_CHECKOUT.md](DIRECT_CHECKOUT.md) incorpora preparación automática de retiro, stock y precio Dux en vivo, reserva única, total confirmado y Checkout Pro, con migración 0024 autorizada por el titular. El SHA funcional `f642b76fbcdd55613d09fc908275cd8ecb75cf7b` está publicado con CI y Pages aprobados. Ambas D1 tienen 0001–0024 contiguas, sin pendientes, 35 objetos y 21 columnas críticos verificados, foreign keys válidas y bookmarks previos preservados.

A las 17:37 UTC, WEB está abierto y su prueba persistente e idempotente quedó rechazada por el flujo administrativo, sin orden ni reserva. ASSISTED se abrió y volvió a cerrar al no poder acreditar su smoke: Dux respondió «acceso duplicado» al abrir Nuevo Pedido, aunque el tablero seguía visible. DIRECT y COMMERCE permanecen cerrados. El diagnóstico confirma cero solicitudes pendientes y cero operaciones Dux comerciales; advierte que el catálogo de 754 productos volvió a quedar obsoleto. La reserva real, Checkout Pro sin cobro y la cadencia efectiva del scheduler siguen pendientes. No declarar el producto comercial terminado. Los recibos, horas y pasos de continuación están en [el registro de validación](validation/DIRECT_CHECKOUT_2026-09-15.md). Las secciones de fechas anteriores conservan su valor histórico.

## Activación reanudada; cadencia Dux y Mercado Pago pendientes — 2026-09-14

El [registro de activación](validation/COMMERCE_ACTIVATION_2026-09-14.md) acredita ambas D1 nuevamente, el diagnóstico Dux publicado en `bffec969d27c4bd03450b3617c8f5681b85321ab`, CI/Pages verdes y un catálogo real de 754 productos. El scheduler GitHub quedó habilitado con autorización explícita; su workflow manual terminó correctamente, incluidas las 754 fichas, pero la cadencia automática todavía requiere evidencia. La primera apertura WEB se revirtió al impedir el certificado local Fortinet la verificación posterior. Chrome acreditó después HTTPS seguro y sesión administrativa; tras recuperar el control en una pestaña nueva, la prueba del usuario quedó rechazada por el flujo soportado y auditada a las 12:57 UTC, sin reserva ni orden asistida. ASSISTED y COMMERCE siguen cerrados y la credencial Mercado Pago requiere entrada del titular. El agente no creó transacciones de prueba. Este registro actualiza los bloqueos del 13 de septiembre sin borrar su evidencia.

## D1 0020–0023 verificada; activación comercial pendiente — 2026-09-13

Preview y Production tienen 0001–0023 contiguas, sin pendientes, 14 objetos y 15 columnas críticas, foreign keys válidas y datos históricos conservados. El cierre por import oficial, los bookmarks, el fix mínimo del self-test PowerShell 5.1 y la evidencia de CI/Pages están en [el registro del rollout](validation/COMMERCE_D1_ROLLOUT_2026-09-13.md). Los flags comerciales permanecen cerrados: faltan sesión administrativa, refresco Dux y smokes reales. La intermediación TLS Fortinet de la red local impidió acreditar el acceso canónico. No confundir cierre de D1 con producto comercial activo; las secciones anteriores en el tiempo que siguen conservan su carácter histórico.

## Catálogo Dux exclusivo y preparación editorial — 2026-09-08

La programación Dux vuelve a GitHub cada cinco minutos después de que el intento Cloudflare no registrara eventos dentro de los plazos observados. El relay se conserva sin programación; la transición operativa debe confirmar primero cero crons Cloudflare y después abrir el gate GitHub. La frecuencia efectiva y la muestra de cuatro ejecuciones siguen requiriendo evidencia independiente.

La observación productiva del 2026-09-08 detectó respuestas HTTP 503 de Cloudflare con código 1102 al leer el catálogo completo. El lector público de snapshots que ya incluyen cantidades por depósito evita releer y analizar toda la generación de inventario: usa las cantidades y fecha del mismo snapshot Dux completo. La compatibilidad con snapshots Dux anteriores conserva la lectura de inventario, sin catálogo manual. La corrección debe acreditarse en remoto dentro de Workers Free; no equivale por sí sola a cumplir el cron.

El listado público y sus fichas no admiten bootstrap local aunque falte el marcador de retiro. El administrador permanece en lectura y las rutas de creación, edición, stock e imágenes manuales rechazan operaciones con autenticación, origen y auditoría intactos. El navegador exige schema 2, identidad Dux y categorías explícitas. Los archivos y pruebas históricas se conservan en Git; las pruebas operativas de alta/edición se sustituyen por rechazo y lectura Dux. Sólo las fotos y descripciones preservadas por 0018 pueden aportar contenido local.

La incorporación editorial está implementada detrás de un flag cerrado conforme a [MERCADO_LIBRE_EDITORIAL.md](MERCADO_LIBRE_EDITORIAL.md). El titular de HERBOLARIOMDP debe autorizar una aplicación oficial; el usuario confirmó que no tiene acceso a esa cuenta. Las importaciones, asociaciones nuevas, administración conectada, cuota real y ejecución diaria no están acreditadas. No confundir las pruebas simuladas con acceso al proveedor. El informe externo registra por separado la migración, CI y deployments finales.

## Implementación de depósitos y frescura — 2026-09-08

El código sigue el contrato de [todos los depósitos y antigüedad del inventario](DUX_STOCK_ALL_WAREHOUSES.md). Descubre depósitos habilitados de la empresa, conserva cantidades parciales sin inventar totales y distingue inicio de lectura y publicación. La programación prevista se traslada a Cloudflare cada cinco minutos, con inventario y retiro manual protegidos. Esta sección describe implementación; CI, deployments, activación y cuatro ejecuciones automáticas consecutivas requieren evidencia operativa aparte. El acceso editorial Mercado Libre sigue pendiente de acreditación y no se reactiva su inventario.

## Prioridad vigente: retiro manual — 2026-09-07

El usuario autorizó eliminar todos los productos manuales y conservar las fotos/descripciones ya vinculadas a Dux. El contrato vigente está en [Retiro manual y stock Dux](DUX_MANUAL_CATALOG_RETIREMENT.md). La migración 0018 prepara contenido editorial independiente y un retiro atómico; después del retiro no se reconstruye el catálogo compilado, el administrador lista Dux y las fichas muestran stock real, reservado y disponible con fecha de lectura. Las compras permanecen cerradas. Los conteos de 510/513 productos manuales y el rollback a catálogo local que aparecen más abajo son históricos. CI, deployment y operaciones remotas se acreditan por separado en los recibos del nuevo informe.


## Activación autorizada: diagnóstico remoto — 2026-09-07 UTC

La ejecución parte de `a18eb73235fe6e5f7657c0acf404a276722abf35`, CI `34067956579` exitoso y deployment Pages de producción `89f1392c-8221-4c5b-aea2-9df087928464` del mismo SHA. La inspección remota comprobó Preview con migraciones `0001`–`0015`, sin tenant ni inventario, y producción con `0001`–`0014`, tenant `12862 / 1 / 25566` e inventario de 749 filas. No confundir estas filas con un catálogo v2 publicado: la API pública todavía respondió `legacy-bootstrap` en ese punto.

El scheduler GitHub estaba habilitado y su última corrida observada había sincronizado inventario. Se pausó el gate antes de la operación controlada y se verificó ausencia de corridas pendientes. El runner anterior no exigía publicación de catálogo; la corrección exige evidencia del mismo run y no reintenta Dux ante una confirmación inconsistente. El script permite ahora el bootstrap oficial de Preview vacío, sin insertar tenant manual ni debilitar los guards del servidor.

La autorización vigente permite completar Preview y después producción según [DUX_COMPLETE_CATALOG.md](DUX_COMPLETE_CATALOG.md), con comercio cerrado. Esta sección acredita el diagnóstico inicial y las correcciones; migraciones, activación, recibos, SHA final y comprobación canónica se acreditan por separado en el informe operativo externo. Se conservan los estados históricos que siguen.

## Iteración de catálogo completo — 2026-09-06

La base de esta iteración es `60bdbb62db4e39f1639978f422db0516745cec9c`. El código separa colección, catálogo público y corte comercial mediante tres controles que nacen en `0`; agrega `0017` y snapshot v2 con precios explícitamente no disponibles; conserva todos los códigos Dux habilitados y el triage 135/294/318. Los 318 descartan enriquecimiento local, nunca el producto Dux. Dux determina nombre, SKU, precio/estado, stock y categorías; local sólo imágenes/descripción autorizadas. Mercado Libre aporta cero evidencias en el baseline y no es autoridad.

El procedimiento vigente y el rollback sin revertir migraciones están en [DUX_COMPLETE_CATALOG.md](DUX_COMPLETE_CATALOG.md). El script operativo tiene validación local por defecto, Preview separada y Production condicionada a Preview verde y confirmación explícita. Esta iteración de código no aplica D1 remoto, no ejecuta sync ni activa flags productivos. CI y deployment del nuevo SHA deben acreditarse por separado en el informe de cierre. Las secciones de fecha anterior conservan el estado histórico y no sustituyen este contrato vigente.

Fecha de revisión: 2026-09-01.

## Decisión de inventario

Dux Software reemplaza al stock local y a Mercado Libre como autoridad de inventario:

- Dux: identidad externa, cantidades, depósitos, unidad/medida, pedidos/reservas y sincronización Mercado Libre;
- Shekinah: catálogo editorial, precio actual, carrito, orden local y coordinación;
- Mercado Pago: Checkout Pro, pago y webhook;
- Mercado Libre: sincronizado por Dux, sin integración directa de stock desde Shekinah.

No se usa Excel. No se copian 1.525 productos manualmente. No se infiere unidad, peso, divisibilidad o presentación desde nombres. Las cantidades Dux se preservan exactamente como números finitos y no se redondean ni convierten.

## Código preparado

El candidato incorpora:

- cliente server-side Dux API v2 con Bearer;
- lecturas oficiales de empresas, sucursales, depósitos e items;
- paginación con total estable y conteo final exacto, validación defensiva, timeout, rate limit de una solicitud cada cinco segundos y retry limitado de lecturas;
- `redirect: 'manual'`, rechazo explícito de todo `300`–`399` sin seguimiento y diagnóstico v2 sanitizado;
- `migrations/0012_dux_authoritative_inventory.sql` para contexto, sync, snapshot/mapping y trazabilidad futura de pedidos;
- `migrations/0013_remove_local_catalog_stock.sql` para retirar los contadores locales del catálogo activo y exigir snapshot Dux exacto en toda línea comercial nueva;
- `migrations/0014_dux_atomic_inventory_snapshots.sql` para cargar deltas aislados y publicar sólo estados completos;
- mapping con estados `mapped`, `unmapped` y `ambiguous`, bootstrap conservador con vetos de presentación/ID y todavía pendiente de validación contra un snapshot real;
- proyección D1 read-only sin convertirla en autoridad;
- backoffice Dux de diagnóstico y stock no editable;
- scheduler Dux read-only desactivado por default;
- retiro funcional de OAuth, sync, webhook y reserva directa Mercado Libre;
- guard fail-closed de Checkout Pro y WhatsApp.

El runtime de stock local fue retirado: las APIs no lo aceptan ni lo proyectan, el catálogo generado no publica cantidades locales, la UI administrativa no permite editarlas y los flujos comerciales no pueden consumirlas. El esquema y las líneas de pedidos históricos se conservan únicamente para compatibilidad y auditoría; `0013` elimina esos contadores de los documentos editoriales activos y bloquea su reintroducción.

## API Dux implementada

```text
Base: https://erp.duxsoftware.com.ar/WSERP/rest/services
Autenticación: Authorization: Bearer <token>
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
```

No se implementan mutaciones contra endpoints no documentados. Aunque la documentación pública expone `POST /v2/pedidos` y `GET /v2/pedidos`, el candidato no crea pedidos porque no existe evidencia pública suficiente de cancelación/liberación/finalización o expiración segura.

## Bloqueos externos

### Acceso oficial y transporte

El 2026-09-01 se verificó el token mediante llamadas autenticadas a la API oficial. Sin imprimirlo ni persistirlo, se obtuvo una empresa (`12862`), una sucursal (`1`), un depósito habilitado (`25566`) y 743 items; 27 cantidades disponibles eran fraccionarias y 8 no positivas. La lectura acredita acceso efectivo, pero no el nombre comercial del plan.

Desde Pages Functions la reconciliación no superó la primera lectura. Tres sync productivos terminaron `DUX_UNAVAILABLE` con cero items procesados. La instrumentación `f138820` clasificó el tercer fallo como:

```text
kind=fetch_exception
endpoint=/v2/empresas
providerStatus=null
attempts=3
```

Los tres fallos permanecen como evidencia histórica. Un diagnóstico aislado posterior comprobó que `redirect: 'error'` producía la excepción antes de headers, mientras `redirect: 'manual'` permitía clasificar la respuesta. El candidato adopta el modo manual, no sigue redirecciones y rechaza explícitamente todo `3xx`; falta desplegarlo y verificarlo dentro de Pages Functions con el token cifrado ya configurado.

El token permanece únicamente como secreto cifrado. El estado remoto continúa con `DUX_API_ENABLED=false` hasta publicar, migrar y ejecutar el sync controlado.

### Semántica de cantidades

`GET /v2/items` publica cantidades de stock y algunos identificadores, pero no publica de forma suficiente:

- unidad de medida;
- pesabilidad;
- divisibilidad;
- soporte o paso de cantidad decimal.

Por eso ninguna cantidad observada habilita por sí sola una cantidad de carrito. La proyección marca esa semántica como no verificada y falla cerrada.

### Lifecycle de pedidos

La API pública revisada no documenta un mecanismo seguro para:

- cancelar/anular y liberar reserva;
- finalizar/confirmar consumo;
- expirar reservas abandonadas;
- reconciliar de manera concluyente un timeout mutante;
- garantizar idempotencia o rechazo atómico por stock insuficiente.

Éste es un hard blocker productivo. El backend no crea pedido Dux, preferencia Mercado Pago ni pedido WhatsApp.

La migración `0012` aplica un hard block adicional en D1: impide líneas y cambios de estado para pedidos vinculados a Dux y pone en cuarentena órdenes históricas con productos ya asociados a una identidad/candidata Dux. Webhook, conciliación y expiración también los excluyen; los flujos legacy sólo continúan sin relación Dux.

### Mapping

El contrato exige vínculo persistido, código externo, SKU, barcode exacto único y nombre sólo durante bootstrap. El último paso construye una clave conservadora con NFKC, espacios, diacríticos preservando `ñ` y equivalencias de cantidad únicamente para tokens completos reconocidos; contradicciones entre nombre, presentación e ID histórico lo vetan. No elimina puntuación arbitraria ni aplica singularización, sinónimos, fuzzy matching, coincidencias parciales o aritmética de packs. Sólo corre con `kind=initial` e inventario visible vacío. El catálogo local no posee un campo barcode independiente, por lo que esa comparación reutiliza SKU/variant SKU y debe auditarse con datos reales.

La clave sirve sólo para identidad y no infiere semántica comercial ni transforma stock. Como los tres sync fallaron antes de procesar items, no existe mapping productivo que limpiar ni evidencia remota para declarar el algoritmo validado. El scheduler permanece desactivado.

## Flags

Defaults seguros versionados:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

El scheduler exige además `DUX_RECONCILIATION_ENABLED=true` en GitHub. No debe configurarse todavía.

La configuración efectiva final de production y preview también conserva `DUX_API_ENABLED=false`, `COMMERCE_ENABLED=false`, `VITE_COMMERCE_ENABLED=false`, `MERCADO_LIBRE_CATALOG_ENABLED=false` y `VITE_MERCADO_LIBRE_CATALOG_ENABLED=false`. La reconciliación GitHub permanece deshabilitada.

## Producto y UX

Shekinah conserva el catálogo editorial, carrito, páginas públicas, backoffice, imágenes R2, privacidad y analítica. Para inventario Dux:

- cero o negativo: agotado;
- mapping ausente o ambiguo: producto preservado, no vendible;
- semántica de unidad no verificada: no vendible;
- Dux caído y snapshot obsoleto: no vendible temporalmente;
- refresh en curso: feedback visible sin borrar el carrito.

El comprador no ve IDs Dux, depósito técnico, token o error crudo. El administrador ve estado de vínculo, cantidad observada, depósito, fecha y error sanitizado. El stock Dux es sólo lectura.

No existe snapshot productivo. El catálogo editorial se preserva, pero ningún producto queda habilitado por Dux mientras el estado sea ausente.

## Mercado Pago

La integración Checkout Pro existente mantiene cálculo server-side, `external_reference`, metadata, webhook firmado, consulta autoritativa e idempotencia. Sin embargo, la creación de preferencia está bloqueada antes de llamar a Mercado Pago hasta que Dux pueda reservar y compensar con seguridad.

No se ejecutó un pago real ni se creó una preferencia vinculada a Dux. La aplicación autorizada sigue siendo `Shekinah`, Application ID `7373984348988262`, sin exponer credenciales.

## Mercado Libre

La integración directa de inventario está retirada. Los flags permanecen en `false`; los endpoints históricos no sincronizan ni mutan stock y el scheduler anterior fue reemplazado por uno Dux read-only desactivado.

La tienda `HERBOLARIOMDP` y seller ID `445638367` continúan bajo la integración propia Dux ↔ Mercado Libre. El valor no se interpreta como ID Dux.

## Persistencia

Las migraciones `0010_checkout_terminal_reservation_release.sql`, `0011_local_order_stock_required.sql`, `0012_dux_authoritative_inventory.sql` y `0013_remove_local_catalog_stock.sql` fueron aplicadas primero en preview y después en producción, con bookmarks de Time Travel previos. En ambos entornos se verificaron nombres, esquema, triggers, conteos preservados, ausencia de migraciones pendientes y cero violaciones de claves foráneas.

`0013` retiró los triggers legacy de reserva/consumo local, agregó guards contra nuevos payloads locales y exige que las líneas comerciales nuevas referencien una versión exacta y vigente de `dux_inventory_items`. Preview conservó 14 pedidos, 14 líneas y una fila de pagos. Producción conservó 15 pedidos, 30 líneas, 21 mutaciones editoriales y cero pagos; seis payloads activos fueron saneados y el conteo de `stockQuantity`, `reservedQuantity` o `availableQuantity` quedó en cero.

Producción conserva tres ciclos Dux fallidos y cero items procesados. No hay snapshot, contexto de tenant, inventario ni vínculos de pedidos Dux. No se crearon pedidos, pagos o reservas Dux durante la configuración.

El esquema versionado ahora incluye `0014`, que carga en `dux_inventory_generation_items` sólo filas nuevas, cambiadas o recién ausentes bajo una generación `loading`. Antes de staging reserva un presupuesto conservador por día UTC; un único batch aplica el delta a `dux_inventory_items`, publica generación y frescura global, actualiza tenant/run y limpia staging; el trigger coteja `changed_count` e `item_count`. Una corrida idéntica no reescribe inventario y una falla conserva la publicación anterior. El cliente limita deadline, intentos y payload antes de superar contratos Free/D1. `0014` todavía no está aplicada en preview ni producción y debe migrarse, con bookmarks y auditoría, antes de habilitar Dux.

Las migraciones, órdenes, pagos, auditoría, catálogo, imágenes y tablas históricas Mercado Libre existentes se preservan.

## Cloudflare y GitHub

La arquitectura continúa sobre Cloudflare Pages, Pages Functions, D1 y R2, rama `main` del repositorio `JerePrograma/shekinah`. El workflow de reconciliación Dux usa el environment GitHub `cloudflare-pages-production`, pero permanece condicionado a una variable explícita desactivada.

El cierre partió de `d723f250ec3ef84abfa78bf66675248271106326`. La instrumentación `f138820` aprobó CI `#416` y quedó publicada en el deployment productivo canónico `8781412e-629b-4473-8081-89c6fbc1ffec`. Pages usó Node.js `24.18.0` y npm `11.6.0`: se deshabilitó la instalación automática mediante `SKIP_DEPENDENCY_INSTALL` y se fijó explícitamente el comando de instalación. El build concluyó correctamente.

El deployment exitoso no acredita un sync Dux: el diagnóstico confirmó una excepción de transporte, no existe snapshot y todos los flags comerciales permanecen cerrados.

## Calidad

Entorno canónico:

- Node.js `24.18.0`;
- npm `>=11.0.0`;
- TypeScript estricto;
- ESLint;
- Vitest;
- Playwright;
- verificadores de catálogo, seguridad y automatización.

CI `#416` y el build de Pages del SHA `f138820` concluyeron correctamente. Esta fase aprobó localmente `npm ci`, instalación de navegadores, `npm run verify` y `npm run build:pages` con Node.js `24.18.0` y npm `11.6.0`: 358 pruebas aprobaron, 14 históricas quedaron omitidas y Playwright aprobó 25 de 25. Los checks Git aún deben repetirse sobre el diff definitivo. Persisten dos vulnerabilidades altas preexistentes y warnings conocidos de chunk/peso editorial. CI y deployment deben verificarse sobre el SHA documental final después del push.

## Separación de estados

Toda continuidad debe distinguir:

1. código integrado;
2. validación local;
3. commit y push;
4. GitHub Actions;
5. deployment Pages;
6. migraciones `0010`–`0013` ya aplicadas;
7. migración `0014` versionada y pendiente de aplicación remota;
8. secrets y variables Dux;
9. acceso API real;
10. mapping real;
11. lifecycle de reserva/liberación/finalización;
12. sandbox Mercado Pago;
13. activación productiva y pago autorizado.

Ninguna etapa demuestra automáticamente la siguiente. Código local, secretos, IDs y migraciones están verificados; el mapping está corregido por código pero no validado con datos remotos, y snapshot, unidades y lifecycle no están disponibles. El estado productivo actual es **fail-closed**, con Dux API, comercio, Mercado Libre directo y scheduler deshabilitados.
