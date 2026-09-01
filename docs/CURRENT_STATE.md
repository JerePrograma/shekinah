# Estado actual

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
