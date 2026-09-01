# Configuración productiva Dux en modo fail-closed — 2026-09-01

> Registro histórico de la fase diagnóstica cerrada en `f138820`. Las referencias de este archivo a migraciones hasta `0012` y al mapping entonces no conforme describen ese corte y no deben reescribirse. La eliminación posterior del stock local, `0013` y la corrección de mapping se registran en `DUX_LOCAL_STOCK_REMOVAL_2026-09-01.md`.

## Alcance y punto de partida

La intervención comenzó sobre `main` y `origin/main` limpios y sincronizados en:

```text
d723f250ec3ef84abfa78bf66675248271106326
```

El objetivo fue terminar la configuración verificable de Dux, D1, Cloudflare Pages y GitHub sin abrir una capacidad comercial antes de demostrar el contrato completo. La secuencia separó deliberadamente acceso al proveedor, migraciones, variables, secretos, despliegue, reconciliación, CI y smoke.

No se creó una rama, PR, worktree o stash. No se usó reset destructivo, rebase ni force-push.

## Resultado ejecutivo

La infraestructura quedó preparada y desplegada, pero Dux y todos los flujos comerciales terminaron cerrados:

- la credencial autorizada respondió correctamente desde el host de operación;
- se verificaron de forma inequívoca empresa `12862`, sucursal `1` y depósito `25566`;
- las migraciones `0010`, `0011` y `0012` quedaron aplicadas en local, preview y producción;
- Pages conserva D1 y R2 separados por entorno, secretos cifrados y `fail_open=false`;
- el código diagnóstico `f138820e1fc106a5cc58f63f77c1c55dd953212e` aprobó validación local, CI y build/deployment de Pages;
- tres reconciliaciones productivas fallaron antes de procesar items porque Pages Functions no obtuvo una respuesta HTTP de Dux;
- no existe snapshot, mapping ni contexto de tenant productivo;
- el mapping implementado no cumple todavía el contrato documentado;
- Dux no expone en las lecturas verificadas la semántica suficiente de unidad ni el lifecycle compensable de pedidos;
- producción y preview terminaron con Dux API, Checkout Pro, WhatsApp transaccional, Mercado Libre directo y scheduler Dux deshabilitados.

Éste es un cierre seguro de configuración y diagnóstico, no una activación comercial.

## Acceso autenticado a Dux

Las llamadas directas a la API oficial Dux v2, efectuadas sin imprimir ni persistir la credencial, devolvieron:

```text
empresas: 1
empresa seleccionada: 12862
sucursal seleccionada: 1
depósito seleccionado: 25566
items informados: 743
cantidades disponibles fraccionarias: 27
cantidades disponibles no positivas: 8
```

La identidad legal de la cuenta se omitió deliberadamente porque no es necesaria para operar ni auditar este cierre. La respuesta autenticada demuestra acceso efectivo a esos endpoints; no demuestra ni autoriza afirmar el nombre exacto del plan comercial contratado.

El token:

- no se escribió en Git, archivos del repositorio, logs ni D1;
- no se reprodujo en respuestas;
- se cargó únicamente en Pages como `DUX_API_TOKEN` de tipo `secret_text`;
- quedó presente como secreto cifrado independiente en production y preview, sin lectura posterior de su valor.

## D1: reversibilidad, migraciones y preservación

Antes de modificar cada base se obtuvo un bookmark de Time Travel:

| Entorno | Base | Bookmark previo |
|---|---|---|
| Preview | `48d8ae41-8910-4f8e-b537-3706c07e2cbf` | `00000046-00000000-000050d9-3a392c09a18873395984ce25475515c5` |
| Producción | `533c7c65-1dbb-4f15-be96-c6088700a8e1` | `000003f8-00000000-000050d9-39b4d775d562c5d75520b57e4dc006d9` |

Se aplicaron, en ese orden, las migraciones versionadas:

```text
0010_checkout_terminal_reservation_release.sql
0011_local_order_stock_required.sql
0012_dux_authoritative_inventory.sql
```

La secuencia aprobada fue local → preview → producción. Después de cada destino se verificaron registro de migraciones, tablas, índices y triggers esperados, ausencia de migraciones pendientes y `PRAGMA foreign_key_check` vacío.

Los conteos comerciales previos se preservaron. Preview continuó con 14 pedidos y 14 items; producción, con 15 pedidos y 30 items. La aplicación de migraciones no creó pedidos, pagos, reservas ni movimientos Dux.

Después de los tres intentos fallidos, producción conservó:

```text
dux_tenant_context: 0
dux_inventory_items: 0
dux_order_links: 0
dux_order_operations: 0
violaciones de claves foráneas: 0
```

Por lo tanto, D1 no contiene un snapshot Dux parcial ni un mapping que deba limpiarse.

## Configuración final de Cloudflare Pages

Los recursos vinculados y preservados son:

| Entorno | Binding `DB` | Binding `CATALOG_IMAGES` | Functions |
|---|---|---|---|
| Production | `533c7c65-1dbb-4f15-be96-c6088700a8e1` | R2 `shekinah` | `fail_open=false` |
| Preview | `48d8ae41-8910-4f8e-b537-3706c07e2cbf` | R2 `shekinah-preview` | `fail_open=false` |

Variables finales efectivas en ambos entornos:

```text
DUX_API_ENABLED=false
DUX_COMPANY_ID=12862
DUX_BRANCH_ID=1
DUX_DEPOSIT_ID=25566
DUX_SNAPSHOT_MAX_AGE_SECONDS=900
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

Secretos configurados sin leer valores:

| Secreto | Production | Preview |
|---|---:|---:|
| `DUX_API_TOKEN` | `secret_text` presente | `secret_text` presente |
| `DUX_SCHEDULER_SECRET` | `secret_text` presente | no configurado |

El secreto de scheduler no se copió a GitHub. La variable de habilitación `DUX_RECONCILIATION_ENABLED` tampoco se activó en repositorio u organización, de modo que el workflow periódico no puede ejecutar la reconciliación.

## Secuencia de deployments

| Propósito | Deployment de producción | Fuente | Resultado |
|---|---|---|---|
| Activar configuración inicial para diagnóstico controlado | `796c5be7-ef66-4c55-a247-b1b98d0558d8` | `d723f25` | success |
| Publicar instrumentación segura de transporte | `1e3e9b86-00ab-4f82-9f3e-739748d20d7b` | `f138820` | success |
| Volver a `DUX_API_ENABLED=false` | `ec24031b-776b-4f01-9184-ed01d56525ef` | `f138820` | success |
| Reproducir el build con npm 11.6.0 | `8781412e-629b-4473-8081-89c6fbc1ffec` | `f138820` | success |

El deployment final quedó asociado al alias canónico `https://shekinah.ar`. Pages omitió la instalación automática de dependencias y ejecutó el comando de instalación fijado con npm `11.6.0`; el build concluyó correctamente sobre Node.js `24.18.0`.

## Reconciliaciones productivas y diagnóstico

Se ejecutaron tres sync manuales autorizados. Todos fallaron cerrados antes de obtener la empresa desde Pages Functions:

| Run | Inicio UTC | Estado | Código | Procesados | Mapeados | Sin mapping | Ambiguos | Ausentes | Fallidos |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| `dux_sync_bb190a0c-27df-4c31-8ea5-9638ccd2d6b0` | `2026-09-01T13:57:09.163Z` | failed | `DUX_UNAVAILABLE` | 0 | 0 | 0 | 0 | 0 | 1 |
| `dux_sync_c81b32ac-7184-4658-8ebf-fed577e2fae7` | `2026-09-01T13:58:58.921Z` | failed | `DUX_UNAVAILABLE` | 0 | 0 | 0 | 0 | 0 | 1 |
| `dux_sync_2dcf392a-abb6-4889-bea9-9e8d76485644` | `2026-09-01T14:30:38.485Z` | failed | `DUX_UNAVAILABLE` | 0 | 0 | 0 | 0 | 0 | 1 |

La instrumentación del tercer intento emitió únicamente el evento sanitizado:

```text
kind=fetch_exception
endpoint=/v2/empresas
providerStatus=null
attempts=3
```

No se registraron URL completa, query, headers, token, cuerpo del proveedor ni mensaje de excepción. `providerStatus=null` confirma que la Function no recibió una respuesta HTTP clasificable; no corresponde atribuir sin evidencia la causa interna a Cloudflare o a Dux. El resultado verificable es una falla bloqueante de transporte en el trayecto Pages Functions → Dux.

Después de restaurar `DUX_API_ENABLED=false`, una invocación autenticada final respondió HTTP 200 con:

```json
{"status":"disabled"}
```

La consulta posterior confirmó que esa invocación no creó un cuarto `dux_sync_runs`.

## Smokes finales

Sobre el deployment final y con todos los flags comerciales cerrados:

| Control | Resultado |
|---|---|
| `GET /api/catalog` | HTTP 200; 513 productos efectivos, 0 `available=true`, 0 `checkoutEligible=true` |
| `GET /api/admin/dux/status` sin sesión | HTTP 401 `ACCESS_TOKEN_MISSING` |
| `POST /api/internal/dux/reconcile` sin secreto | HTTP 401 `SCHEDULER_UNAUTHORIZED` |
| `POST /api/checkout/preferences` | HTTP 503 `COMMERCE_DISABLED` |
| Reconciliación autenticada con Dux deshabilitado | HTTP 200 `{"status":"disabled"}` y ninguna fila nueva |

Los 513 productos son el catálogo efectivo, que incluye mutaciones editoriales D1 históricas; el catálogo canónico versionado continúa siendo 510 productos y 16 categorías. La ausencia de disponibilidad Dux no borra contenido editorial.

## Validación local

Entorno exacto: Node.js `24.18.0` y npm `11.6.0`.

| Control | Estado | Resultado |
|---|---|---|
| `npm ci` | verificado | Instalación reproducible desde `package-lock.json`; npm informó 2 vulnerabilidades de severidad alta ya existentes. |
| `npm run install:browsers` | verificado | Chromium requerido por Playwright quedó disponible. |
| Prueba focal del cliente Dux | verificado | 29 pruebas aprobadas. |
| `npm run verify` | verificado | 337 pruebas Vitest aprobadas, 14 omitidas y 25 pruebas Playwright aprobadas; lint, TypeScript, catálogo, assets, seguridad y automatización pasaron. |
| `npm run build:pages` | verificado | 337 pruebas Vitest aprobadas, 14 omitidas; verificadores y build de Pages aprobados. |
| `git diff --check` | verificado | Sin errores de whitespace. |
| `git diff --cached --check` | verificado | Sin errores de whitespace. |

Advertencias no bloqueantes preservadas:

- npm audit informó 2 vulnerabilidades altas preexistentes; no se aplicó una actualización de dependencias fuera del alcance;
- Vite mantuvo el warning conocido por el tamaño del chunk principal;
- `verify:shipping-weights` informó 1 producto histórico con clasificación ambigua y terminó correctamente.

## GitHub Actions y Pages

La instrumentación segura se publicó mediante el commit:

```text
f138820e1fc106a5cc58f63f77c1c55dd953212e
fix: diagnostica fallos de transporte Dux
```

Evidencia GitHub:

```text
workflow CI: #416
run: 33519529396
job Verify: 99894970961
conclusión: success
artifact: 9805149299
digest: sha256:07b754cd080869718d7e27aba133ff6439dfc1adfe930cb7a5fb7e4d9e5b3ead
tamaño: 52388396 bytes
expiración: 2026-09-08
```

El build final de Cloudflare para el mismo SHA usó Node.js `24.18.0`, omitió la instalación automática, instaló con npm `11.6.0`, ejecutó 337 pruebas aprobadas con 14 omitidas y terminó con deployment exitoso. CI aprobado y deployment aprobado no se interpretan como evidencia de sync Dux.

## Brechas productivas que permanecen

### Transporte Pages Functions → Dux

Falló antes de recibir un status HTTP del proveedor. Mientras no se resuelva, no puede publicarse un snapshot autoritativo desde el runtime productivo.

### Mapping no conforme

La implementación desplegada evalúa vínculo persistido → código externo exacto → SKU exacto → nombre exacto en cada corrida. No consulta el código de barras y no limita el nombre exacto al bootstrap. El contrato documentado exige vínculo persistido → código externo → SKU → barcode exacto único → nombre exacto único sólo durante bootstrap.

Los tres sync fallaron antes del procesamiento, por lo que esta brecha de código no llegó a persistir asociaciones incorrectas. Debe corregirse y probarse antes de habilitar el scheduler o ejecutar otro sync productivo.

### Unidad y granularidad

La lectura oficial de items no aportó una semántica verificable de unidad, pesabilidad, divisibilidad ni paso decimal comprable. Las 27 cantidades fraccionarias observadas no autorizan inferir cómo debe comprar el cliente. Ninguna fila debe volverse `checkoutEligible` sin esa evidencia.

### Lifecycle de pedidos

La API pública revisada no permitió demostrar cancelación/liberación, finalización/consumo, expiración segura ni reconciliación concluyente de timeouts mutantes. No se implementó ni ejecutó una mutación de pedidos Dux. Éste sigue siendo un bloqueo duro para Checkout Pro y WhatsApp.

## Intentos fallidos preservados

Los siguientes intentos diagnósticos se conservaron como parte de la secuencia real:

1. Una lectura D1 que combinaba demasiados términos mediante `SELECT` excedió el límite del motor. Se dividió en consultas de sólo lectura más pequeñas.
2. `wrangler d1 migrations apply ... --yes` fue rechazado porque esa versión del subcomando no admite `--yes`. Se repitió sin el flag y las migraciones se aplicaron correctamente.
3. El primer intento de tail con sampling `1` fue rechazado por el contrato del servicio. Se abrió un tail válido sin modificar el deployment.
4. Una consulta intentó leer la tabla inexistente `dux_inventory_snapshot`; se corrigió al esquema versionado real `dux_inventory_items`.
5. Una búsqueda directa por UUID sin el prefijo persistido no encontró el run. Se repitió usando el identificador completo `dux_sync_…`.
6. Durante la consolidación de este registro, una lectura de `dux_sync_runs` usó inicialmente nombres de columnas inexistentes con sufijo `_items`; se corrigió a las columnas reales con sufijo `_count`.

Ninguno de esos intentos escribió o eliminó datos. Las lecturas posteriores confirmaron los conteos, los tres run exactos y cero violaciones FK.

## Matriz final de controles

| Control | Clasificación | Evidencia o resultado |
|---|---|---|
| Base Git limpia y sincronizada | verificado | `d723f250ec3ef84abfa78bf66675248271106326` antes de modificar. |
| Acceso autenticado Dux desde el host de operación | verificado | Una empresa, sucursal `1`, depósito `25566` y 743 items. |
| Nombre exacto del plan Dux | no disponible | No se infirió a partir del acceso API. |
| Custodia del token | verificado | Sólo `secret_text`; sin Git, archivos, logs, D1 ni respuestas. |
| Migraciones `0010`–`0012` | verificado | Local, preview y producción; sin pendientes y FK vacío. |
| Bindings D1/R2 y `fail_open=false` | verificado | Separación production/preview preservada. |
| Sync Dux desde Pages Functions | fallido | Tres run `DUX_UNAVAILABLE`, cero items y sin snapshot. |
| Diagnóstico del transporte | verificado | `fetch_exception`, `/v2/empresas`, status nulo, 3 intentos. |
| Mapping vigente | revisado por código | No conforme: omite barcode y reutiliza nombre fuera del bootstrap. |
| Semántica de unidad y paso decimal | no disponible | La respuesta de items no ofrece evidencia suficiente. |
| Lifecycle compensable de pedidos Dux | no disponible | No existe contrato público suficiente para activar mutaciones. |
| Guards de comercio y autenticación | verificado | Smokes 401/503 esperados; catálogo sin disponibilidad Dux. |
| Scheduler GitHub | verificado | Secreto no copiado y flag de habilitación no activado. |
| Validación local obligatoria | verificado | Node 24.18.0/npm 11.6.0; comandos requeridos aprobados. |
| npm audit | fallido | Persisten 2 vulnerabilidades altas preexistentes. |
| GitHub Actions del SHA exacto | verificado | CI #416, run y job en `success`; artifact identificado. |
| Build y deployment Pages del SHA exacto | verificado | `8781412e-629b-4473-8081-89c6fbc1ffec`, `f138820`, success. |
| Snapshot, mappings y disponibilidad productiva Dux | fallido | Cero filas y cero productos habilitados. |
| Activación de Checkout Pro y WhatsApp | no disponible | Bloqueada por transporte, mapping, unidad y lifecycle. |

## Estado de cierre

Configuración, secretos, IDs, migraciones, instrumentación, CI, deployment y guards están verificados. La conectividad saliente de Pages hacia Dux, el mapping conforme, la unidad comercial y el lifecycle de pedidos no están resueltos.

El estado final es deliberadamente fail-closed:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
DUX_RECONCILIATION_ENABLED no habilitado
```

No se creó un pedido, pago, reserva, snapshot ni mapping Dux. No se expuso un secreto. No hubo force-push.
