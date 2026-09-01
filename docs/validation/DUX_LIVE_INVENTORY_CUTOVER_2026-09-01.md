# Corte de inventario Dux en vivo — 2026-09-01

## 1. Alcance y fuente de verdad

Este registro documenta una fase nueva posterior a los cierres históricos de configuración Dux y eliminación de stock local. No reemplaza ni corrige retrospectivamente sus intentos fallidos.

- repositorio: `JerePrograma/shekinah`;
- rama obligatoria: `main`;
- SHA base de esta fase: `2bbd62f547b9b0de84f8794a6dcf679ef07a7df8`;
- autoridad de inventario: Dux Software;
- stock local activo: eliminado por `0013_remove_local_catalog_stock.sql`;
- Checkout Pro, pedidos WhatsApp transaccionales y sincronización directa Mercado Libre: cerrados.

El resultado productivo, el SHA candidato, CI, deployment, aplicación remota de `0014` y primer sync se completarán sólo con evidencia observada. Un build local no acredita ninguno de esos estados.

## 2. Custodia de credenciales

El token Dux suministrado se conserva únicamente como secreto cifrado server-side de Cloudflare Pages. No se incorporó a Git, D1, variables `VITE_*`, logs, respuestas, documentación ni bundle. Las comprobaciones de este registro no imprimen valores de secretos, cookies, credenciales administrativas ni identificadores privados de cuenta.

## 3. Diagnóstico aislado del transporte

Los tres sync productivos históricos fallaron con `DUX_UNAVAILABLE` antes de recibir una respuesta HTTP clasificable. Para aislar la causa se creó un Worker temporal sin secretos y se compararon modos de redirección contra el mismo origen Dux:

- una lectura sin autenticación y con `redirect: 'manual'` recibió una respuesta HTTP clasificable;
- la misma familia de lecturas con `redirect: 'error'` falló antes de exponer headers;
- la conectividad general del Worker respondió correctamente contra un origen de control.

La causa quedó acotada a la interacción Cloudflare `fetch`/Dux con `redirect: 'error'`; no se atribuyó sin evidencia a DNS, TLS, token, cuerpo, caché o plan comercial. El Worker temporal no forma parte de la arquitectura y debe eliminarse al cerrar la fase.

## 4. Corrección de transporte y paginación

El candidato cambia el cliente Dux a `redirect: 'manual'` y mantiene fail-closed:

- nunca sigue redirecciones;
- rechaza explícitamente cualquier estado `300`–`399` antes de leer el cuerpo, consultar `ok` o inspeccionar `Location`;
- la cancelación del stream de una redirección es best-effort y no bloquea la respuesta;
- el diagnóstico v2 sólo registra endpoint de una allowlist, estado numérico, intentos, fase, clase cerrada de error y si hubo headers;
- nunca registra URL completa, query, headers, token, cuerpo ni mensajes crudos de excepciones;
- fija el total de la primera página, exige el mismo total en las siguientes, prohíbe excederlo y exige que el conteo recibido coincida exactamente al finalizar.

Las pruebas cubren `300`, `302` y `399`, stream cuya cancelación no termina, inconsistencias de total y truncamiento de páginas, fallos antes de headers, durante lectura de cuerpo y durante clasificación.

## 5. Preflight read-only del catálogo Dux

La API oficial se había validado directamente con 743 items habilitados. Como control adicional se inspeccionó un export técnico generado por el propio ERP, exclusivamente de forma read-only:

- 744 filas de producto;
- 676 configuradas como controlables por stock y 68 no controlables;
- 653 simples y 91 combos;
- todas las filas informaron unidad de venta y medida `UNIDAD`;
- no se observaron variantes ni configuración de stock negativo;
- no había códigos externos y sólo dos filas tenían barcode.

El XLS no fue importado, no alimenta el runtime y no se usa como fallback, fuente de stock ni mapping productivo. La API habilitada y el export pueden representar universos distintos; por eso el cutover no exige 743 ni 744 como total fijo. Exige consistencia interna con `paginacion.total` de la corrida real.

## 6. Bootstrap conservador de identidad

La precedencia continúa siendo:

1. vínculo persistido;
2. `codigo_externo`;
3. SKU exacto de producto o variante;
4. barcode Dux exacto contra esos identificadores canónicos;
5. nombre únicamente durante una corrida `initial` con inventario visible vacío.

El último paso usa una clave conservadora: NFKC, minúsculas, espacios normalizados, diacríticos plegados preservando `ñ` y equivalencias exactas de cantidad sólo para tokens completos reconocidos (`kg`/`g`, `l`/`ml`, `cc`/`ml`). Conflictos entre nombre, presentación e ID histórico vetan el bootstrap. No se elimina puntuación arbitraria, no se singulariza, no se aplican sinónimos, fuzzy matching, coincidencias parciales ni aritmética de packs. Las colisiones permanecen `ambiguous`.

La auditoría previa sobre las 510 filas versionadas encontró 73 candidatos conservadores 1:1, una colisión compartida de Anís y una anomalía histórica donde el ID `cola-de-pavo-futuro-fungi-50ml` acompaña el nombre `Hongos de Pino 100gr`. Esa anomalía queda vetada para mapping por nombre. Se incorporaron al control las tres filas editoriales que existen sólo en D1 productiva (`arcayuyo-hierba-andina`, `copa-copa-artemisia-copa` y `rica-rica-hierba-andina`): sus claves son únicas localmente y no tienen coincidencia en el export Dux, por lo que el total efectivo continúa en 73 candidatos 1:1 y una ambigüedad. Estas cifras son preflight y no equivalen a un mapping productivo.

La canonicalización sólo compara identidad durante bootstrap. Nunca define unidad comercial, pesabilidad, divisibilidad, paso comprable, peso de envío ni transforma cantidades de stock Dux.

## 7. Publicación atómica e incremental del snapshot

`0014_dux_atomic_inventory_snapshots.sql` es aditiva y agrega:

- `dux_inventory_generations`;
- `dux_inventory_generation_items`;
- `dux_d1_write_budget`, con una fila por fecha UTC;
- una única generación `published`;
- índices por run, identidad y producto local;
- el trigger `dux_inventory_generation_publish_guard`.

Cada sync carga primero una generación `loading`. Durante esa carga, catálogo, administración y guards continúan leyendo exclusivamente la publicación anterior de `dux_inventory_items`. El Worker descarga y valida el universo Dux completo, lo compara en memoria con la publicación y stagea únicamente filas nuevas, materialmente cambiadas o que pasan por primera vez a `absent`. La publicación aplica ese delta por `UPSERT`, supersede/publica generaciones, fija la frescura global al `completedAt`, actualiza tenant/run y limpia staging en un único `D1Database.batch`; Cloudflare D1 documenta ese batch como transaccional y con rollback completo ante el fallo de una sentencia. El trigger exige que `changed_count` coincida con staging y que `item_count` coincida con la cardinalidad visible resultante antes de permitir `published`.

Una corrida idéntica publica `changed_count=0`, renueva `dux_tenant_context.verified_at` y no ejecuta `INSERT`, `UPDATE` ni `DELETE` sobre `dux_inventory_items`. `last_synced_at` conserva la observación material de cada fila y la lectura calcula frescura con el timestamp global publicado. Una carga o publicación fallida capturada limpia su staging y conserva íntegra la generación anterior; una terminación abrupta de runtime puede dejar `loading` hasta que la recuperación versionada del lease lo marque fallido a los 30 minutos. “Atómico” significa que nunca se expone medio delta: no convierte un run `partial` en `succeeded`, no convierte D1 en autoridad y no habilita Checkout.

Las filas cambiadas se insertan en staging de a 50 mediante sentencias multi-row derivadas de JSON, no mediante una consulta D1 por unidad. Antes del bind se mide el payload UTF-8 y se falla cerrado si sale del margen seguro del parámetro D1. El techo es 20 páginas/1.000 items y también 1.000 identidades después de expandir variantes; el lease se renueva cada diez intentos HTTP. La fase de lecturas Dux tiene un deadline monotónico de siete minutos y un presupuesto de 45 intentos HTTP, incluidos retries; falla antes de esperar/iniciar una operación que exceda el plazo o antes del intento 46. El mapping, hashing, staging y batch de publicación quedan fuera de ese reloj y deben acreditarse mediante el resultado real de Functions. Workers Free permite 50 subrequests externos. El core exitoso usado por los handlers productivos ejecuta como máximo 42 consultas D1; el endpoint interno completo llega a 43, el administrativo exitoso a 45 y su falla capturada extrema a 48. Un no-op del core usa entre 18 y 21. Todos quedan bajo las 50 consultas D1 por invocación. Con 743 items una corrida normal usa 18 lecturas Dux y tarda aproximadamente 85 segundos por el rate limit. El universo observado queda cubierto; un universo o transitorio que exceda cualquier presupuesto falla cerrado y conserva la publicación anterior.

La cuenta usa Workers/D1 Free: 5 millones de filas leídas y 100.000 escritas por día. La estrategia anterior de reemplazo completo hubiera superado el presupuesto diario con un cron cada 15 minutos. El delta actual realiza aproximadamente ocho mutaciones lógicas constantes en un no-op y `3C + O(1)` filas base para `C` cambios, más índices. Antes de staging se reserva atómicamente `64 + 14C` contra un máximo conservador de 40.000 estimadas por fecha UTC dentro de esta D1; la reserva no se revierte ante un fallo posterior. La primera carga es deliberadamente completa y única. Como la cuota Free es compartida por toda la cuenta y no sólo por esta base, el runbook debe revisar `rows_written` global real antes de cada ambiente y antes del scheduler; el guard local deja margen, no constituye una garantía account-wide. El límite de CPU Free de 10 ms no puede acreditarse mediante tests locales; el primer sync y un no-op deben revisar resultado y métricas de Functions. Ante `exceededCpu`/1102 se vuelve a cerrar Dux/scheduler y no se compra un plan ni se aumenta un límite sin autorización.

## 8. Validación local del candidato

Runtime exigido:

```text
Node.js 24.18.0
npm 11.6.0
```

Controles ejecutados antes del cutover:

| Control | Resultado |
|---|---|
| `npm ci` | aprobado; 233 paquetes; 2 vulnerabilidades altas preexistentes, sin auto-fix |
| instalación de navegadores | aprobada |
| pruebas focales Dux/migraciones/handlers/runner | aprobadas; 75 pruebas |
| `npm run verify` | aprobado; 358 pruebas Vitest, 14 omitidas y Playwright 25/25 |
| `npm run build:pages` | aprobado; 60 archivos/358 pruebas Vitest y artefacto Pages generado |
| `git diff --check` | aprobado antes de documentación; debe repetirse al preparar el commit |
| análisis de secretos en el diff | cero coincidencias en patrones controlados |

Warnings conocidos y no introducidos por este cambio: chunk principal superior a 500 kB, advertencia de tiempo del plugin y una ambigüedad editorial de peso en `naranja-en-rodajas-deshidratada-x-250-gr`. Ninguno habilita una inferencia de unidad Dux.

## 9. Estado externo previo al cutover

- `origin/main`: `2bbd62f547b9b0de84f8794a6dcf679ef07a7df8`;
- D1 preview y producción: migraciones aplicadas hasta `0013`;
- `0014`: pendiente;
- inventario Dux visible: 0;
- contexto de tenant Dux: 0;
- vínculos y operaciones de pedidos Dux: 0;
- payloads activos de stock local: 0;
- `DUX_API_ENABLED=false`;
- `DUX_SNAPSHOT_MAX_AGE_SECONDS=900` (debe pasar a `1800` antes del scheduler de 15 minutos);
- `COMMERCE_ENABLED=false`;
- `VITE_COMMERCE_ENABLED=false`;
- flags Mercado Libre directos: `false`;
- `DUX_RECONCILIATION_ENABLED=false`.

Preflight remoto observado inmediatamente antes de publicar el candidato:

| Entorno | Bookmark Time Travel | Pedidos | Líneas | Pagos | Mutaciones catálogo | Payloads stock local | Runs Dux | Running | Tenant / inventario / links / operaciones |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Preview | `00000049-00000000-000050d9-7e86ca3d7a28e684833ca204fb209b78` | 14 | 14 | 1 | 0 | 0 | 0 | 0 | 0 / 0 / 0 / 0 |
| Producción | `00000412-00000000-000050d9-dec94afda0ebd6f3f74096e7ca77a570` | 15 | 30 | 0 | 21 | 0 | 3 | 0 | 0 / 0 / 0 / 0 |

`wrangler d1 migrations list --remote` confirmó que sólo `0014_dux_atomic_inventory_snapshots.sql` está pendiente en cada base. El dashboard D1 mostraba, para las últimas 24 horas, 281 filas escritas en producción y 77 en preview; las dos bases son las únicas de la cuenta. El total observado de 358 queda muy por debajo de 100.000/día antes de cualquier migración o sync. La tarjeta account-wide del período de facturación mostraba 10,88 mil filas escritas; esa cifra de período no sustituye el control móvil de 24 horas.

## 10. Checklist de migración remota

1. publicar y verificar el SHA candidato con Dux todavía deshabilitado;
2. obtener bookmarks Time Travel de preview y producción;
3. comprobar que sólo `0014` esté pendiente;
4. aplicar `0014` primero en preview;
5. verificar tablas, índices, trigger, `PRAGMA foreign_key_check`, conteos preservados y cero generación `loading`;
6. aplicar `0014` en producción únicamente si preview aprobó;
7. repetir los mismos controles sin modificar pedidos, líneas, pagos, mutaciones, inventario visible ni datos históricos.

`0014` se preserva ante rollback. Si aparece una incidencia se deshabilitan Dux y scheduler; no se hace `DROP`, no se borra manualmente el snapshot anterior y no se edita una migración ya aplicada.

## 11. Checklist del primer sync

El primer ciclo debe salir de `/api/admin/dux/sync` con sesión administrativa válida. El endpoint interno del scheduler siempre usa `kind=scheduled` y no puede ejecutar el bootstrap de nombre.

Antes de iniciarlo:

- cero generaciones `loading` o `published`;
- cero inventario visible;
- cero vínculos y operaciones de pedidos Dux;
- pedidos, líneas y pagos con conteos preservados;
- comercio, Checkout Pro, WhatsApp transaccional, Mercado Libre directo y scheduler apagados.

Después de una única invocación:

- `kind=initial`;
- `status=succeeded`, `failed=0` y `error_code=NULL`;
- `processed = mapped + unmapped + ambiguous + failed`;
- exactamente una generación `published` y cero `loading`;
- `item_count` igual al inventario visible, `changed_count` igual a la carga inicial y staging vacío después de publicar;
- tenant igual a empresa/sucursal/depósito previamente verificados;
- cero duplicados de `local_product_id` entre filas `mapped` vigentes;
- cantidades decimales y negativas conservadas exactamente;
- toda semántica `unavailable_from_v2_items` y `checkout_eligible=0`;
- pedidos, líneas, pagos, vínculos y operaciones Dux sin cambios.

Antes de habilitar el cron, configurar `DUX_SNAPSHOT_MAX_AGE_SECONDS=1800`: el valor previo de 900 segundos coincide exactamente con el intervalo nominal y produciría ventanas stale por duración normal y jitter. Después del primer ciclo, una segunda reconciliación sin cambios debe publicar `changed_count=0`, mantener idénticas las filas visibles y renovar sólo la frescura global/estado operativo.

Si cualquier control falla, se deshabilita Dux y se conserva la evidencia. No se repite el sync en bucle ni se corrige stock manualmente.

## 12. CI, deployment y resultado remoto

Estado previo al primer push de esta fase:

| Evidencia | Estado |
|---|---|
| SHA candidato | pendiente |
| CI del SHA | pendiente |
| deployment Pages del SHA | pendiente |
| migración `0014` preview | pendiente |
| migración `0014` producción | pendiente |
| primer sync `initial` | pendiente |
| auditoría del snapshot | pendiente |
| scheduler read-only | deshabilitado |
| Checkout Pro / WhatsApp transaccional | deshabilitados |

## 13. Git y recuperación

No se crearon ramas, pull requests, worktrees ni stashes. No se usó ni se autoriza force-push, rebase destructivo, `git reset --hard` o `git clean -fd`. Los commits, push, SHA final de `origin/main`, CI y deployment se completarán al final de este mismo registro con evidencia observada.
