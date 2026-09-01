# Shekinah — Autorreferencia operativa de Codex

```yaml
schema_version: 2
project: shekinah
repository: JerePrograma/shekinah
branch: main
remote: origin/main
inventory_authority: dux
mercado_libre_inventory_integration: retired
dux_api_mode: read_only_fail_closed
dux_api_enabled_default: false
commerce_enabled_default: false
base_sha: 2bbd62f547b9b0de84f8794a6dcf679ef07a7df8
functional_candidate_sha: pending
functional_candidate_ci: pending
previous_diagnostic_sha: f138820
previous_diagnostic_ci: 416_success
previous_pages_deployment: 8781412e-629b-4473-8081-89c6fbc1ffec
dux_remote_validation: direct_api_verified_manual_redirect_candidate_pending_cutover
dux_transport_root_cause: cloudflare_fetch_redirect_error_incompatibility
dux_snapshot_state: absent
migration_0010_0013_remote_state: applied_preview_and_production
migration_0014_remote_state: not_applied
production_local_inventory_payloads: 0
dux_api_enabled_production: false
dux_reconciliation_enabled: false
commerce_enabled_production: false
```

## 1. Identidad del proyecto

- frontend React/TypeScript estricto/Vite;
- backend Cloudflare Pages Functions;
- persistencia Cloudflare D1;
- imágenes administradas Cloudflare R2;
- producción desde `main` de `JerePrograma/shekinah`;
- dominio canónico `https://shekinah.ar`.

El proyecto Pages y un Worker histórico pueden compartir el nombre `shekinah`; verificar el tipo de recurso antes de cualquier configuración.

## 2. Regla de autoridad

El orden de autoridad operativa es: repositorio sincronizado, código rastreado, pruebas ejecutadas, esquema efectivo, configuración externa autenticada, CI/deployment del SHA exacto y documentación vigente.

Para inventario:

- Dux es autoridad de identidad externa, stock, depósitos, unidades/medidas y pedidos/reservas;
- Shekinah conserva edición comercial, carrito, orden local y coordinación;
- Mercado Pago es autoridad financiera;
- Dux sincroniza Mercado Libre sin intervención de Shekinah.

D1 guarda un snapshot y mapping, no stock autoritativo.

## 3. Estado Git

La tarea trabaja directamente sobre `main` y `origin/main`. Antes de editar se exige `git status`, `git switch main`, `git fetch origin`, `git pull --ff-only origin main` y un segundo `git status`.

El hash final no puede escribirse dentro del mismo commit que lo contiene. Resolverlo después con Git y registrarlo en el informe de cierre.

## 4. Arquitectura vigente

```text
Dux ──inventario/pedido──> Shekinah ──Checkout Pro──> Mercado Pago
  └────────────sincronización────────> Mercado Libre
```

Shekinah no consulta ni muta Mercado Libre para inventario. Tampoco usa Excel, scraping, cookies del ERP o endpoints internos.

## 5. Estado de Dux

La integración de código es read-only y usa la API oficial v2:

```text
https://erp.duxsoftware.com.ar/WSERP/rest/services
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
Authorization: Bearer <token>
```

Las lecturas son paginadas, defensivas, con total fijo y conteo terminal exacto, timeout, serialización mínima de cinco segundos y retry acotado. El cliente usa `redirect: 'manual'`, nunca sigue redirecciones y rechaza todo `300`–`399` antes de leer cuerpo o `Location`. No hay llamadas Dux durante build.

El 2026-09-01 el token fue validado contra la API oficial sin imprimirlo ni persistirlo. La lectura devolvió una empresa (`12862`), una sucursal (`1`), un depósito habilitado (`25566`) y 743 items; 27 disponibilidades eran fraccionarias y 8 no positivas. Esto verifica acceso efectivo, no el nombre comercial del plan.

La misma lectura no se completó desde Pages Functions. Tres reconciliaciones productivas terminaron `DUX_UNAVAILABLE` antes de procesar items. La instrumentación publicada en `f138820` clasificó el tercer intento como `fetch_exception` en `/v2/empresas`, con `providerStatus=null` y tres intentos. No se publicó snapshot.

Un diagnóstico aislado posterior comprobó que `redirect: 'error'` provocaba la excepción de Cloudflare antes de headers, mientras `redirect: 'manual'` permitía recibir una respuesta HTTP clasificable. El candidato adopta el modo manual, rechaza explícitamente todo `3xx` y emite diagnóstico v2 sanitizado por fase y clase cerrada. La corrección está validada localmente; aún falta desplegarla y probarla dentro de Pages con el secreto cifrado.

## 6. Bloqueos Dux

- La causa de transporte fue aislada y el candidato está corregido por código, pero todavía no existe evidencia de un sync productivo exitoso sobre ese SHA.
- El mapping corregido no pudo validarse contra datos reales porque Pages aún no publica un snapshot.
- `GET /v2/items` no publica unidad, pesabilidad, divisibilidad o regla decimal suficiente.
- `POST /v2/pedidos` y `GET /v2/pedidos` no resuelven públicamente cancelación/liberación/finalización/expiración segura.

No se crean pedidos Dux, reservas, preferencias Mercado Pago ni pagos. Con el estado final `DUX_API_ENABLED=false`, la respuesta esperada es `DUX_API_DISABLED`; el guard de lifecycle continúa disponible como `DUX_ORDER_LIFECYCLE_UNAVAILABLE` antes de cualquier mutación si una futura lectura controlada vuelve a habilitarse.

`0012` agrega el hard block de base de datos para pedidos vinculados y para órdenes históricas con líneas ya asociadas a Dux; pagos, conciliación y expiración los excluyen hasta que una migración posterior reemplace el guard con un lifecycle Dux demostrado. `0013` retira las reservas/consumos locales y exige snapshot Dux exacto para toda línea comercial nueva.

## 7. Cantidades y unidades

- preservar `738.5`, `36.4`, `2.44` y cualquier número finito sin redondeo;
- no transformar por nombre o presentación;
- una cantidad física no define el paso comprable;
- un valor `<= 0` no habilita venta;
- una semántica ausente queda no verificada y fail-closed.

## 8. Mapping

Orden: vínculo persistido, código externo exacto, SKU exacto, código de barras exacto único y clave conservadora de nombre sólo para bootstrap. Prohibido fuzzy matching.

Estados: `mapped`, `unmapped`, `ambiguous`. Los dos últimos preservan contenido local y bloquean venta. Un item ausente nunca borra el producto local.

La clave de bootstrap aplica NFKC, minúsculas, espacios normalizados, diacríticos plegados preservando `ñ` y equivalencias exactas de cantidad para tokens completos reconocidos. Conflictos entre nombre, presentación e ID histórico vetan el paso. No elimina puntuación arbitraria, no singulariza, no aplica sinónimos, coincidencias parciales ni aritmética de packs; las colisiones continúan `ambiguous`. Se ejecuta únicamente cuando `kind=initial` y `dux_inventory_items` está vacía.

Esta canonicalización compara identidad; nunca infiere unidad, pesabilidad, divisibilidad, paso comprable, peso de envío o cantidad de stock. Falta validar el mapping contra un snapshot real y el catálogo no dispone de un campo barcode independiente.

## 9. D1

`migrations/0012_dux_authoritative_inventory.sql` agrega contexto, ciclos, snapshot/mapping, vínculos de pedidos y ledger. Es aditiva y no elimina datos históricos.

`migrations/0014_dux_atomic_inventory_snapshots.sql` agrega generaciones aisladas, staging transitorio del delta y un presupuesto conservador por D1/día de 40.000 unidades estimadas (`64 + 14 × delta` por corrida). La carga mantiene visible la publicación anterior; un único batch transaccional aplica por `UPSERT` sólo filas nuevas, cambiadas o recién ausentes, publica la generación, actualiza la frescura global/tenant/run y limpia staging. El trigger `dux_inventory_generation_publish_guard` exige que `changed_count` coincida con staging y que `item_count` coincida con la tabla visible resultante. Una corrida sin cambios no reescribe inventario y una falla preserva el snapshot anterior. El cliente corta a siete minutos, 45 intentos HTTP o un payload staging fuera de límite. “Atómico” no convierte D1 en autoridad ni habilita Checkout.

Estado remoto: `0010` a `0013` fueron aplicadas primero en preview y luego en producción el 2026-09-01, con bookmarks de Time Travel previos, esquema y triggers verificados, conteos preservados y cero violaciones de claves foráneas. `0013` limpió 6 payloads productivos; quedaron 0 claves locales de stock.

Estado del candidato: `0014` está versionada pero todavía no aplicada en ninguna D1 remota. Debe migrarse preview → producción con bookmarks y verificaciones antes de habilitar Dux.

Producción conserva tres filas de sync fallidas con cero items procesados. No existe snapshot y no hay filas de tenant, inventario o vínculos de pedidos Dux.

## 10. Checkout Pro

El flujo requerido es reserva Dux antes de preferencia, relación local/Dux, webhook Mercado Pago y finalización/liberación exactamente una vez. El lifecycle Dux faltante bloquea el flujo antes de Mercado Pago.

La aplicación Mercado Pago autorizada sigue siendo `Shekinah`, Application ID `7373984348988262`. No ejecutar pago real sin autorización puntual.

## 11. WhatsApp

Debe reservar Dux antes de persistir/abrir WhatsApp. Aprobar no vuelve a descontar y rechazar libera Dux. Como la liberación no está documentada, el canal falla cerrado para pedidos nuevos.

## 12. Mercado Libre

Integración directa retirada. Los flags permanecen en `false`, los endpoints históricos no mutan y no existe scheduler Mercado Libre autorizado. Dux sincroniza la tienda `HERBOLARIOMDP`; seller ID `445638367` no es un ID Dux.

## 13. Variables, flags y secretos

Defaults:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
```

Variables server-side: `DUX_COMPANY_ID`, `DUX_BRANCH_ID`, `DUX_DEPOSIT_ID`, `DUX_SNAPSHOT_MAX_AGE_SECONDS`. Secretos: `DUX_API_TOKEN`, `DUX_SCHEDULER_SECRET`. Nunca usar `VITE_` para un secreto ni persistir token en D1/logs.

Estado efectivo final del 2026-09-01: los IDs `12862`, `1` y `25566` y la antigüedad máxima `900` están configurados; el token existe únicamente como secreto cifrado. `DUX_API_ENABLED`, ambos flags de comercio, ambos flags Mercado Libre y la reconciliación GitHub permanecen en `false`.

## 14. Scheduler

`.github/workflows/dux-reconcile.yml` llama a `/api/internal/dux/reconcile` y requiere una variable explícita para ejecutar. Permanece deshabilitado porque no existe un sync manual exitoso y el mapping corregido aún no pudo validarse contra un snapshot real. Usa un solo lock D1 y no despliega. El `if` a nivel de job requiere `DUX_RECONCILIATION_ENABLED=true` como variable de repositorio u organización; el secreto server-to-server pertenece al environment y su presencia no habilita por sí sola el job.

## 15. Validaciones disponibles

- `npm ci`
- `npm run install:browsers`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run verify`
- `npm run build:pages`
- `git diff --check`

Validación local de esta fase con Node `24.18.0` y npm `11.6.0`: `npm ci`, instalación de navegadores y `npm run build:pages` aprobados; `npm run verify` aprobó 358 pruebas Vitest, 14 omitidas y Playwright 25/25. Los checks Git aún deben repetirse sobre el diff definitivo. Persisten dos vulnerabilidades altas preexistentes y warnings conocidos de tamaño de chunk/peso editorial. No reutilizar estos resultados como evidencia de CI o deployment.

La instrumentación `f138820` aprobó CI `#416`. Cloudflare Pages completó el build productivo con Node.js `24.18.0` y npm `11.6.0`, usando `SKIP_DEPENDENCY_INSTALL` y un comando de instalación fijado; el deployment canónico es `8781412e-629b-4473-8081-89c6fbc1ffec`.

## 16. Invariantes de seguridad

- mismo origen para mutaciones públicas;
- sesión y auditoría para administración;
- webhook Mercado Pago firmado y pago reconsultado;
- secretos sólo server-side;
- payloads externos parseados sin casts ciegos;
- idempotencia antes de mutaciones;
- timeout mutante se reconcilia antes de retry;
- cero fallback silencioso a D1 local, Mercado Libre o Excel.

## 17. Invariantes editoriales

Dux no modifica slug, URL, imágenes, descripción, categoría, SEO o texto de marketing. Los precios permanecen locales salvo decisión comercial futura explícita. No borrar productos ausentes de Dux.

## 18. Riesgos y bloqueos externos

| Bloqueo | Estado | Acción mínima |
| --- | --- | --- |
| Acceso oficial directo | verificado | conservar token sólo como secreto |
| Transporte Pages → Dux | causa aislada; candidato local validado | publicar, migrar y probar una vez en Pages |
| IDs de tenant | verificados | conservar `12862` / `1` / `25566` server-side |
| Mapping | corregido por código; no validado en remoto | validar contra un snapshot real antes del scheduler |
| Unidad/divisibilidad | no expuesta en GET items | confirmar endpoint/campos con Dux |
| Liberación/finalización | no documentada | obtener contrato oficial y probar |
| Migraciones `0010`–`0013` | verificadas en ambos entornos | conservar esquema e historia |
| Migración `0014` | versionada; no aplicada remotamente | bookmark, preview, auditoría y luego producción |
| Snapshot | ausente tras tres fallos | resolver transporte y repetir una vez de forma controlada |
| Scheduler | desactivado | habilitar sólo tras sync manual y mapping conforme |
| Pago real | no ejecutado | autorización expresa al final |

## 19. Archivos y símbolos críticos

- `server/dux-api.ts`: HTTP Dux, parseo, timeout y rate limit;
- `server/dux-inventory.ts`: configuración, mapping, snapshot y estado;
- `migrations/0012_dux_authoritative_inventory.sql`: persistencia Dux;
- `migrations/0013_remove_local_catalog_stock.sql`: elimina contadores locales y exige snapshot Dux;
- `migrations/0014_dux_atomic_inventory_snapshots.sql`: staging incremental y publicación atómica por generaciones;
- `functions/api/checkout/preferences.ts`: guard antes de Mercado Pago;
- `functions/api/orders/whatsapp.ts`: guard antes de abrir WhatsApp;
- `functions/api/webhooks/mercadopago.ts`: estado financiero histórico;
- `server/config.ts`: flags y bloqueo de lifecycle;
- `src/catalog/model.ts`: proyección Dux;
- `src/admin/DuxPanel.tsx`: diagnóstico read-only;
- `.github/workflows/dux-reconcile.yml`: scheduler condicionado;
- `scripts/run-dux-reconcile.mjs`: runner first-party.

## 20. Último diff aplicado

La base histórica `d723f250ec3ef84abfa78bf66675248271106326` introdujo la integración Dux read-only. `f138820` agregó diagnóstico sanitizado y aprobó CI/deployment. `39ab007` elimina el stock local del runtime, administración y contrato de producto, corrige el orden de mapping y agrega `0013`; la migración ya está verificada en ambas D1. Esta fase parte de `2bbd62f547b9b0de84f8794a6dcf679ef07a7df8` y prepara transporte manual, bootstrap conservador y `0014`; todavía no tiene SHA/CI/deployment remoto acreditado. Producción continúa fail-closed.

## 21. Próximo paso exacto

Mantener Dux, comercio, Mercado Libre directo y scheduler en `false`; validar y publicar el candidato; esperar CI y deployment Pages del mismo SHA; obtener bookmarks y aplicar `0014` primero en preview y después en producción; confirmar cero generaciones activas; habilitar Dux sólo para un único sync administrativo `initial`; auditar generación, conteos, mapping y cantidades; volver a cerrar el flag ante cualquier falla. Aun con snapshot exitoso, escalar a Dux la unidad y el lifecycle antes de implementar cualquier mutación o pago.

## 22. Historial de sesiones

### Sesión 2026-09-01 — configuración productiva Dux fail-closed

- Base: `d723f250ec3ef84abfa78bf66675248271106326`.
- Acceso oficial: token e IDs verificados, con 743 items observados sin afirmar plan comercial.
- Persistencia: migraciones `0010`–`0013` aplicadas y verificadas en preview y producción; `0013` dejó cero campos locales de stock.
- Producción: tres sync `DUX_UNAVAILABLE`, cero procesados y ningún snapshot, tenant, inventario o vínculo de pedido.
- Diagnóstico: `f138820` confirmó `fetch_exception` en `/v2/empresas`, sin estado del proveedor, después de tres intentos.
- Publicación: CI `#416` y deployment `8781412e-629b-4473-8081-89c6fbc1ffec` exitosos con npm `11.6.0`.
- Seguridad: token sólo como secreto cifrado; no se crearon pedidos, pagos ni reservas Dux.
- Cierre: Dux API, comercio, Mercado Libre directo y scheduler en `false`; transporte, validación remota del mapping, unidad y lifecycle pendientes.

### Sesión 2026-08-26 — Dux como autoridad

- Objetivo: retirar stock local/Mercado Libre como autoridad e introducir Dux.
- Decisión: integración read-only y fail-closed por ausencia de lifecycle público seguro.
- Persistencia: migración aditiva `0012`, sin afirmar aplicación remota.
- Mercado Libre: integración directa retirada; Dux mantiene la sincronización externa.
- Producción: no activada; flags de Dux y comercio en `false`.
- Bloqueos: PRO/FULL, token, IDs, unidad/divisibilidad y cancelación/liberación/finalización.
- Evidencia pendiente al cerrar: pruebas, hash, push, CI y deployment.

### Sesiones históricas 2026-08-04 a 2026-08-24

Se implementaron y validaron en etapas el stack base: D1, Checkout Pro, webhook, stock local transaccional, integración directa Mercado Libre, backoffice, R2 y analítica. Esos registros explican migraciones y compatibilidad, pero no reemplazan la decisión actual: Dux es ahora la única autoridad de inventario y las rutas anteriores quedan fuera del flujo activo.
