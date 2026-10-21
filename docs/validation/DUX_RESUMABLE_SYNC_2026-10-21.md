# Sincronización Dux y diagnóstico CI — 2026-10-21

## Base y evidencia inicial: verificado

Repositorio limpio, `main` y `origin/main` en
`1fdd8558526d710b079de0b56808e8244a5def96`. Se ejecutaron status, switch main,
fetch, pull ff-only, status y log antes de editar. Sin ramas, PR, worktrees ni stashes.

- [CI base](https://github.com/JerePrograma/shekinah/actions/runs/36754980803):
  `success`, job Verify `110022806211`; artefactos históricos ya expirados.
- Pages Production `d0f6ffa8-30c0-4f28-af61-92f9270faf95`: `success`, mismo SHA.
- [Reconciliación fallida](https://github.com/JerePrograma/shekinah/actions/runs/39597909644),
  job `119214730043`: HTTP 524 después de dos solicitudes largas. No es una falla
  de compilación ni de permisos de GitHub.
- D1 productiva: 0001–0025; snapshot de 889 productos publicado a las
  `2026-10-09T15:52:40.301Z`. Últimos intentos del 21 de octubre incluyen
  `DUX_PROVIDER_REJECTED` y un run `running` iniciado a las 12:15:16.609 UTC.
  No se forzó su estado SQL ni se atribuyó una causa interna al proveedor.
- Las API públicas de Pages y la lectura autenticada D1 coinciden: códigos
  `799000451`–`799000454` conservan nombres NEUTRO/VIRGEN ENTRENUTS de 200/400CC.
  El usuario informa 180/360 en Dux. La lectura no autoriza cambiar los cuatro
  códigos manualmente; el próximo snapshot debe reflejar el proveedor real.
- Preview conserva 0001–0025 y snapshot de 749 productos del 8 de septiembre.
  D1 y R2 están aislados; flags actuales y secretos permanecen preservados.
- HTTPS canónico desde esta red falla `UNABLE_TO_VERIFY_LEAF_SIGNATURE` /
  `ERR_CERT_AUTHORITY_INVALID`. Las URL técnicas e inmutables de Pages sí
  responden con HTTPS validado. No se omitió la validación de certificados.

## Cambio y contratos

Se aplica [sincronización recuperable](../DUX_RESUMABLE_SYNC.md): lectura por pasos,
staging privado, UUID estable, leases con fencing, recuperación de respuesta final,
presupuesto, publicación íntegra y confirmación del mismo catálogo en UI/runner.
Los controles de comercio, flags, datos existentes y autoridades se conservan.
La migración es aditiva y no cambia migraciones publicadas.

Durante el trabajo el usuario amplió el contrato: nombre y stock de Shekinah
deben provenir de Dux por SKU exacto. Se retira el reemplazo de nombre editorial
Mercado Libre, conservando fotos/descripción aprobadas y títulos históricos como
evidencia. No se edita ningún nombre o stock de producto real manualmente.

La aclaración posterior autoriza también el nombre manual prioritario por SKU;
stock y reservas siguen exclusivamente en Dux. Se agrega `name_override` nullable
en 0027, heredado por defecto y restablecible con `name: null` al nombre Dux vigente.
Fotos, descripción y baja manuales mantienen la prioridad existente. Abrir el editor
o guardar otro campo no convierte el nombre heredado en una excepción.

Archivos funcionales: `functions/api/admin/dux/status.ts`,
`functions/api/admin/dux/sync.ts`, `functions/api/internal/dux/reconcile.ts`,
`scripts/run-dux-reconcile.mjs`, `server/dux-cron.ts`, `server/dux-cron.test.ts`,
`server/dux-inventory-reader.ts`, `server/dux-inventory.ts`,
`server/dux-reconcile-runner.test.ts`, `server/test-fixtures/dux-reconcile-fetch-stub.mjs`,
`server/dux-sync-operation.ts`, `server/dux-sync-operation.test.ts`,
`src/admin/DuxPanel.tsx`, `src/admin/DuxPanel.test.tsx` y
`migrations/0026_dux_resumable_sync.sql`. Documentación: este registro, su contrato,
`README.md`, `docs/CURRENT_STATE.md` y `docs/CONTINUATION.md`.
La ampliación por SKU agrega `server/mercado-libre-editorial-public.ts`,
`server/mercado-libre-editorial-sync.test.ts`, `src/admin/MercadoLibreEditorialPanel.tsx`
y su prueba, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/AUTHORIZED_ASSETS.md`
y `docs/MERCADO_LIBRE_EDITORIAL.md`: 28 archivos en esa etapa.
La aclaración de nombre manual agrega `migrations/0027_dux_product_manual_name.sql`,
`server/dux-product-web-settings.ts` y su prueba, `src/admin/ProductEditor.tsx`,
`src/admin/ProductManager.tsx` y su prueba, `src/catalog/model.ts` y su prueba,
y `docs/PRODUCT_ABM.md`: 37 rutas acumuladas desde la base.

## Validación local

Node 24.18.0 y npm 11.16.0. `npm ci` y `npm run install:browsers`: verificado.
El lockfile no cambia y no se agregan dependencias ni binarios.

La primera `npm run verify` aprobó 1028 pruebas y omitió 14 históricas; 49 E2E
Chromium aprobaron. Durante la revisión posterior se reforzaron carreras entre
claims/leases y los límites del staging. Ese resultado inicial no sustituye la
validación final del diff completo.

Pruebas dirigidas del backend: 23 aprobadas. Incluyen 1000 productos, máximo de
consultas D1 por petición con cuatro consultas reservadas para wrappers, duración
por paso inferior a 60 segundos con proveedor simulado, intervalo Dux de al menos
cinco segundos, recuperación, concurrencia, fencing, presupuestos, fallo intermedio
y paginación cambiante. El caso de 200→180 cc y 400→360 cc conserva ambos códigos,
slugs; actualiza cantidades fraccionarias 12.68→9.25 y reservas 0→1, conserva
nombre/foto/descripción manuales y permite restablecer sólo un nombre al 180 cc
Dux vigente. No acredita una lectura real de Dux.

UI: 31 pruebas dirigidas aprobadas. Runner/relay: 40 aprobadas. ESLint dirigido
y verificador de automatización: verificado. Controles finales generales, commit,
push, CI nuevo, deployment y migración remota se acreditan a continuación al ejecutarse.

La segunda validación general se detuvo en TypeScript por un fixture SQLite que
pasaba valores posiblemente ausentes a `run`. Se agregó el guard de tipos sin
cambiar el comportamiento probado. La tercera `npm run verify` aprobó los 126
archivos: 1046 pruebas, 14 omitidas históricas y 49/49 E2E. Lint, TypeScript,
catálogo, pesos, build, activos, seguridad y automatización: verificado.
Los procedimientos PowerShell simulados aprobaron 27/27 y el self-test del
parser JSON/nativo: verificado. No representan operaciones remotas.

`npm run build:pages`: verificado, 1046 aprobadas y 14 omitidas históricas, con
todos sus controles aprobados. `git diff --check`, enlaces de 57 referencias
documentales y revisión del diff inicial: verificado. Esa revisión comprendía
20 rutas antes de las ampliaciones por SKU y nombre manual.
Lockfile intacto, sin dist, binarios, credenciales ni backups en Git.

La ampliación por SKU aprobó 42 pruebas dirigidas de la capa editorial y su UI,
incluyendo nombre Dux en listado/ficha/carrito/búsqueda con título ML aprobado,
actualización de stock por el mismo SKU y conservación de medios y objetos
históricos. No usa el título como identidad. Se repiten los controles generales
sobre el alcance ampliado antes de publicar.

La cuarta validación general aprobó 1047 pruebas, 14 omitidas y 49 E2E antes de
agregar el nombre manual. La siguiente se detuvo en TypeScript por `.get(hash)`
con hash opcional en un fixture editorial; un guard de tipo cerró el fallo.
La posterior `npm run verify` aprobó 1074 pruebas y 49/49 E2E, con todos sus controles.
La revisión independiente detectó una carrera del editor limpio al cambiar la
publicación: una respuesta con nuevo nombre Dux podía dejar el anterior en el
formulario y crear un override involuntario. Se sincronizan los campos con la
respuesta y se cubren baja y republicación. `npm run build:pages` aprobó 1076
pruebas y todos sus controles después de ese ajuste. Se registra cada etapa;
la validación final incluye además el diagnóstico operativo del runner.

## Resguardos previos: verificado

Time Travel: Preview `000000ab-00000000-0000510b-d068342850d63fbd2f169bc90dfea7b5`;
Production `00000bf4-00000002-0000510b-4eb9a33dece9c61332a437078823d09d`.
Exports privados fuera de Git, restaurados en SQLite local con `integrity_check=ok`,
cero violaciones FK y 25 migraciones. Preview: 2542568 bytes, SHA-256
`8b4e196c9a16336bb8883ae80158645b5d7923008b2541a1d05f394a55cd268e`.
Production: 5072044 bytes, SHA-256
`6434ca7fe4bc0247e33c4bbb06d3faefe2f83a6685489ffb24bc2cc086c2cebc`.

El primer intento de inspección productiva leyó el archivo mientras la descarga
seguía abierta: 3211264 bytes, hash parcial
`b6bde068686246ed94010b9ce930bd1fa002437f05ee561c0842849b07b17185`,
fallo de parseo esperado para el archivo incompleto. Un reintento auxiliar agotó
90 segundos sin acreditar export; se conserva su intento. Al completar la
descarga original, la restauración íntegra sí aprobó. No se alteraron backups
ni bases para corregir ese diagnóstico. No se publican datos ni enlaces firmados.

La aplicación local del SQL 0026 sobre ambas copias restauradas conservó el hash
de todas las tablas anteriores, integridad `ok` y cero violaciones FK. Se crearon
sólo las dos tablas, el índice y el trigger previstos. La operación remota se
acredita por separado; no se infiere de este ensayo.

El ensayo local adicional de 0027 sobre esas copias más 0026 conservó todos los
valores de todas las columnas anteriores: hashes idénticos, integridad `ok`,
cero violaciones FK y todos los nombres manuales inicialmente `NULL`.

## Estado del rollout al preparar el cambio

Pendiente publicar y acreditar el SHA, aplicar 0026 Preview→Production y ejecutar
el nuevo sincronizador real. Sin cobros, pedidos, reservas, modificaciones de stock,
flags ni credenciales. El fallback WhatsApp autorizado se conserva; Link de Pago
y checkout legacy siguen retirados. La cadencia automática y los rechazos Dux
permanecen como incidencias hasta evidencia posterior. No hubo force-push.

## Primera publicación y 0026: verificado

Commit `9f14d24d35d2caeb615e3e2b3eed45595e5f740c`,
`fix: recuperar sincronización Dux por pasos verificables`, publicado en `origin/main`
y comprobado con `git ls-remote`. [CI](https://github.com/JerePrograma/shekinah/actions/runs/39609032261)
`success`, Verify `119252710593`, todos sus pasos aprobados. Artefacto
`shekinah-dist-9f14d24d35d2caeb615e3e2b3eed45595e5f740c`, ID `12348893965`,
52290048 bytes, digest `sha256:1f03af1cc5b37f605936a014ef02b3c44d011a8a314d4fb8ef3ccb32a458eccd`.
Pages Production `42946cda-9601-48ce-9b3f-e3bfdc75e68e`, `success`, mismo SHA,
[URL inmutable](https://42946cda.shekinah-7dl.pages.dev).

0026 se aplicó por import oficial primero Preview y después Production, seis
consultas y 12 filas escritas en cada una. Bookmarks finales Preview
`000000ac-00000006-0000510b-7a03c746b7586273975d2edba015ac18` y Production
`00000bf7-00000006-0000510b-30f04d0c3e26f6e8af47b623083553fc`.
Lectura independiente: 26 migraciones, dos tablas, índice y trigger previstos,
cero violaciones FK, operaciones y staging vacíos. Snapshots sin cambios:
749 Preview / 889 Production. Conteos comerciales conservados: Preview 14 pedidos,
14 líneas y un pago; Production 12 pedidos, 29 líneas y dos pagos. Controles de
catálogo 1/1/0, bindings D1/R2 y flags preservados. No se repitió el import por
la demora de cierre del proceso CLI.

## Prueba real y diagnóstico operativo

[Primer dispatch](https://github.com/JerePrograma/shekinah/actions/runs/39610324160),
job `119257207715`, SHA `9f14d24`: fallido; GitHub mostró `DUX_RECONCILE_TRANSPORT`.
D1 acredita que llegó a Pages: operación `1e5d9d0f-2788-464c-a315-20237c7471de`,
run `dux_sync_7fb14516-5c0b-4899-b105-a7b66f3756a6`, fase `companies`,
13:42:41.005–13:42:41.843 UTC, `DUX_PROVIDER_REJECTED`. Cero productos publicados;
snapshot anterior conservado. Esto no demuestra un fallo TLS de GitHub.
El runner se refuerza para distinguir fase, HTTP observado y clase cerrada de
error, sin mensajes crudos, cuerpos, headers, URL/query ni credenciales.
Se inició [un segundo dispatch observado](https://github.com/JerePrograma/shekinah/actions/runs/39610687803)
con tail filtrado exclusivamente a diagnósticos permitidos; su resultado se registra
al finalizar. El conector Cloudflare informó sesión no conectada; se continuó
con Wrangler y la sesión local ya autenticada.

Una consulta de inspección usó por error una columna `hash` inexistente: falló
sin escrituras. Se corrigió a `catalog_version` y la lectura posterior aprobó.

El segundo ciclo completó las 905 lecturas y la publicación: operación
`6dfbffcd-8d73-4f8e-b895-5996556461aa`, run
`dux_sync_0599a015-daf6-4c9f-90bc-9465d40a37ef`, 13:45:09.713–13:47:18.684 UTC,
`succeeded`, cero fallidas. Catálogo de 905 productos, versión
`875a8ac218426bd98d5f6750f1c6b0868e67dfe2a3e8534ceca235d59ed4cd5c`.
Los cuatro SKU `799000451`–`799000454` acreditan NEUTRO/VIRGEN 180/360CC,
conservando exactamente sus slugs anteriores de 200/400. No se cambió el nombre
por SQL ni desde una fuente alternativa. El run antiguo de las 12:15 terminó
`DUX_SYNC_ABANDONED` por la recuperación existente, sin forzar su estado.
La comprobación canónica de todas las fichas sigue separada del éxito del sync.
El tail sólo observó invocaciones `ok` en este ciclo; no se inventa un HTTP
para el rechazo previo no capturado.

Smoke HTTPS técnico: catálogo y cuatro fichas concordantes con la misma versión,
180/360CC y SKU/URL conservados; stocks reales/disponibles 3/3, 2/2, 3/3 y 2/2,
reservas cero en los cuatro. El catálogo público tiene 674 productos y 13 categorías;
las 231 bajas manuales existentes permanecen conservadas (905−231). Ninguna se
republicó por sincronizar. El endpoint administrativo sin sesión responde 401.
Staging de la operación completada vacío. No se tocaron decisiones web reales.

Antes de 0027 se guardaron bookmarks adicionales: Preview
`000000ad-00000002-0000510b-6469570458719fbeadff028c401be25c` y Production
`00000bf9-000000a4-0000510b-c5801c50610daf69ca22c095ea32a720` (durante colección).
El siguiente `verify` se detuvo por un bloque catch vacío del helper privado
de tail, también incluido por ESLint aunque está fuera de Git. Se documentó
su descarte seguro; se repite la validación sin cambiar código del producto.

La repetición completa aprobó 1087 pruebas, 14 omitidas históricas y 49/49 E2E;
`build:pages` aprobó esos 1087 casos y todos sus controles. Se publicaron las 22
rutas de nombre manual en commit `0da0c995c0bfb5abde8dc57585d988cefed4f98d`,
`feat: conservar nombres manuales por SKU Dux`; push y `origin/main` comprobados.
No se adelantó la migración remota 0027 al CI de ese cambio.

El segundo workflow acabó `failure` sólo en el smoke posterior (job
`119258452843`): el paso Refresh aprobó, pero el verificador canónico terminó
`fetch failed` a las 13:50:13 UTC tras casi tres minutos de GETs. No se revierte
ni se repite Dux para resolver una interrupción de lectura pública. El verificador
se refuerza con recuperación acotada y diagnóstico seguro; `verify_only` manual,
por defecto falso, permite acreditar el catálogo existente sin nueva consulta Dux.
El schedule, permisos `contents: read`, integración Git de Pages y reloj único
se conservan. El CI de compilación no requiere nuevos permisos.

La ampliación de diagnóstico y smoke agrega cuatro rutas al alcance previo:
`.github/workflows/dux-reconcile.yml`, `scripts/verify-automation.mjs`,
`scripts/verify-dux-public-catalog.mjs` y `server/dux-public-smoke.test.ts`;
41 rutas acumuladas desde la base. El runner y su prueba ya estaban incluidos.
Pruebas dirigidas: runner 44/44 y verificador 29/29, incluyendo recuperación de
la misma ficha, tope de intentos/plazo, Retry-After, fallo TLS explícito,
rechazo terminal de JSON/tipo/identidad/stock inválidos y ausencia de datos privados.
No se convierten errores de contenido en éxito ni se debilita HTTPS.

Pages del nombre manual: `c7dfadb2-0752-47b0-9e76-18d59301fa81`, `success`, SHA
`0da0c995c0bfb5abde8dc57585d988cefed4f98d`,
[URL inmutable](https://c7dfadb2.shekinah-7dl.pages.dev). Smoke antes de 0027:
las cuatro fichas incluyen `duxName`, muestran 180/360CC, mantienen SKU/URL/stock,
catálogo 674/13 y administración sin sesión 401. Acredita compatibilidad real
durante el despliegue; no es una escritura manual en productos reales.

[CI del nombre manual](https://github.com/JerePrograma/shekinah/actions/runs/39611718997):
`success`, Verify `119262008002`, SHA `0da0c995c0bfb5abde8dc57585d988cefed4f98d`.
Artefacto `12350342873`, `shekinah-dist-0da0c995c0bfb5abde8dc57585d988cefed4f98d`,
52290832 bytes, digest `sha256:c9e38e2388d3aa890491aff13acdacd3bca129f06bcb126cea830d9df2651fdf`.

0027 aplicada por import oficial Preview→Production después del CI aprobado,
dos consultas y cuatro filas escritas en cada una. Bookmark productivo inmediatamente
anterior `00000bfb-00000000-0000510b-99237c59b8e9ca49ac90ea258b3aaba2`.
Finales Preview `000000ae-00000006-0000510b-bca108568d41eedf912bcc5225070561`
y Production `00000bfb-00000006-0000510b-7d7d55505093217f5f86e25496b53ac7`.
Lecturas independientes: 27 migraciones, columna nullable sin nombre manual
preexistente, cero violaciones FK; snapshot Preview 749 y Production 905 con
la misma versión anterior a 0027, 231 bajas manuales conservadas en Production,
staging vacío. Conteos comerciales preservados: Preview 14/14/1 y Production
12/29/2 (pedidos/líneas/pagos). Controles de catálogo 1/1/0. No se repitieron imports.

La validación previa al ajuste de presupuesto aprobó 1102 pruebas, 14 omitidas históricas y 49/49 E2E,
con lint, TypeScript, catálogos, pesos, build, activos, seguridad y automatización.
`npm run build:pages` sobre este alcance final también aprobó 1102 pruebas y
todos sus controles. `git diff --check`, enlaces documentales (67 referencias)
y revisión completa del diff: verificado. Los controles del índice se repiten
antes de cada commit, preparando sólo rutas explícitas.

## Lista exacta de rutas modificadas desde la base

```text
.github/workflows/dux-reconcile.yml
AGENTS.md
README.md
docs/ARCHITECTURE.md
docs/AUTHORIZED_ASSETS.md
docs/CONTINUATION.md
docs/CURRENT_STATE.md
docs/DUX_RESUMABLE_SYNC.md
docs/MERCADO_LIBRE_EDITORIAL.md
docs/PRODUCT_ABM.md
docs/validation/DUX_RESUMABLE_SYNC_2026-10-21.md
functions/api/admin/dux/status.ts
functions/api/admin/dux/sync.ts
functions/api/internal/dux/reconcile.ts
migrations/0026_dux_resumable_sync.sql
migrations/0027_dux_product_manual_name.sql
scripts/run-dux-reconcile.mjs
scripts/verify-automation.mjs
scripts/verify-dux-public-catalog.mjs
server/dux-cron.test.ts
server/dux-cron.ts
server/dux-inventory-reader.ts
server/dux-inventory.ts
server/dux-product-web-settings.test.ts
server/dux-product-web-settings.ts
server/dux-public-smoke.test.ts
server/dux-reconcile-runner.test.ts
server/dux-sync-operation.test.ts
server/dux-sync-operation.ts
server/mercado-libre-editorial-public.ts
server/mercado-libre-editorial-sync.test.ts
server/test-fixtures/dux-reconcile-fetch-stub.mjs
src/admin/DuxPanel.test.tsx
src/admin/DuxPanel.tsx
src/admin/MercadoLibreEditorialPanel.test.tsx
src/admin/MercadoLibreEditorialPanel.tsx
src/admin/ProductEditor.tsx
src/admin/ProductManager.test.tsx
src/admin/ProductManager.tsx
src/catalog/catalog.test.ts
src/catalog/model.ts
```

No cambian lockfile, dependencias, `.github/workflows/ci.yml`, bindings, secretos,
flags, cobros ni reglas de reserva. Backups, helpers, descargas y dist permanecen
fuera de Git. Revisión independiente del nombre manual, migración y modo de
verificación: revisado por código; no se confunde con una mutación productiva de prueba.
El fallback público WhatsApp autorizado se conserva; Link de Pago y checkout
legacy permanecen retirados. No hubo force-push, ramas, PR, worktrees ni stashes.

Incidencias separadas del cierre de código: rechazo intermitente del proveedor
sin causa interna acreditada y cadencia efectiva irregular de GitHub. El límite
D1 existente de 40.000 estimadas no se aumenta; deltas y recuperaciones conservan
su coste y pueden agotar el presupuesto. La operación exitosa no acredita una
cadencia sostenida ni una activación comercial nueva. HTTPS canónico desde esta
red local sigue no disponible; la evidencia canónica se toma del runner GitHub.

## Revisión del presupuesto antes del cierre

Se detectó una regresión propia antes de cerrar el parche: la primera versión
reservaba 256 adicionales y el core todavía 64; un día hipotético de 288 ciclos
sin cambios habría reservado 92.160 contra 40.000. Era diferente de la cadencia
irregular externa y no se dejó como un incidente externo. Se fusionan claim e
incremento del contador, manteniendo fencing e intentos máximos. Se reservan
120 para colección/limpieza incluso ante fallo y 16 antes de cada publicación.
El core prepagado conserva sólo 14 por delta; los callers legacy conservan 64.
Manual/inicial suma 96 por auditorías de hasta 80 POST. Tras una lectura
interrumpida se cobran cinco antes de cada ordinal excedido y los posteriores;
la recuperación de publicación vuelve a cobrar 16. Ninguna reserva se devuelve.
Un presupuesto insuficiente termina explícitamente y conserva la publicación
anterior; llegar a 45 lecturas no deja un 202 indefinido ni aborta un lease activo.
El fallo usa token, fase, offset e intentos para evitar abortar un paso avanzado.

La cota sana programada es 136 por ciclo, 39.168 para 288 ciclos de hasta 1000
productos en páginas de 50, sin cambios ni reintentos. La simulación comprueba
un no-op máximo real y el último ciclo con el contador de 287 ciclos previos;
no se presenta como 288 lecturas reales a Dux ni como facturación Cloudflare.
`total_changes()` mide escrituras lógicas locales, sin índices, y no sustituye
`meta.rows_written`. Los índices y otros fallos conservan el margen original
hasta la cuota D1; no se presupone una cuenta paga ni se cambia de scheduler.
Se repiten las validaciones generales porque cambió el backend del sincronizador.

Pruebas dirigidas del presupuesto: 29/29, TypeScript y ESLint aprobados. La
medición de un ciclo sano máximo da 7 escrituras lógicas en el primer paso,
22×4 en los siguientes y 33 en publicación: 128, cubiertas por 136 reservadas.
Dos no-ops completos de 1000 productos, con contador diario intermedio simulado,
acreditan 39.168 al completar el ciclo 288. Se cubren delta de 14, margen manual
96, insuficiencia en colección/publicación, recargos 5/16 y fencing con token nulo.
Una prueba dirigida aún esperaba el margen manual inicial de 32: se corrigió a
96 tras incluir las hasta 80 auditorías por operación. Se conserva el intento.

`npm run verify` con el presupuesto corregido: verificado, 126 archivos, 1108
pruebas aprobadas, 14 omitidas históricas y 49/49 E2E; todos sus controles aprobados.
`npm run build:pages` con ese mismo alcance: verificado, 1108 aprobadas y 14
omitidas, con todos sus controles aprobados. Diff completo, 67 enlaces locales,
lockfile intacto y ausencia de binarios/secretos/dist en el índice: verificado.
