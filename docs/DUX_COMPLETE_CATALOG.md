# Catálogo Dux completo y publicación segura

## Actualización posterior — retiro manual del 2026-09-07

El usuario autorizó eliminar todos los productos manuales y conservar sólo sus fotos/descripciones ya vinculadas a Dux. Rige [DUX_MANUAL_CATALOG_RETIREMENT.md](DUX_MANUAL_CATALOG_RETIREMENT.md). Una vez registrado el retiro de 0018, deshabilitar la publicación devuelve un catálogo vacío; no restaura productos locales. El procedimiento de activación y rollback que sigue conserva su valor histórico y no debe reutilizarse para revertir el retiro.

## Alcance de esta iteración

La iteración parte de `60bdbb62db4e39f1639978f422db0516745cec9c` (`feat: persist Dux editorial links safely`). Prepara código, pruebas, documentación y un procedimiento operativo. Su publicación Git y su deployment Pages no aplican migraciones D1 ni habilitan capacidades remotas.

Dux es la autoridad de existencia, nombre, código/SKU, precio y estado de precio, stock y categorías. El catálogo local sólo puede aportar imágenes y descripción mediante vínculos editoriales explícitos. Las presentaciones, descripciones cortas, precios, categorías y disponibilidad locales no se copian al producto Dux. La colección local canónica de 510 productos y 16 categorías se conserva como inventario editorial; no determina el tamaño del universo Dux.

La SPA, History API, activos autorizados, autenticación administrativa, same-origin, auditoría y bloqueos de comercio se conservan. No se habilitan Checkout Pro, WhatsApp transaccional, reservas ni mutaciones de stock. `checkoutEligible` permanece en `false` para todos los productos Dux.

## Tres controles independientes

| Control D1 | Propósito | Requisito para habilitarlo | Valor inicial |
| --- | --- | --- | --- |
| `snapshot_collection_enabled` | Permite recolectar y sustituir la proyección Dux | Tenant y lectura Dux válidos | `0` |
| `public_catalog_enabled` | Selecciona Dux para la API y UI públicas | Snapshot válido y no vacío; confirmación explícita | `0` |
| `public_cutover_enabled` | Reserva el corte comercial/transaccional | Precios usables y contratos comerciales completos | `0`; permanece cerrado |

Crear o aplicar `0017`, importar cualquiera de los manifiestos o recolectar un snapshot no habilita el catálogo público. Habilitar el catálogo no habilita comercio. `public_cutover_enabled` no selecciona el universo público y no se activa desde el flujo de publicación de esta iteración.

Con `public_catalog_enabled=0`, el runtime conserva el catálogo local. Con `public_catalog_enabled=1`, publica todos los códigos habilitados del último snapshot Dux válido, tengan o no vínculo editorial. Un nuevo código aparece Dux-only; un código retirado o deshabilitado desaparece al publicar el siguiente snapshot. Los vínculos huérfanos no crean productos y los productos exclusivamente locales no aparecen.

## Precio explícito y proyección v2

`0017_dux_complete_public_catalog.sql` agrega una proyección `dux_catalog_snapshots_v2`, con payload `schemaVersion=2`, sin reescribir las migraciones publicadas `0015` y `0016`. La fotografía anterior se conserva. El payload registra `priceAmount: number | null` y un `priceStatus` obligatorio; el contrato público expone `price: { amount, currency: 'ARS' } | null` y `priceStatus` obligatorio.

| `priceStatus` | Interpretación de la respuesta actual Dux | Precio público |
| --- | --- | --- |
| `usable` | Una entrada válida de `PRECIOS DEL NEGOCIO`, finita, mayor que 2 y con hasta dos decimales | Importe Dux en ARS |
| `placeholder` | Importe exactamente 1 o 2 | `null`; «Consultar precio» |
| `missing_or_zero` | Lista/entrada ausente o importe cero | `null`; «Consultar precio» |
| `invalid` | Tipo inválido, negativo, duplicidad incoherente o precisión inválida | `null`; «Consultar precio» |

Un error de precio conserva el producto dentro del snapshot. Una identidad crítica inválida o duplicada aborta la nueva fotografía y conserva la anterior. Los precios no usables no pueden agregarse al carrito, no tienen oferta sin precio base y nunca reciben un fallback local o Mercado Libre. La visibilidad pública admite estos estados; los guards transaccionales permanecen estrictos.

La evidencia histórica tiene 592 precios usables, 87 placeholders y 68 ausentes/cero: 155 no usables entre 747 productos. Es una comparación de regresión, nunca una semilla de precios ni un límite fijo para snapshots futuros.

Los subrubros se identifican dentro de su rubro Dux: `dux-rubro-{rubroId}-subrubro-{subrubroId}`. Dux puede reutilizar un ID de subrubro en rubros distintos; los nombres se conservan literalmente. Si no hay rubro, se conserva `dux-subrubro-{subrubroId}`. Nombres contradictorios para la misma identidad completa siguen bloqueando una fotografía nueva sin reemplazar la anterior.

## Triage editorial

El manifiesto determinista `catalog/internal/dux-editorial-triage-v1.json` procede del directorio de evidencia original validado. Conserva los hashes de fuente, los códigos y los candidatos permitidos como evidencia editorial; sus nombres y conteos históricos no gobiernan el runtime comercial.

| Disposición inicial | Cantidad | Publicación mientras no exista aprobación manual |
| --- | --- | --- |
| `auto_confirmed` | 135 | Puede reutilizar exclusivamente los campos autorizados del vínculo activo |
| `pending_manual_review` | 294 | Dux-only; candidato no equivale a decisión |
| `discarded_enrichment` | 318 | Dux-only; descarta el enriquecimiento, conserva el producto Dux |

Los 747 códigos son únicos y las tres disposiciones no se solapan. `dux_editorial_triage` representa evidencia y revisión; `dux_editorial_links` representa decisiones activas. La importación fija autenticada y same-origin no acepta CSV ni mappings enviados por el cliente. Repetirla conserva clasificación y decisiones sin crear duplicados.

La revisión filtra, busca y pagina los casos pendientes. Aprobar exige un candidato permitido y existente, campos editoriales válidos y unicidad activa 1:1; vínculo y resolución se guardan de manera atómica. Rechazar/descartar mantiene el producto Dux-only. Para cambiar un vínculo se desactiva explícitamente el anterior. Fuzzy, ambiguos y diferencias de presentación nunca se autoaprueban.

Mercado Libre sólo puede aportar evidencia auxiliar de identidad mediante filas históricas válidas del seller esperado. El baseline observado aporta **0 evidencias Mercado Libre**. No se reactiva su integración ni se hacen llamadas públicas al proveedor; esa ausencia no bloquea el catálogo ni resuelve casos manuales.

## Publicación posterior al commit

El único script operativo es `scripts/finalize-dux-catalog.ps1`. Su fase por defecto, `Validate`, es local: verifica sintaxis, archivos y manifiestos; no solicita credenciales, no usa red y no ejecuta migraciones, importaciones, sincronizaciones o activaciones.

```powershell
pwsh -NoProfile -File .\scripts\finalize-dux-catalog.ps1 -Phase Validate
```

Las fases remotas no se ejecutan durante la iteración de código. Antes de autorizarlas deben estar comprobados el commit y push sobre `main`, CI verde y deployment Pages del mismo SHA. El script vuelve a comprobar `HEAD`, el `main` remoto real y el último CI del SHA exacto. No cambia variables de Pages ni despliega; exige una configuración externa autorizada para la lectura Dux y conserva los flags de comercio y Mercado Libre cerrados.

Requisitos para una futura fase remota:

- PowerShell 7, Node exacto de `.node-version`, GitHub CLI autenticado y Wrangler ya disponible; se aceptan rutas explícitas de ambos ejecutables;
- cuenta Cloudflare, UUID D1 y deployment concretos, origen HTTPS del entorno, sucursal y depósito verificados y directorio de evidencia fuera del repositorio;
- token Cloudflare con lectura de Pages y acceso a la D1 elegida, tomado de `CLOUDFLARE_API_TOKEN` o solicitado con `Read-Host -AsSecureString`;
- usuario y contraseña de la administración de ese entorno, solicitados en consola, o `-AdminSessionCookie` como `SecureString` de una sesión existente cuya reutilización haya autorizado el operador; no se guardan ni imprimen contraseña, cookies o tokens;
- `DUX_API_ENABLED=true` ya autorizado en la configuración del entorno para permitir la lectura; el script comprueba tenant, binding `DB`, base separada y los cuatro flags de comercio/Mercado Libre en `false`;
- migraciones `0001`–`0014` ya verificadas; un tenant existente debe coincidir exactamente con empresa, sucursal y depósito. Su ausencia sólo se admite con inventario vacío, para que el único sync oficial lo verifique y publique;
- tres controles en `0` al iniciar y conteos esperados explícitamente revisados para la fecha de operación.

No usar transcripciones de consola que capturen secretos. El script guarda sólo recibos sanitizados, hashes, IDs operativos, conteos y bookmark. El token se mantiene en memoria y en el entorno del proceso Wrangler durante la operación; después restaura los valores previos.

Cada invocación realiza una sola fase. Preview utiliza `shekinah-commerce-preview` y una URL del deployment bajo `*.shekinah-7dl.pages.dev`; Production exige `shekinah-commerce` y `https://shekinah.ar`. La configuración temporal de Wrangler contiene únicamente la D1 seleccionada y copias exactas de `0015`, `0016` y `0017`, para impedir que se apliquen migraciones ajenas. Los archivos y el recibo quedan en el directorio de evidencia, fuera de Git.

Si la red del operador intercepta el certificado canónico y no permite validarlo, Production admite `-RequestOrigin` con la URL HTTPS inmutable del **mismo deployment productivo canónico** verificado por Cloudflare. No admite otro deployment, alias de rama, otro entorno ni un dominio arbitrario. `SiteOrigin` conserva `https://shekinah.ar`; URL, cookie y encabezado `Origin` administrativos usan el transporte efectivo, sin alterar Host, SNI ni validación TLS.

El script no busca credenciales del navegador ni del entorno. La reutilización de una sesión requiere proporcionar explícitamente `-AdminSessionCookie` en memoria. Sólo crea la cookie `__Host-shekinah-admin`, Secure y HttpOnly, para el host verificado; consulta `/api/admin/auth/session` y exige una identidad autenticada mediante contraseña antes de cualquier migración. Una firma rechazada, sesión vencida, formato inválido o identidad diferente detiene el procedimiento sin solicitar otra contraseña ni mutar D1. La sesión reutilizada no se cierra al terminar; el proceso descarta su copia. El ingreso normal conserva `Read-Host -AsSecureString` y el cierre de la sesión que creó.

El recibo diferencia el dominio público del transporte. Con transporte alternativo, el éxito de la fase operativa deja `canonicalHttpsVerified=false` y `canonicalVerification=pending_external`. Ese recibo no acredita el dominio canónico ni permite declarar producción finalizada. Después del corte debe comprobarse `https://shekinah.ar/api/catalog` desde un cliente estándar externo y compararse su versión y digest con D1; la evidencia del workflow y el informe final completan esa comprobación independiente.

El operador pasa `-Phase Preview`, `-ExpectedCommit`, `-AccountId`, `-DatabaseId`, `-DeploymentId`, `-SiteOrigin`, `-ExpectedBranchId`, `-ExpectedDepositId`, `-EvidenceDirectory`, `-WranglerPath` y `-GitHubCliPath` con valores verificados. Los defaults de conteo corresponden exclusivamente al baseline 747/592/87/68/0; un cambio real en Dux exige revisar y proporcionar `-ExpectedItems`, `-ExpectedUsable`, `-ExpectedPlaceholder`, `-ExpectedMissingOrZero` y `-ExpectedInvalid`. Un conteo inesperado detiene la fase; el script no lo acepta silenciosamente ni descarta productos para ajustarlo.

La secuencia es:

1. Verificar SHA, CI, deployment, entorno, D1 y cualquier tenant existente; autenticar al administrador y conservar un bookmark Time Travel previo. Si falta el tenant, exigir inventario vacío; nunca insertar una fila manualmente.
2. Aplicar sólo `0015`–`0017`; verificar su registro, `foreign_key_check` y los tres controles en `0`.
3. Verificar los controles mediante la sesión autenticada; registrar los IDs del catálogo local para comprobar rollback.
4. Habilitar colección y ejecutar **una sola** sincronización administrativa Dux read-only. El bootstrap verifica el tenant contra Dux y lo publica mediante el flujo oficial. No hay reintento automático ante un fallo o timeout.
5. Exigir tenant persistido correcto; verificar snapshot v2, frescura, run, códigos únicos, conteos de precio y `checkoutEligible=0`.
6. Importar los 135 vínculos dos veces y el triage dos veces; verificar idempotencia y 135/294/318 sin decisiones inesperadas.
7. Habilitar catálogo con confirmación; comprobar igualdad exacta entre universo público y snapshot, nombre/precio Dux y comercio cerrado.
8. Deshabilitar catálogo; comprobar retorno al catálogo local, conservación de snapshot/triage/vínculos y claves foráneas.
9. Rehabilitar sólo después de aprobar todas las comprobaciones, repetir el smoke público y emitir recibo `passed`.

Production repite esa secuencia en otra invocación. Exige `-PreviewReceipt` apuntando al recibo verde de Preview, mismo SHA/cuenta/tenant/hashes, D1 distinta y antigüedad máxima de 24 horas. Además requiere escribir en consola la frase exacta de autorización que incluye el SHA. Production nunca es la fase por defecto ni se ejecuta automáticamente al terminar Preview. Un recibo es evidencia operativa local y debe preservarse íntegro; no sustituye la autorización del operador.

Las rutas API y el flujo se basan en los contratos del repositorio. El comando oficial de [migraciones Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply) aplica sólo los SQL pendientes de la configuración aislada. Los bookmarks se obtienen con la API oficial de [Time Travel](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/); la identidad de Pages se verifica mediante la [API de deployment](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/).

## Rollback e incidentes

El commit `6f6bba6` aprobó CI y ambos deployments. Preview completó el procedimiento, pero la comprobación adicional volvió a fallar después de 113 fichas con HTTP 503; el tail confirmó `exceededCpu` a 10 ms. Se cerraron los controles, conservando los datos y recibos. El usuario pidió continuar dentro del plan gratuito. Se elimina la validación repetida del mismo payload mediante un único resultado de parseo inmutable y acotado: sólo se reutiliza si el texto JSON completo y su digest coinciden exactamente con los ya validados. Cada petición sigue leyendo D1 y verifica run, versión, conteo y fecha; controles, inventario, frescura y decisiones editoriales no se cachean. Un byte o digest diferente exige nueva validación completa y SHA-256. Una fila ausente o inválida no usa la copia previa como fallback. No se contrata Workers Paid ni se agregan servicios o migraciones. La aceptación sigue dependiendo de pruebas y recorridos públicos remotos, no de la medición local.

La corrección `2b44ede` aprobó CI y ambos deployments; un nuevo ciclo Preview aprobó imports, snapshot, rollback y reactivación después de preservar un rechazo transitorio Dux. El recorrido adicional de fichas se detuvo tras 30 detalles por otro 1102. El tail de Cloudflare confirmó `exceededCpu` a los 10–11 ms, incluso en una primera petición que sólo debía devolver 404. Se volvió a cerrar Preview; Production y scheduler ya estaban cerrados. Se difiere la validación de activos y manifiestos estáticos hasta su uso, memoizando sólo datos compilados inmutables, y cada ficha Dux lee el inventario por código y únicamente su fuente editorial. El snapshot completo sigue validándose, incluido su SHA-256, y cada petición consulta controles, inventario y vínculos actuales en D1. No se cachean decisiones editoriales ni estados comerciales. Los intentos y recibos anteriores siguen preservados; estas correcciones requieren nueva validación y operación remota.

El 2026-09-07, `b4dfa2c` completó Preview y Production, sus imports idempotentes, rollback y reactivación; el dominio canónico publicó 749 códigos por HTTPS válido. La única ejecución controlada del scheduler, `34124581192`, reconcilió los 749 productos correctamente, pero el recorrido público posterior falló con HTTP 503. Una ficha reprodujo el error Cloudflare 1102 (`Worker exceeded resource limits`). Se cerraron colección, catálogo y gate del scheduler en ambos entornos, preservando los recibos y datos. La reproducción local identificó la colación repetida mediante `localeCompare` con opciones dentro del ordenamiento: reutilizar `Intl.Collator` conserva exactamente el orden español y evita recrear el comparador miles de veces por petición. Se corrigen las ordenaciones del catálogo y categorías sin cachear datos, debilitar validaciones ni aumentar límites de infraestructura. La medición local no sustituye la comprobación remota del nuevo deployment. El sync del workflow quedó exitoso y su smoke fallido se conserva; no se repite una segunda ejecución manual del scheduler.

El tercer intento Preview del 2026-09-07, sobre `5515920`, publicó el snapshot v2 de 749 productos y 21 categorías, pero la importación de vínculos respondió HTTP 400. PowerShell envía un POST de cero bytes con `Content-Length: 0` y `Content-Type: application/x-www-form-urlencoded`; el guard confundía un stream HTTP vacío con datos suministrados por el cliente. Ambos imports comprueban ahora los bytes reales y cancelan al primer byte no vacío, sin acumular el body ni confiar en el tamaño declarado. No aceptan JSON, espacios ni mappings externos. Las pruebas reproducen el rechazo anterior y verifican importación vacía idempotente y rechazo de cualquier payload. El cierre automático preservó inventario y snapshot, dejó los tres controles en `0` y no creó vínculos ni triage. Se conserva el recibo fallido; el siguiente intento exige código validado y desplegado.

El segundo intento Preview del 2026-09-07 aplicó `0017` correctamente. El run `dux_sync_0a73d854-20c7-43ed-8175-2a67722cd5b8` completó el inventario y verificó el tenant, pero la publicación del catálogo respondió HTTP 502. La reproducción local con la lectura ya obtenida identificó `DUX_CATALOG_CATEGORY_CONFLICT`: el subrubro `4` significa `ELABORACION PROPIA` bajo el rubro `272741` y `AGROECOLOGICO` bajo `271978`. Se corrige la identidad del subrubro incorporando su rubro, coherente con la [consulta Dux de subrubros por rubro](https://developers.duxsoftware.com.ar/reference/listar_sub_rubros). El cierre automático dejó los tres controles en `0`, preservó 749 registros de inventario y no creó snapshot v2 ni vínculos. No se repite Dux antes de validar y desplegar la corrección; el recibo fallido y su bookmark se conservan fuera del repositorio.

En Preview, el intento remoto del 2026-09-07 aplicó `0016` y rechazó `0017` con `incomplete input: SQLITE_ERROR` (7500). No se ejecutó el sync ni se activaron controles; la inspección confirmó que `0017` no dejó objetos parciales. Los dos triggers de resolución usaban `SELECT CASE ... END` sin paréntesis, una forma afectada por el [separador de sentencias de D1](https://github.com/cloudflare/workers-sdk/issues/4727). Se sustituyen por `SELECT RAISE(...) WHERE ...`, conservando condiciones y errores. Las pruebas verifican también SQL directo inválido, versión de revisión y resolución válida. Los recibos fallidos, bookmarks y copias originales de las migraciones se conservan fuera del repositorio; este registro no acredita la aplicación remota del SQL corregido.

El rollback funcional pone `public_catalog_enabled=0` mediante el endpoint administrativo o la acción equivalente del panel. El runtime vuelve al catálogo local sin borrar snapshot, triage, vínculos, imágenes ni historia, y sin revertir migraciones. No restablece stock local ni habilita transacciones.

Si una fase falla después de abrir la colección, el script intenta cerrar `public_catalog_enabled` y `snapshot_collection_enabled`, comprueba `public_cutover_enabled=0` y emite recibo `failed`. Si no puede verificar ese cierre, informa la incidencia y exige comprobación administrativa antes de continuar. Un fallo de sync no autoriza repetirlo: primero se inspecciona el run registrado y el estado remoto. El bookmark se conserva para recuperación extraordinaria de esquema/datos; el script no ejecuta restauraciones Time Travel ni revierte migraciones.

Una fase ya finalizada deja colección y catálogo habilitados y cutover cerrado. Reejecutar el procedimiento de activación con controles abiertos se detiene; no modifica ese estado para simular un primer intento. Los recibos fallidos y exitosos se conservan por separado.

## Continuidad y verificación canónica

Antes de una operación controlada, inspeccionar y pausar el gate GitHub `DUX_RECONCILIATION_ENABLED` y comprobar que no sobrevivan corridas activas. Sólo reabrirlo después del sync administrativo productivo, catálogo verificado, `public_cutover_enabled=0` y presupuesto D1 disponible. El cron existente conserva sus límites y exclusión mutua; una expresión de 15 minutos no acredita esa cadencia efectiva en GitHub.

El runner exige que el resultado incluya un catálogo publicado por el mismo `inventoryRunId`, hash válido, lista `PRECIOS DEL NEGOCIO`, cantidad entera y fecha del run. Inventario exitoso acompañado de catálogo `disabled`, `pending_migration` o inconsistente termina en fallo sin repetir Dux. El log de éxito contiene únicamente IDs, conteos, versión y fecha.

Un `workflow_dispatch` del workflow existente agrega, después de reconciliar, `scripts/verify-dux-public-catalog.mjs --all-details`. Este paso sólo realiza GET públicos seriales a `https://shekinah.ar`, sin credenciales, con TLS normal y rechazo de redirecciones. Comprueba inicio, listado y todas las fichas, contrato v2, códigos e IDs únicos, categorías, estados de precio y comercio cerrado. Compara versión y digest comercial al comienzo y al final para detectar cambios durante la lectura. No hace llamadas Dux ni reintenta el sync ante un fallo del smoke.

El digest público usa filas ordenadas por SKU: `[sku, name, priceStatus, amount|null, [[categorySlug, categoryName], ...]]`. Compararlo con el snapshot D1 permite comprobar todos los campos comerciales desde un cliente externo estándar cuando la red local intercepta TLS. Comprobar el presupuesto de lecturas D1 antes del recorrido exhaustivo; una ficha reconstruye la proyección completa. La ejecución programada conserva sólo la reconciliación, sin repetir ese recorrido.

Las pruebas reproducibles del procedimiento están en `tests/finalize-dux-catalog.tests.ps1`, ejecutadas también por CI con PowerShell. Cubren bootstrap vacío, tenant incorrecto o ausente después del sync, imports, rollback, timeout sin reintento y saneamiento de errores HTTP mediante dobles locales. No requieren credenciales ni red.

## Evidencia de validación y límites

Las pruebas locales, CI, deployment Pages y operaciones remotas son evidencias distintas. Los resultados de ejecución se incluyen en el informe final del commit publicado; este documento no acredita por sí solo un CI o deployment posterior a la base. La validación local del script no valida credenciales, permisos, acceso remoto o resultados de una migración real.

Validación del script ejecutada el 2026-09-06: parser PowerShell sin errores y fase `Validate` aprobada. Además se ejecutaron siete escenarios con todos los accesos HTTP, Git, GitHub CLI, Wrangler y credenciales reemplazados por dobles locales, sin llamadas remotas:

| Escenario local | Resultado observado |
| --- | --- |
| Preview completa | Imports dos veces, un único sync, rollback, reactivación y recibo `passed` |
| Timeout de sync | Un único intento; cierre de catálogo y colección; recibo `failed` |
| Tenant distinto | Detención anterior a migraciones o sync |
| Production sin recibo Preview | Detención anterior a solicitudes HTTP o migraciones |
| D1 del deployment distinta de la elegida | Detención anterior a migraciones o sync |
| Conteo de precio inesperado | No activa catálogo; cierra colección; no repite sync |
| Rollback remoto no verificable | No declara éxito; registra cierre fallido y emite aviso explícito |

Estos siete controles se clasifican como **verificados con dobles locales**. La aplicación de migraciones, las importaciones y el sync reales, la autenticación administrativa y el smoke de activación se clasifican como **no ejecutados en remoto**. Las muestras y recibos de los dobles son temporales y no se incorporan al repositorio.

En esta iteración no se ejecutan migraciones remotas, sincronización administrativa Dux, activación productiva, Mercado Libre, pedidos, reservas, pagos ni mutaciones de stock. La activación posterior queda pendiente del procedimiento y de su autorización explícita.
