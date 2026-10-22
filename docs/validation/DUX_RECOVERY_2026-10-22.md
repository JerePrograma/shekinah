# Diagnóstico y recuperación Dux — 2026-10-22

## Base y diagnóstico inicial verificados

Repositorio limpio sobre `main` y `origin/main`, base
`fb940a01dadefc2ae1f714f4c93ac27bcaa5b118`. Se ejecutaron status, switch main,
fetch, pull ff-only, status y log antes de editar. Sin ramas, PR, worktrees ni stashes.
El usuario pidió verificar las causas y corregir los errores Dux.

- La reconciliación automática [#360](https://github.com/JerePrograma/shekinah/actions/runs/39821858394)
  completó 899 productos a las `17:23:21.603Z`, sin fallidos, sobre el SHA base.
  Los fallos anteriores de #357 y ambas ejecuciones #359 se conservan.
- Una lectura controlada [#361](https://github.com/JerePrograma/shekinah/actions/runs/39824881927)
  inició a las `17:41:36.670Z` y falló en `items`, offset 100 de 899, intento 6,
  a las `17:42:07.355Z`. La observación filtrada de Pages acreditó HTTP **400**
  en `/v2/items`, `provider_rejected`, con headers recibidos. El HTTP 502 de
  Shekinah traduce ese rechazo; no es un HTTP 502 emitido por Dux.
- La consulta de sólo lectura conserva 12 órdenes, 2 pagos, 29 líneas,
  231 bajas manuales y cero nombres manuales. Snapshot anterior: 899 productos.
  Presupuesto lógico reservado del día: 2.120 de 40.000.
- El reloj GitHub solicitaba cinco minutos pero los últimos inicios automáticos
  fueron `01:47:36Z`, `06:38:20Z`, `12:22:15Z` y `17:21:03Z`.
  Esto acredita intervalos incompatibles con la vigencia de 900 segundos.
- La API autenticada de Cloudflare mostró el relay sin cron y con versión
  `2f556350-934e-4ae0-80cc-8cdfa3be7810`, desplegada el 8 de septiembre.
  La publicación Pages del 21 de octubre no actualizó ese Worker independiente.

La documentación oficial vigente de [items v2](https://developers.duxsoftware.com.ar/reference/listar_items-1)
admite `habilitado`, `offset` y `limit` máximo 50, como la consulta actual.
El 400 está documentado como validación, sin demostrar por sí solo el campo o
motivo concreto. No atribuirlo a credenciales, rate limit ni parámetros inválidos
sin el diagnóstico del proveedor.

La [documentación de límites Dux](https://developers.duxsoftware.com.ar/reference/rate-limit)
actualizada el 27 de agosto distingue v2 (cuota informada por headers, estándar
cinco solicitudes por segundo) de v1 (intervalo por token). Se conserva la
compuerta compartida y conservadora de seis segundos; no se acelera ni se presume
que otra integración comparte el token. HTTP 429 respeta el tiempo de espera.

## Corrección en validación

0030 agrega diagnóstico seguro del proveedor y recuperación acotada a la operación
existente. Se conserva una lectura oficial por paso, misma identidad, lease,
staging, publicación completa, tope de 45 intentos y presupuesto diario. Sólo se
recuperan timeout, transporte, 429 y 5xx; 400, autenticación, redirección y esquema
inválido requieren revisión. El catálogo anterior y sus fechas no se rejuvenecen.

Administración distingue el estado original Dux y explica rechazo o recuperación.
No se conservan cuerpos, mensajes, headers, tokens ni datos de clientes del proveedor.
El relay actualizado limita 50 llamadas a Pages contando repeticiones de transporte.

La frecuencia candidata Cloudflare es diez minutos. La base lógica diaria baja
de 39.168 a 19.584, dejando margen para cambios y recuperación sin ampliar cuota.
Con la duración observada de aproximadamente 129 segundos, el intervalo sano
estimado conserva la lectura dentro de 900 segundos. Esta estimación no reemplaza
cuatro ciclos automáticos consecutivos ni acredita tolerancia a fallos persistentes.

## Controles y rollout

Pruebas locales: Node 24.18.0 / npm 11.16.0, `npm ci` y Chromium aprobados.
`npm run verify` aprobó lint, tipos, 131 suites / 1.250 pruebas unitarias,
14 skips históricos, catálogo, pesos, build, activos, seguridad, automatización y
55 E2E. El parser del migrador y 27/27 mocks PowerShell aprobaron.
La primera `build:pages` agotó 10 segundos en una prueba previa de paginación
administrativa, con el resto 1.249 aprobado. Esa prueba aislada aprobó en 1,84
segundos sin cambiar código ni timeout. Se repite el build completo con cuatro
workers locales para reducir contención: aprobó las 131 suites / 1.250 pruebas
sin cambiar código ni timeout y completó todos los controles `build:pages`.
El dry-run del Worker también aprobó (7,95 KiB, gzip 2,42 KiB).

Archivos de esta corrección: `.github/workflows/dux-reconcile.yml`, `README.md`,
`config/dux-cron.jsonc`, `docs/CONTINUATION.md`, `docs/CURRENT_STATE.md`,
`docs/DUX_RESUMABLE_SYNC.md`, `docs/DUX_STOCK_ALL_WAREHOUSES.md`, este registro,
`scripts/verify-automation.mjs`, `server/dux-api.ts` y su prueba,
`server/dux-sync-operation.ts` y su prueba, `server/dux-cron.ts` y su prueba,
`src/admin/DuxPanel.tsx` y su prueba, y migración 0030. Sin cambios de dependencias,
lockfile, secretos, binarios o artefactos generados rastreados.

Bookmarks previos a 0030:

- Preview `48d8ae41-8910-4f8e-b537-3706c07e2cbf`:
  `000000b2-00000000-0000510c-1385ea2567ec568f543ef4bb09b0c89d`.
  Conteos previos: 14 órdenes, 1 pago, 14 líneas, 749 productos Dux, 0 bajas y
  0 nombres manuales.
- Production `533c7c65-1dbb-4f15-be96-c6088700a8e1`:
  `00000c49-0000002c-0000510c-bc33fd472dd8309b517161a1300b6490`.
  Conteos previos: 12 órdenes, 2 pagos, 29 líneas, 899 productos Dux, 231 bajas y
  0 nombres manuales.

Ambas listas de migraciones mostraron únicamente 0030 pendiente. Estos bookmarks
no acreditan que haya sido aplicada. Se verificó el binding `DUX_CRON_SECRET`
de tipo secreto en el Worker y su nombre configurado en Pages, sin extraer valores.

## Publicación y migraciones verificadas

Commit funcional `fbbe8a8ddfd57a5212da99ac92c73d95458dd156`, publicado con
`git push origin main` y hash remoto coincidente. Árbol limpio tras el push;
`git diff --check` y `git diff --cached --check` aprobados.

- [CI #569](https://github.com/JerePrograma/shekinah/actions/runs/39828084646):
  `success`, job Verify `119996613181`. Artefacto `12448156282`,
  `shekinah-dist-fbbe8a8ddfd57a5212da99ac92c73d95458dd156`, 52.301.168 bytes.
- Pages Production `b3465be3-62a3-4a6e-8855-a8829c77a582`: `success`,
  mismo SHA funcional confirmado por API autenticada.
- 0030 aplicada mediante el migrador oficial Wrangler primero en Preview y
  después en Production. Ambas verifican historial 0001–0030, nueve columnas
  nuevas, claves foráneas sin errores y exactamente los conteos previos.
  Production confirmó cero sincronizaciones activas antes de encender el reloj.
- `DUX_RECONCILIATION_ENABLED=false` verificado en GitHub antes de publicar el
  relay, sin variable de entorno que lo sustituya y sin jobs Dux activos o en cola.
  El nuevo workflow sólo admite despacho manual; `verify_only` no necesita abrir
  ese gate y no ejecuta la lectura oficial.
- Worker publicado desde el árbol funcional limpio con tag `dux-recovery-fbbe8a8`
  y mensaje del SHA completo; versión `677dbc3c-7acc-4d89-83a6-f90dc6c92cd5`,
  deployment `599c4d6a-f6c3-405c-b81e-74e046e9d330`, `100%` desde
  `2026-10-22T18:11:14.382552Z`, startup 1 ms. Se conservaron vars y el secreto.
  Bundle dry-run SHA-256
  `b6921a1c8d9572708fb42a38d0062a4d5d7f7c66a2d0a1e3b3474d83317407f9`.
- API Cloudflare confirmó un único cron `2-52/10 * * * *`, creado a las
  `18:11:20.211214Z`, sin ruta pública del relay. Los relojes no se superpusieron.

La lectura de las `18:11:55.808Z` todavía mostraba el snapshot anterior, con
stock leído a las `17:21:17.726Z`; configurar el reloj no lo convirtió en vigente.
Pendiente de registrar: cuatro ciclos automáticos, catálogo público y diagnóstico
del siguiente rechazo 400 si vuelve a ocurrir.

## Lectura controlada posterior al rollout

Se abrió temporalmente el gate del workflow **manual**, ya sin evento schedule,
para despachar [#362](https://github.com/JerePrograma/shekinah/actions/runs/39829722187)
sobre el SHA funcional. Una vez iniciado el job se volvió a cerrar y verificar
`false` a las `18:16Z`; Cloudflare conserva el único reloj automático.
No se repitió el ciclo con otra identidad ni se habilitó el antiguo cron GitHub.

La operación `dux_sync_ba2a5071-0aed-40e3-812c-8af7f3ae3ddc`, actor
`scheduler:github-actions`, inició `18:15:39.276Z`, completó 21 lecturas y publicó
899 productos a las `18:17:42.706Z`, sin fallidos ni diagnóstico de proveedor.
Versión de catálogo `3d9ea1a0fde512774dc8dbe929d8e374b85d7300dbc07fea6f8e3b3831714716`.
No cuenta como evidencia de cadencia automática.

El GET de la URL técnica Pages validó TLS, HTTP 200, 675 productos publicados y
13 categorías. El POST de cotización `/api/marketing`, sólo lectura y sin cupón,
respondió 200, descuento cero y subtotal igual al precio Dux publicado. La
comprobación inicial leyó equivocadamente `price` como número y no envió el POST;
se corrigió a la forma documentada `price.amount`. No se creó pedido, reserva ni pago.
El navegador canónico abrió el acceso administrativo sin sesión; no se ingresaron
credenciales ni se acreditó por ello una comprobación administrativa autenticada.

La ejecución #362 terminó `success`. La comprobación externa confirmó HTTPS
canónico y las 675/675 fichas a las `18:22:29.418Z`, 641 precios usables y 34
placeholders, sin precios inválidos y con el mismo digest comercial al finalizar.

## Primer evento Cloudflare: fallo de transporte verificado

El cron sí ejecutó el turno de las `18:22:30.510Z` e inició a las
`18:22:31.973Z`, request `9367d401-04a0-4da8-b6a5-36e080a97917`. El relay
falló dos fetch a Shekinah antes de headers (`DUX_RELAY_TRANSPORT`), sin crear
operación D1 ni consultar Dux. El log y GraphQL coinciden: versión `677dbc3c`,
`scriptThrewException`, una invocación / un error, cero subrequests contabilizados,
CPU P50/P99 1.543 µs (1,543 ms) y wall 1.992.688 µs (1,993 s). CPU no explica
ese fallo. No se marca el reloj como aceptado ni ese turno como sincronización.

`workersInvocationsScheduled` todavía estaba vacío mientras el dataset adaptive
ya registraba el evento: el retraso de métricas no acredita ausencia de ejecución.
Se investiga el transporte mediante previews efímeros sin bindings ni secretos,
con GET al endpoint propio (405 esperado), sin consultas Dux ni mutaciones de datos.
No se atribuye 1042, TLS o redirect a partir del código genérico sin otra evidencia.

La prueba remota efímera con Wrangler 4.131.0 y la fecha de compatibilidad
`2026-09-08` aisló la causa a las `18:28:32.632Z`. Hizo ocho GET sin credenciales:

| Flag `strictly_public` | Destino | `redirect:error` | `redirect:manual` |
| --- | --- | --- | --- |
| No | Canónico | Excepción inmediata, 0 ms | 405, 179 ms |
| No | Técnico | Excepción inmediata, 0 ms | 405, 96 ms |
| Sí | Canónico | Excepción inmediata, 0 ms | 405, 495 ms |
| Sí | Técnico | Excepción inmediata, 0 ms | 405, 85 ms |

405 es la respuesta correcta para GET a este endpoint POST. La única variable
que permite llegar a Shekinah es el modo manual; cambiar host o agregar el flag
no corrige el modo error. No se agrega el flag, no se cambia el destino ni TLS.
Los dos previews quedaron cerrados y sus puertos 8788/8789 sin escucha.
El antecedente del 1 de septiembre ya acreditaba esa interacción con Dux;
el relay separado todavía conservaba el modo incompatible.

La corrección complementaria usa `redirect:manual`, rechaza todos los 300–399
antes de leer cuerpo o Location, sin retry y con cancelación best-effort. Añade
clasificación cerrada de excepciones de transporte, sin mensajes crudos. Las 47
pruebas focales del relay, lint, tipos y dry-run 4.131.0 aprobaron; bundle
10,43 KiB / gzip 3,15 KiB. Validación completa y publicación complementarias pendientes.

Los archivos efímeros se conservaron fuera del árbol de fuentes en
`C:\Users\Jerem\AppData\Local\Temp\shekinah-dux-recovery-20261022`, tras verificar
los paths. El primer verify complementario encontró archivos generados del probe
y dry-run al recorrer `.wrangler`; no era un error de fuentes del producto.
Se retiraron esos artefactos del recorrido sin relajar ESLint ni cambiar sus reglas.

## Recuperación de un checkpoint incierto

Se despachó otra lectura manual
[#363](https://github.com/JerePrograma/shekinah/actions/runs/39831798062), siempre
sobre `fbbe8a8`, para mantener una lectura controlada durante el ajuste del relay.
El gate se cerró y verificó nuevamente después del inicio. La operación
`dux_sync_b444618f-3d04-450f-a22d-9f5dc2862bcb` inició `18:29:23.291Z` y confirmó
200 productos a las `18:30:00.003Z`, con siete intentos y sin lease ni error
persistido. El siguiente POST respondió `500 INTERNAL_ERROR` a las `18:30:01Z` y
el runner se detuvo. El snapshot publicado anterior se conservó.

Ese estado es compatible con un fallo antes del siguiente claim; no demuestra
la causa interna ni un rechazo Dux. La API histórica de observabilidad respondió
403 / Cloudflare 10000 con el OAuth disponible; se detuvo la consulta sin cambiar
permisos ni exponer logs. No se atribuye sin prueba a D1 o al proveedor.

La corrección complementaria permite exclusivamente `500 + INTERNAL_ERROR`
como checkpoint incierto: como máximo dos POST del mismo paso y UUID, dentro del
plazo y topes previos. Los errores `DUX_*`, 400, acceso, esquema y presupuestos
siguen siendo terminales. Un error persistente no confirma éxito ni crea otro ciclo.

El nuevo relay suma 49 pruebas y el runner 52, ambos aprobados de forma focal.
En el verify completo complementario volvió a fallar una prueba preexistente de
paginación: el click ocurrió antes de estabilizar el render inicial y observó
50 filas en vez de 6. Se corrigió sólo la espera del test (`act`, control habilitado
y resultado de paginación), sin cambiar el producto, timeout o aserciones finales.
Las 31 pruebas de ProductManager aprobaron. La validación completa final usa
cuatro workers locales; CI conserva su configuración ordinaria.

El verify complementario completo aprobó 131 suites, 1.281 pruebas, 14 skips
históricos y 55 E2E, además de lint, tipos y verificadores. El siguiente
`build:pages` con cuatro workers agotó los 10 segundos de otra prueba existente,
«difiere la actualización del catálogo mientras se confirma una baja en otra
página»: 1.280 pruebas aprobadas y una fallida. No se cambió esa prueba ni el
producto. La máquina informó 1.418 MiB libres de 16.003 MiB y CPU 79%; es
compatible con presión de recursos, sin demostrar por sí solo la causa del timeout.
Se repite el build con un worker, manteniendo aserciones y plazos.
La repetición terminó aprobada: 131 suites, 1.281 pruebas y los 14 skips
históricos, en 295,62 segundos de Vitest; también aprobaron todos los demás
controles de `build:pages`. Sin más cambios de fuentes entre los dos intentos.
Una segunda revisión independiente del diff no encontró bloqueos concretos.

La lectura de cierre previa al rollout complementario, a las `18:53:43.216Z`,
confirmó las 30 migraciones exactas y las nueve columnas diagnósticas en ambas
bases, sin errores de FK. Production conserva 12 órdenes, 2 preferencias, 2 pagos,
29 líneas, 7 fulfillments, 2 solicitudes web, 2 vínculos y 2 operaciones Dux,
231 bajas manuales y cero nombres manuales. Preview conserva 14 órdenes,
14 preferencias, 1 pago, 14 líneas y 14 fulfillments, sin solicitudes ni vínculos
u operaciones Dux. Ambas conservan cero campañas y redenciones.

Archivos complementarios: `server/dux-cron.ts` y prueba,
`scripts/run-dux-reconcile.mjs`, `server/dux-reconcile-runner.test.ts`,
`server/test-fixtures/dux-reconcile-fetch-stub.mjs`, `scripts/verify-automation.mjs`,
`src/admin/ProductManager.test.tsx`, contrato Dux y este registro.
No requiere otra migración ni cambia el cron, destino, flags, credenciales o cuota.

## Publicación complementaria y observación automática

Commit funcional `d46cac50b7314d8a1c2b60ef94aac1c759daada0`, nueve archivos,
publicado normalmente a `main` y con hash remoto coincidente. Diff completo,
checks de whitespace y árbol limpio verificados antes de subir el Worker.
La versión `2c20fd7d-4db8-4195-8ba7-1e686b536445` se cargó con Wrangler 4.131.0,
tag `dux-recovery-d46cac5`, mensaje del SHA completo y vars conservadas:
10,52 KiB / gzip 3,19 KiB y startup 4 ms.

Tras el verify y build locales completos se activó esa versión al 100%, mientras
CI y Pages seguían en validación. El cambio del relay usa la API ya publicada
en `fbbe8a8`; no requiere un cambio de protocolo ni otra migración. El deployment
`20c403ef-7aa2-4562-8265-137eb449c73c` quedó activo a las `19:00:23.976691Z`.
Se usó version deploy: el cron conserva creación y modificación
`18:11:20.211214Z`, sin reiniciar propagación ni habilitar el reloj GitHub.
API confirmó versión y porcentaje, único cron, secreto por nombre/tipo y
observabilidad activa. La captura filtrada del relay quedó adjunta antes del turno
de las `19:02Z`. Pendiente de acreditar aquí: CI, Pages y cuatro ciclos reales.

La [CI #570](https://github.com/JerePrograma/shekinah/actions/runs/39836082188)
aprobó el SHA `d46cac5`, job `120024674350`, de `18:58:57Z` a `19:03:10Z`:
verify completo, parser, 27/27 mocks y artefacto `12451117056`,
`shekinah-dist-d46cac50b7314d8a1c2b60ef94aac1c759daada0`, 52.301.168 bytes.
Pages `be1d3464-4e94-47ed-bd71-eaa2f60043f1` quedó canónico/latest, success,
sobre el mismo SHA; ambas evidencias se consultaron independientemente del Worker.

### Primer rechazo diagnosticado y excepción estricta

El turno Cloudflare de `19:02:30.510Z` alcanzó Pages y Dux. Run
`dux_sync_80124552-3630-4547-8a42-9f4cc3e0730f`, actor
`scheduler:cloudflare-cron`, inició `19:02:31.715Z` y falló `19:04:27.546Z`,
offset 800 de 899, intento 20. Diagnóstico persistido: HTTP 400, `/v2/items`,
`ERROR_VALIDACION`, campos `[]`, huella
`35e6b45751d1cf72286fb7027ceed4e38e3937d620a13e871c347d96e99246a6`.
El cierre normal marcó el viejo run GH con `DUX_SYNC_DEADLINE_EXCEEDED`;
no hubo edición manual de estados ni publicación parcial. Presupuesto 2.818.

El tail del relay registró 502 sin error JSON reconocido, una recuperación de
la misma identidad y cierre `DUX_RELAY_GATEWAY` a las 21 llamadas; D1 confirmó
que no se volvió a consultar Dux después del rechazo terminal. No se atribuye
sin prueba el contenido de esa respuesta intermedia a una capa particular.

La huella se comparó fuera de red con la normalización exacta
`{codigo:'ERROR_VALIDACION', mensaje:'Formato desconocido.', detalle:[]}`:
SHA-256 idéntico. Este mensaje ya estaba documentado el 21 de septiembre en
[la lectura directa](DIRECT_CHECKOUT_PRODUCTION_2026-09-21.md), con una secuencia
200 / 400 / 200 y parámetros idénticos. No se reconstruyó ni publicó un cuerpo
con datos privados; el diagnóstico almacenado sigue siendo cerrado.

La documentación oficial de items mantiene habilitado, offset y límite 50 como
consulta válida; no documenta una corrección para ese mensaje. La causa interna
del rechazo Dux no está demostrada. La evidencia de intermitencia permite una
excepción de recuperación sólo para esa combinación exacta en GET de productos,
sin campos inválidos, conservando los límites ya verificados. No se cambia el
cliente global, la consulta, las credenciales, el plan ni las operaciones de pedidos.
Los demás 400 siguen terminales; tres rechazos consecutivos tampoco publican.
La aceptación de cuatro ciclos sanos comienza nuevamente tras ese rollout.

Las 60 pruebas focales del coordinador aprobaron con un worker (18,91 segundos):
recuperación y publicación del mismo offset/UUID, espera mínima, cinco variantes
terminales, campos inválidos aun con huella exacta y agotamiento de tres claims.
Lint focal y diff aprobados. Otra revisión independiente no encontró bloqueos;
la copia administrativa ya distingue progreso, éxito recuperado y rechazo final
por estado, por lo que no se modificó el panel (33/33 pruebas focales aprobadas).

El turno anterior a esta última publicación, `19:12:32.382Z`, sí completó:
run `dux_sync_112e5449-3999-437b-81e5-4b2494e1b44f`, 21 lecturas, 899 productos,
publicación `19:14:39.445Z`, cierre `19:14:41.225Z`, sin errores Dux. Intervalo
600,667 segundos desde el inicio anterior. Presupuesto 3.094, incremento 276:
la base de 136 deja aparte deltas de inventario, que mantienen su prepago.
El stock tenía 127,063 segundos al publicar. El viejo snapshot llegó a 3.540,169
segundos antes de ese reemplazo debido a los fallos anteriores; no se presenta
ese intervalo como cumplimiento del objetivo de 900 segundos.

Smoke de sólo lectura a las `19:15:37.338Z`: TLS verificado del origen técnico,
GET catálogo 200, 675 productos / 13 categorías, POST quote sin cupón 200 y precio
igual al Dux publicado, descuento cero; GET campañas 200 y vacías. Versión
`d87a5ca548ff9924e293722c141e4f8563b0f398fd7b7db686212142363d51b4`.
La comprobación HTTPS canónica completa se despachó por separado con verify_only,
sin habilitar otro reloj ni refrescar Dux.

La [verificación #364](https://github.com/JerePrograma/shekinah/actions/runs/39838559098)
terminó success sobre `d46cac5`, job `120033279518` de `19:16:11Z` a `19:19:17Z`;
Refresh Dux quedó skipped y el gate se comprobó false antes y después.
HTTPS canónico, 675/675 fichas y rutas, 13 categorías, 641 precios utilizables,
34 placeholders y cero inválidos/ausentes, sin reintentos. El JSON final de
`19:19:15.109Z` confirmó la versión `d87a5ca5…51b4` anterior y digest comercial
`4b468bd4c92b6a5847d0ce5241a6061b4a9d19fb2a542d9f2d5ae9839de92fd3`
estable durante toda la comprobación.

La corrección estricta aprobó el verify local completo: 131 suites / 1.289 pruebas,
14 skips históricos, 55 E2E, lint, tipos y todos los verificadores. La repetición
`build:pages` con un worker se inició después, sobre las mismas fuentes congeladas;
su resultado se acreditará por separado. No cambiaron dependencias, secretos,
binarios, migraciones ni configuración externa. Archivos de esta etapa: coordinador
y prueba, README, CURRENT_STATE, CONTINUATION, contrato resumible y este registro.

La herramienta local de tail Wrangler abortó en Windows; la observación se hizo
mediante la API oficial y WebSocket, filtrando en memoria exclusivamente los
campos cerrados de `dux_api_transport_failure`. No se volcó el evento HTTP completo.
Una consulta diagnóstica inicial usó un nombre de tabla inexistente y terminó
7500 sin escrituras; se corrigió a `dux_catalog_snapshots_v2` y se verificó la lectura.
La red local sigue sin validar la cadena TLS del dominio canónico; no se omitió
TLS. Pages técnico y verificaciones externas se acreditan por separado.

No se crearon pedidos, reservas o pagos de prueba ni se modificaron existencias,
flags comerciales, mantenimiento, promociones o credenciales. Sin force-push.
