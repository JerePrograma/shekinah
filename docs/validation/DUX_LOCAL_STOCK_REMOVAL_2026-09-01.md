# Eliminación de stock local y cierre autoritativo Dux — 2026-09-01

## Alcance

Este registro continúa la fase diagnóstica documentada en `DUX_PRODUCTION_CONFIGURATION_2026-09-01.md`. La intervención funcional comenzó sobre `main` en `f138820e1fc106a5cc58f63f77c1c55dd953212e`; el punto de partida general de la sesión fue `d723f250ec3ef84abfa78bf66675248271106326`.

El objetivo específico fue eliminar toda autoridad activa de stock precargado o local y hacer que cualquier disponibilidad comercial dependa exclusivamente de una observación Dux verificable. La historia de pedidos, pagos, migraciones y auditoría debía preservarse.

No se creó rama, PR, worktree o stash. No se usó reset destructivo, rebase ni force-push. El secreto Dux no se imprimió, incorporó a Git, persistió en D1 ni expuso al cliente.

## Resultado funcional

El commit funcional es:

```text
39ab0077b8227fdbf59b07701ed11967ad56ed45
fix: elimina stock local y exige inventario Dux
```

El cambio:

- elimina `server/local-inventory.ts` y sus pruebas de runtime legacy;
- impide crear, actualizar o proyectar `stockQuantity`, `reservedQuantity` y `availableQuantity` desde las APIs editoriales;
- elimina los controles administrativos de edición rápida de stock;
- genera el catálogo comercial estático con `available=false` y sin contadores locales;
- calcula disponibilidad y límite de carrito únicamente desde un item Dux mapeado, estado vigente, semántica de unidad verificada y cantidad observada positiva;
- exige versión exacta del snapshot Dux para Checkout y WhatsApp;
- bloquea toda venta cuando el mapping, la semántica, el snapshot o Dux no están disponibles;
- no usa Mercado Libre, Excel ni datos editoriales como fallback.

El catálogo canónico sigue conteniendo 510 productos y 16 categorías. El contenido editorial, precios, imágenes y navegación SPA se preservaron.

## Mapping Dux

El algoritmo corregido sigue este orden determinístico:

1. vínculo persistido;
2. código externo exacto;
3. SKU de producto o variante exacto contra código Dux;
4. barcode Dux exacto contra los identificadores canónicos de producto o variante;
5. nombre normalizado exacto y único sólo en una corrida manual `initial` cuando la tabla de inventario está vacía.

Una corrida programada conserva `scheduled` y no puede hacer bootstrap por nombre. Cualquier ambigüedad permanece fail-closed.

El catálogo local no posee un campo de barcode independiente: el paso 4 compara el barcode informado por Dux con SKU o variant SKU. La implementación está revisada por código y pruebas, pero no puede declararse validada contra datos productivos porque Pages Functions todavía no obtiene el primer snapshot.

## Migración `0013`

La migración aditiva `0013_remove_local_catalog_stock.sql`:

- retira los triggers legacy que reservaban o consumían stock local;
- elimina los tres contadores locales de las mutaciones editoriales activas;
- bloquea por trigger la reintroducción de esos campos;
- exige para toda línea comercial nueva `stock_controlled=0`, una versión de proveedor de 64 caracteres hexadecimales y coincidencia exacta con una fila Dux vigente y mapeada;
- no modifica líneas de pedidos históricos.

Antes de aplicarla se obtuvieron bookmarks nuevos de Time Travel:

| Entorno | Base D1 | Bookmark previo a `0013` |
|---|---|---|
| Preview | `48d8ae41-8910-4f8e-b537-3706c07e2cbf` | `00000048-00000000-000050d9-9942f685ce635274b09c6f60b8d0111b` |
| Producción | `533c7c65-1dbb-4f15-be96-c6088700a8e1` | `00000403-00000000-000050d9-170415a664f0f12a61cad458d6e8cd3b` |

La secuencia fue preview → verificación → producción → verificación. En ambos entornos quedaron cero migraciones pendientes, los tres triggers nuevos presentes, los triggers legacy retirados y `PRAGMA foreign_key_check` sin filas.

## Preservación y saneamiento D1

| Control | Preview antes/después | Producción antes/después |
|---|---:|---:|
| Pedidos | 14 / 14 | 15 / 15 |
| Líneas de pedido | 14 / 14 | 30 / 30 |
| Pagos | 1 / 1 | 0 / 0 |
| Mutaciones editoriales | 0 / 0 | 21 / 21 |
| Mutaciones activas | 0 / 0 | 20 / 20 |
| Payloads con stock local | 0 / 0 | 6 / 0 |
| Contexto tenant Dux | 0 / 0 | 0 / 0 |
| Items/snapshot Dux | 0 / 0 | 0 / 0 |
| Vínculos de pedido Dux | 0 / 0 | 0 / 0 |

La limpieza productiva alcanzó exactamente seis documentos editoriales activos. No eliminó pedidos, líneas, pagos, mutaciones, eventos ni historial de migraciones. No creó reservas, pedidos, pagos, snapshots o mappings Dux.

## Validación local

Se usaron Node.js `24.18.0` y npm `11.6.0`, según `.node-version` y `package.json`.

| Control | Estado | Resultado |
|---|---|---|
| `npm ci` | verificado | 233 paquetes instalados; audit informó 2 vulnerabilidades altas preexistentes. |
| instalación de navegadores | verificado | Completada. |
| `npm run verify` | verificado | Lint, TypeScript, 329 pruebas aprobadas, 14 históricas omitidas, catálogo 510/16, seguridad, assets, automatización y Playwright 25/25. |
| `npm run build:pages` | verificado | Build Pages completo; 329 pruebas aprobadas y 14 omitidas. |
| catálogo generado | verificado | 510 productos, cero `available=true` y cero claves locales de stock. |
| `git diff --check` | verificado | Sin errores antes del commit funcional. |
| `git diff --cached --check` | verificado | Sin errores antes del commit funcional. |
| seguridad del bundle | verificado | Sin credenciales ni source maps. |

Vite mantuvo una advertencia no bloqueante por un chunk superior a 500 kB. No se incorporaron dependencias nuevas ni cambios deliberados en `package-lock.json` fuera de la instalación reproducible.

## Configuración externa y bloqueo seguro

La configuración cifrada de Cloudflare conserva el secreto Dux y los IDs autorizados de empresa, sucursal y depósito. Los flags finales permanecen:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
DUX_RECONCILIATION_ENABLED no habilitado
```

Los tres intentos productivos previos de reconciliación continúan registrados como `DUX_UNAVAILABLE`, con cero items procesados. El diagnóstico seguro de `f138820` fue:

```text
kind=fetch_exception
endpoint=/v2/empresas
providerStatus=null
attempts=3
```

No demuestra un status de error de Dux: demuestra que Pages Functions falló antes de recibir una respuesta HTTP. La lectura directa desde el host de operación sí devolvió 743 items, pero no publicó semántica suficiente de unidad/divisibilidad y la API pública revisada no documenta liberación, finalización y expiración compensable de reservas.

Por esos motivos, “atado 100% a Dux” significa en este corte que Dux es la única fuente admitida y que su ausencia bloquea toda disponibilidad; no significa que el comercio pueda activarse sin el snapshot, la semántica y el lifecycle todavía faltantes.

## Intentos fallidos de sólo lectura

Se preservan estos intentos porque forman parte de la secuencia real:

1. `wrangler d1 migrations list DB --remote --preview` no pudo resolver un `preview_database_id`; el binding superior `DB --remote` ya apuntaba a la base preview y fue el comando correcto.
2. Una consulta de conteos con demasiados `UNION` superó el límite de términos del motor; se dividió en consultas menores.
3. Una consulta intentó contar la tabla inexistente `commerce_events`; se corrigió al esquema real.

Ninguno de esos intentos escribió datos. Las aplicaciones efectivas de `0013` terminaron correctamente en preview y producción.

## Estado de publicación al corte documental

El commit funcional `39ab0077b8227fdbf59b07701ed11967ad56ed45` está validado localmente. El SHA documental final, su ejecución de GitHub Actions, el deployment Pages correspondiente y los smokes públicos se registran por separado después del push, porque un commit local o un push no demuestran esos estados.

## Pendientes reales

1. Resolver o autorizar el transporte server-to-server desde Cloudflare Pages hacia la API Dux.
2. Ejecutar un sync manual controlado y auditar el mapping real; no habilitar el scheduler antes.
3. Obtener de Dux un campo o contrato oficial de unidad, divisibilidad y paso de cantidad por item.
4. Obtener y probar el lifecycle oficial de reserva/pedido: crear, consultar, liberar/cancelar, finalizar y expirar, incluida idempotencia ante timeout incierto.
5. Recién después validar Checkout Pro sandbox, webhook y compensación, antes de cualquier activación productiva.

Hasta completar esos puntos no debe habilitarse ningún flag comercial. No hubo force-push.
