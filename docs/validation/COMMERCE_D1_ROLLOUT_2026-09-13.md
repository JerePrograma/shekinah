# Rollout D1 0020–0023 y bloqueo de activación — 2026-09-13 UTC

## Resultado acreditado

D1 Preview y Production quedaron con `0001`–`0023` exactas y contiguas, sin pendientes ni migraciones posteriores, 14 objetos críticos y 15 columnas verificadas, `PRAGMA foreign_key_check` vacío y bookmarks previos preservados. Los datos anteriores de siete tablas comerciales se compararon por columnas originales, cantidad de filas y SHA-256: permanecen idénticos, incluida la reconstrucción de `order_fulfillment` de 0021.

La activación comercial **no está terminada**. Los flags siguen cerrados. Faltan una sesión administrativa válida, un snapshot Dux fresco, los smokes de solicitud/reserva/preferencia y la observación de logs. No se crearon solicitudes, órdenes, reservas Dux, preferencias ni cobros de prueba remotos.

## Repositorio y entorno

- Checkout exclusivo: `C:\laburo\shekinah-release-20260910-155842`. El checkout original `C:\laburo\shekinah` no se inspeccionó ni modificó.
- Estado inicial: `main` limpio en `b7ac69ddac789dcc531af098ad0ab8e3aaa4b26b`. El fetch y pull fast-forward avanzaron a `5bbfcd3bf694a35a4bfa60123ad84f2146ed2006`, base real de esta intervención.
- Se revisaron los commits intermedios. La corrección de `Invoke-Native` sigue presente y no se reemplazó.
- Runtime: Node.js `24.18.0`, npm `11.16.0`, Wrangler `4.131.0`. Node se obtuvo del distribuidor oficial y su ZIP se verificó contra `SHASUMS256.txt`; runtime y descargas permanecen ignorados bajo `.wrangler`.
- Windows PowerShell real: `5.1`, Desktop/.NET Framework. Se invocó el ejecutable de Windows explícitamente; el shell de herramientas era PowerShell `7.6.5` y no sustituye esta comprobación.
- Commit técnico publicado: `babd04dbb40f6c9cb2d3e8177fb61388034b36be`, `test: preservar comillas del self-test D1 en PowerShell 5.1`.
- Único cambio técnico: las dos cadenas JavaScript de `Test-NativeInvocation` usan comillas simples internas y una explicación local. No cambiaron `Invoke-Native`, SQL, dependencias, APIs, checkout, UI ni reglas comerciales.

## Fallos, evidencia y resolución

El fallo histórico de ejecución nativa era la interacción de `$ErrorActionPreference='Stop'`, stderr y `2>&1` en Windows PowerShell 5.1. Ya estaba resuelto: la función relaja la preferencia sólo durante el proceso, captura inmediatamente el código y restaura la preferencia en `finally`. El log antiguo no permite identificar qué subconsulta interna de `migrations apply` falló.

Se reprodujo un defecto adicional del **self-test**: PowerShell 5.1 quitaba las comillas dobles internas de `node -e`, por lo que JavaScript recibía una expresión inválida y salía con 1 en lugar del 23 esperado. El cambio de comillas internas conserva el argumento real. Después se verificaron stdout/stderr, exit 0 y 23 y restauración de `ErrorActionPreference` en PowerShell 5.1 y 7.

La primera lectura remota de Preview devolvió exit 1, código Cloudflare `7403`, en una ejecución que registró renovación OAuth. Las consultas de historial, identidad de bases y la relectura posterior fueron correctas sin cambiar configuración. No se demostró la causa interna de ese fallo transitorio.

El dry-run de ambas bases pasó sobre `babd04d`. El Apply de Preview iniciado a las `19:40:42Z` guardó su bookmark y falló en `d1 migrations apply`, exit 1, código Cloudflare `7500`, `incomplete input: SQLITE_ERROR`, mediante `/query`. Esta vez stdout y stderr quedaron completos. Se detuvo el flujo y se consultó la base: seguía en 0019; no existían columnas, tabla ni objetos de 0020; no había incidencias FK ni cambios en los datos históricos. Production todavía no había recibido escrituras.

La fuente instalada de Wrangler 4.131.0 demuestra que `migrations apply` envía cada SQL con su inserción en `d1_migrations` como `command` a `/query`; `d1 execute --file` utiliza el import oficial. El mismo SQL más el mismo registro de historial pasó mediante `/import`. Esto acota la incidencia al procesamiento de ese payload por `/query`; no identifica el fragmento interno ni permite atribuir un bug específico del servidor. Los archivos originales ya tenían LF: no se atribuye el problema a CRLF.

Se utilizó el antecedente documentado de 0008 en [DEPLOYMENT.md](../DEPLOYMENT.md) y el [import oficial de D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/):

1. Se copiaron los bytes originales de cada archivo permitido a evidencia ignorada y se agregó únicamente la misma inserción de historial que construye Wrangler: `INSERT INTO "d1_migrations" (name) values ('nombre_exactamente_versionado.sql');`.
2. Se verificaron hashes, allowlist exacta, prefijo contiguo y datos históricos antes de cada import. Se probó localmente la secuencia completa y su journal con SQLite, sin incidencias FK.
3. Se guardó otro bookmark previo al import por entorno, sin sobrescribir los anteriores.
4. Se ejecutó `wrangler@4.131.0 d1 execute DB --remote --config .\wrangler.jsonc --file <archivo_verificado> --yes --json`, con `--env production` sólo para Production. SQL y registro de historial viajaron juntos en el mismo import.
5. Se confirmó el historial después de cada archivo. No se reintentó en bucle el comando fallido ni se editó ninguna migración.
6. Preview aprobó toda la verificación y el script original con `-Target preview -Apply -ExpectedCommit babd04dbb40f6c9cb2d3e8177fb61388034b36be` antes de cualquier import productivo.
7. Production siguió la misma secuencia y el script original terminó con exit 0. En ambos cierres el script comprobó el estado ya aplicado; no tuvo que reejecutar SQL.

El migrador versionado conserva su comportamiento normal. Si otro entorno aún pendiente reproduce 7500, consultar su estado real antes de considerar este procedimiento; no registrar una migración cuyo SQL no se haya ejecutado satisfactoriamente en la misma operación.

## Historial remoto

Ambas bases comenzaron en estado A: `0001`–`0019` exactas, 0020–0023 pendientes. Las fechas de 0019 eran `2026-09-08 16:32:06` en Preview y `2026-09-08 17:36:44` en Production. No se alteraron sus registros anteriores.

| Migración | Preview, `applied_at` UTC | Production, `applied_at` UTC |
| --- | --- | --- |
| `0020_web_order_requests.sql` | 2026-09-13 19:48:54 | 2026-09-13 19:52:23 |
| `0021_assisted_dux_checkout.sql` | 2026-09-13 19:49:12 | 2026-09-13 19:53:10 |
| `0022_assisted_dux_order_number_unique.sql` | 2026-09-13 19:49:50 | 2026-09-13 19:53:38 |
| `0023_assisted_dux_lifecycle_financial_guard.sql` | 2026-09-13 19:50:33 | 2026-09-13 19:54:15 |

| Control final | Preview | Production |
| --- | --- | --- |
| Historial exacto y contiguo | 23 migraciones | 23 migraciones |
| Wrangler migrations list | No migrations to apply | No migrations to apply |
| Objetos críticos | 14/14 | 14/14 |
| Columnas críticas | 15/15 | 15/15 |
| Foreign key check | 0 filas | 0 filas |
| Tabla transitoria `order_fulfillment_legacy_0021` | ausente | ausente |
| Tablas históricas conservadas | 7/7 | 7/7 |
| Script original en Windows PowerShell 5.1 | exit 0 | exit 0 |

Objetos verificados en cada base: `idx_web_request_id`, `idx_web_request_token`, `web_request_initial_guard`, `web_request_snapshot_immutable`, `web_request_resolution_guard`, `web_request_preserve_history`, `idx_orders_web_request_id`, `web_request_checkout_order_insert_guard`, `web_request_checkout_source_immutable`, `assisted_order_items_require_dux_catalog_snapshot`, `dux_order_link_assisted_guard`, `idx_dux_assisted_order_number_unique`, `dux_assisted_release_financial_guard` y `dux_assisted_finalize_financial_guard`.

Columnas verificadas:

- `checkout_intents`: `intent_kind`, `web_request_id`, `web_request_token_hash`, `web_request_owner_hash`, `web_request_fingerprint`, `web_request_json`, `web_request_status`, `web_request_updated_at`, `web_request_resolved_at`, `web_request_resolved_by`.
- `orders`: `web_request_id`, `assisted_checkout_fingerprint`.
- `dux_order_links`: `verification_method`, `verification_actor`, `verification_note`.

Comparación de datos por columnas originales y filas ordenadas: `orders` (14 Preview/15 Production), `order_items` (14/30), `payments` (1/0), `checkout_intents` (14/4), `order_fulfillment` (14/10), `dux_order_links` (0/0) y `dux_order_operations` (0/0). Se conservaron sólo hashes y conteos como evidencia, sin volcar datos personales a Git.

## Evidencia y bookmarks locales

Raíz ignorada: `.wrangler/commerce-d1-rollout/20260913-resume-readonly/`. Contiene historiales previos y posteriores, manifiesto de hashes SQL, logs completos de import, recibos de verificación, configuración sanitizada, smokes y diagnósticos. Los identificadores privados y valores de bookmarks no se publican.

| Archivo de bookmark | Creación UTC | Estado |
| --- | --- | --- |
| `20260913-172748Z/preview-before.json` | 17:28:01Z | original preservado |
| `20260913-194042Z/preview-before.json` | 19:40:51Z | previo al Apply fallido |
| `20260913-resume-readonly/preview-before-import.json` | 19:48:49Z | previo al import de Preview |
| `20260913-resume-readonly/production-before-import.json` | 19:52:17Z | previo al import de Production |

Todas las rutas de la tabla son relativas a `.wrangler/commerce-d1-rollout/`. El SHA-256 del bookmark original sigue siendo `5072d6b2de28400b60aedc522072e963e4a463d87e419190087902384b5c505c`. Son recibos de Time Travel sujetos a la retención del servicio, no backups perpetuos. No se ejecutó restore.

## Validación ejecutada sobre el cambio técnico

| Control | Clasificación | Resultado |
| --- | --- | --- |
| `npm ci` | verificado | instalación completa; lock sin cambios |
| `npm run install:browsers` | verificado | Chromium disponible |
| `npm run verify` | verificado | lint, typecheck, tests, catálogo, comercio, pesos, build, assets, seguridad, automatización y E2E correctos |
| Vitest incluido en verify/build:pages | verificado | 114 archivos, 680 tests aprobados, 14 omitidos |
| E2E | verificado | 27 aprobados |
| `npm run build:pages` | verificado | build Pages/Functions correcto |
| Cuatro suites dirigidas de migraciones/readiness/lifecycle | verificado | 4 archivos, 18 tests aprobados |
| Parser PowerShell y self-test JSON/nativo | verificado | PowerShell 5.1 y 7; exit 0 final |
| Mocks Dux | verificado | 27/27 con TEMP normal |
| Diff, rutas explícitas, ausencia de artefactos y secretos | verificado | revisión previa al commit técnico y push sin force |
| Readiness autenticado remoto | no disponible | no hay sesión administrativa utilizable |
| Smokes Dux/Checkout Pro reales | no disponible | dependencias de activación pendientes |

Antes del commit documental se repitieron `npm run verify` y `npm run build:pages` con exit 0, nuevamente 114 archivos, 680 tests aprobados, 14 omitidos y 27 E2E. También se repitieron el parser/self-test en Windows PowerShell `5.1.19041.6456` Desktop y los mocks Dux (27/27). Los enlaces relativos de los cuatro documentos se verificaron y `package-lock.json` conservó su SHA-256 original.

Se conserva un intento fallido de mocks con TEMP redirigido dentro del repositorio: el contrato del test exige su evidencia fuera de él. La ejecución con TEMP normal pasó sin cambios de código. Un helper local de comprobación intentó evaluar un array AST con `SafeGetValue` y falló; se corrigió exclusivamente el helper ignorado para leer sus literales y la comprobación posterior pasó. Ninguno de esos fallos se presentó como prueba aprobada.

`npm audit --json`, sólo lectura, informó cuatro avisos existentes (dos moderados y dos altos: Vitest/mocker, brace-expansion y nanoid). Se preservó el informe; no se ejecutó audit fix ni se alteraron dependencias. Su remediación requiere evaluación separada y no forma parte del diff de este rollout.

## CI, artefacto y Pages acreditados antes del rollout

El SHA técnico `babd04dbb40f6c9cb2d3e8177fb61388034b36be` aprobó [Verify, ejecución 34778228227](https://github.com/JerePrograma/shekinah/actions/runs/34778228227), incluido parser/self-test y mocks Dux. El artefacto `shekinah-dist-babd04dbb40f6c9cb2d3e8177fb61388034b36be` fue generado: 52.271.758 bytes, SHA-256 `9586510da4b7018509a5b9278c15b661ec03929f55e22b484935942d02632eb6`, retención de siete días.

Cloudflare Pages aprobó el mismo SHA y su API confirmó el deployment canónico [d637a5c5.shekinah-7dl.pages.dev](https://d637a5c5.shekinah-7dl.pages.dev), completado a las `19:39:27Z`. El dominio `shekinah.ar` figuraba activo. DB, R2, nombres de secretos y `fail_open=false` se conservaron en ambos ámbitos. El commit documental posterior requiere sus propios checks y recibo final; este párrafo no afirma resultados futuros.

## Flags y smokes de cierre

| Control | Preview | Production |
| --- | --- | --- |
| `WEB_ORDERS_ENABLED` | ausente; efectivo false | ausente; efectivo false |
| `ASSISTED_CHECKOUT_ENABLED` | ausente; efectivo false | ausente; efectivo false |
| `COMMERCE_ENABLED` | false | false |
| `VITE_WEB_ORDERS_ENABLED` | ausente; efectivo false | ausente; efectivo false |
| `VITE_COMMERCE_ENABLED` | false | false |
| `DUX_API_ENABLED` | true | true |
| `DUX_SNAPSHOT_MAX_AGE_SECONDS` | 900 | 900 |
| D1 colección/publicación/cutover Dux | 1 / 1 / 0 | 1 / 1 / 0 |

Ningún flag comercial se habilitó ni requirió rollback. El gate GitHub `DUX_RECONCILIATION_ENABLED` seguía en `false`, con última modificación `2026-09-08T18:37:16Z`; el secreto de scheduler existe y Cloudflare confirmó cero crons en el relay. La revisión automática de aprobación rechazó la operación propuesta de abrir temporalmente ese gate y despachar el refresco: devolvió «bloqueado por política» sin otra razón. El comando no llegó a ejecutarse; no hubo cambio de gate ni nueva corrida Dux.

Los snapshots seguían con 749 productos, publicados el `2026-09-08T16:41:21.884Z` en Preview y `2026-09-08T17:45:11.298Z` en Production. Son antiguos frente a 900 segundos. La medición GraphQL de cuenta observada antes del refresco propuesto reportó 53.641 filas leídas y 321 escritas el 13 de septiembre; no constituye una garantía de cuota futura ni reemplaza el presupuesto del sincronizador.

Smokes GET con TLS verificado en la URL del deployment:

- `/api/orders/request-capability`: HTTP 200, `enabled=false`.
- `/api/admin/auth/session`: HTTP 200, `authenticated=false`.
- `/api/admin/commerce-readiness`: HTTP 401, `ACCESS_TOKEN_MISSING`. Acredita protección de acceso; no acredita readiness saludable.

Windows HTTP y Node rechazaron la cadena TLS de `https://shekinah.ar` (`PartialChain` y `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). OpenSSL con verificación obligatoria mostró un certificado de ese dominio emitido por Fortinet y no confiable en este entorno. Esto identifica la intermediación de la red local; no demuestra un defecto del certificado servido directamente por Cloudflare. No se deshabilitó TLS ni se agregó una CA sin verificar. La navegación directa a la API en el navegador integrado también fue bloqueada por el cliente.

La primera sesión de tail de Pages, en formato JSON y con filtro de IP propia, se observó durante 35 segundos y no entregó salida. Como ese formato no anuncia la conexión, se realizó una comprobación posterior en formato visible con un header exclusivo de los smokes: la conexión al deployment quedó confirmada a las `20:08Z`, se hicieron dos GET y se detuvo a los 45 segundos. Tampoco entregó eventos de invocación. Se preservaron ambos intentos; no se afirma que los logs estén libres de errores. Los smokes de alta/idempotencia/visibilidad administrativa, reserva Dux, preferencia MP, redirección/retorno y webhook real no se ejecutaron. No existen IDs de prueba nuevos ni stock de prueba que liberar; los libros comerciales anteriores permanecen intactos.

## Próximo paso exacto

1. Disponer de la sesión administrativa en la pestaña de `/admin` ya abierta; se solicitó login sin enviar contraseña por chat. No reconstruir una contraseña desde su hash ni fabricar una sesión firmada.
2. Resolver el acceso HTTPS canónico mediante una red o cadena de confianza administrada y válida. Mantener la verificación de certificados.
3. Consultar readiness autenticado con los flags cerrados. Ejecutar un refresco Dux por el flujo existente `/api/admin/dux/sync`, confirmar publicación del mismo run y frescura. Acreditar aparte el scheduler y su frecuencia efectiva.
4. Abrir `WEB_ORDERS_ENABLED`, verificar readiness, solicitud persistente/idempotente y visibilidad administrativa; publicar el frontend con `VITE_WEB_ORDERS_ENABLED` según el flujo documentado.
5. Abrir `ASSISTED_CHECKOUT_ENABLED` y verificar una reserva real en Dux antes de confirmar la preparación asistida. El código registra evidencia de una acción del ERP: no implementa una reserva HTTP automática ni autoriza inventar un número de pedido.
6. Abrir `COMMERCE_ENABLED` sólo después de la reserva confirmada, probar preferencia, redirección/retorno sin cobrar dinero real, webhook/readiness y guards. Mantener oculto el checkout legacy. Si falla una etapa, cerrar sólo el flag recién abierto.
7. Liberar/cerrar cualquier prueba exclusivamente mediante el lifecycle soportado y su evidencia real en Dux; confirmar ausencia de reserva abierta. Revisar logs y registrar CI/Pages del SHA de cierre.

Dux sigue determinando productos, códigos, precios y stock; el decimal se conserva y se venden unidades comerciales completas mediante las reglas existentes. No hubo restore, migraciones posteriores a 0023, modificación de datos reales anteriores, cambios en el checkout original, branches, PRs, worktrees, stashes, force-push ni reescritura de historial. El producto permanece pendiente de activación comercial verificable.
