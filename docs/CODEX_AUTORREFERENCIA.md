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
candidate_sha: pending_commit
candidate_ci: pending
candidate_pages_deployment: pending
dux_remote_validation: unavailable
migration_0012_remote_state: unverified
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

Las lecturas son paginadas, defensivas, con timeout, serialización mínima de cinco segundos y retry acotado. No hay llamadas Dux durante build.

## 6. Bloqueos Dux

- La cuenta aportada muestra Plan ESTÁNDAR; la API requiere PRO/FULL.
- No se dispone de token verificado.
- `GET /v2/items` no publica unidad, pesabilidad, divisibilidad o regla decimal suficiente.
- `POST /v2/pedidos` y `GET /v2/pedidos` no resuelven públicamente cancelación/liberación/finalización/expiración segura.

No se crean pedidos Dux ni preferencias Mercado Pago. La respuesta esperada es `DUX_API_DISABLED` o `DUX_ORDER_LIFECYCLE_UNAVAILABLE`.

`0012` agrega el hard block de base de datos para pedidos vinculados y para órdenes históricas con líneas ya asociadas a Dux; pagos, conciliación y expiración los excluyen hasta que una migración posterior reemplace el guard con un lifecycle Dux demostrado.

## 7. Cantidades y unidades

- preservar `738.5`, `36.4`, `2.44` y cualquier número finito sin redondeo;
- no transformar por nombre o presentación;
- una cantidad física no define el paso comprable;
- un valor `<= 0` no habilita venta;
- una semántica ausente queda no verificada y fail-closed.

## 8. Mapping

Orden: vínculo persistido, código externo exacto, SKU exacto, código de barras exacto único y nombre normalizado exacto único sólo para bootstrap. Prohibido fuzzy matching.

Estados: `mapped`, `unmapped`, `ambiguous`. Los dos últimos preservan contenido local y bloquean venta. Un item ausente nunca borra el producto local.

## 9. D1

`migrations/0012_dux_authoritative_inventory.sql` agrega contexto, ciclos, snapshot/mapping, vínculos de pedidos y ledger. Es aditiva y no elimina datos históricos.

Estado remoto de `0012`: **NO VERIFICADO**. Aplicar preview → validar → production, con backup/Time Travel.

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

## 14. Scheduler

`.github/workflows/dux-reconcile.yml` llama a `/api/internal/dux/reconcile` y requiere una variable explícita para ejecutar. Debe permanecer deshabilitado hasta verificar plan, token, IDs, `0012` y endpoint desplegado. Usa un solo lock D1 y no despliega.

## 15. Validaciones disponibles

- `npm ci`
- `npm run install:browsers`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run verify`
- `npm run build:pages`
- `git diff --check`

Los resultados actuales se informan al terminar la tarea. No reutilizar conteos históricos como evidencia del candidato.

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
| Plan Dux ESTÁNDAR | abierto | upgrade PRO/FULL |
| Token Dux | ausente/no verificado | generar y cargar secreto |
| IDs de tenant | no descubiertos | consultar endpoints oficiales |
| Unidad/divisibilidad | no expuesta en GET items | confirmar endpoint/campos con Dux |
| Liberación/finalización | no documentada | obtener contrato oficial y probar |
| Migración `0012` | estado remoto no verificado | preview y luego production |
| Scheduler | desactivado | habilitar sólo tras smoke read-only |
| Pago real | no ejecutado | autorización expresa al final |

## 19. Archivos y símbolos críticos

- `server/dux-api.ts`: HTTP Dux, parseo, timeout y rate limit;
- `server/dux-inventory.ts`: configuración, mapping, snapshot y estado;
- `migrations/0012_dux_authoritative_inventory.sql`: persistencia Dux;
- `functions/api/checkout/preferences.ts`: guard antes de Mercado Pago;
- `functions/api/orders/whatsapp.ts`: guard antes de abrir WhatsApp;
- `functions/api/webhooks/mercadopago.ts`: estado financiero histórico;
- `server/config.ts`: flags y bloqueo de lifecycle;
- `src/catalog/model.ts`: proyección Dux;
- `src/admin/DuxPanel.tsx`: diagnóstico read-only;
- `.github/workflows/dux-reconcile.yml`: scheduler condicionado;
- `scripts/run-dux-reconcile.mjs`: runner first-party.

## 20. Último diff aplicado

El candidato actual reemplaza la autoridad local/Mercado Libre por una integración Dux read-only y fail-closed, sin activar producción. El commit, push, CI y deployment se registran fuera del commit una vez resueltos.

## 21. Próximo paso exacto

Completar validaciones locales, commit y push; comprobar CI y Pages del SHA exacto. Después, sin abrir ventas, aplicar `0012` en preview, conseguir PRO/FULL y token, descubrir IDs y ejecutar un smoke read-only. Escalar a soporte Dux el lifecycle y la unidad antes de implementar cualquier mutación.

## 22. Historial de sesiones

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
