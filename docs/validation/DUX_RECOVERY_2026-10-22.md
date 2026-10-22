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

Pendientes de registrar tras su ejecución: pruebas completas, SHA funcional,
CI/artefacto y Pages exactos, bookmarks y 0030 Preview antes de Production,
desactivación verificada del reloj GitHub, versión y cron Cloudflare, cuatro
ciclos automáticos, catálogo público y conservación de pedidos/pagos/overrides.

La herramienta local de tail Wrangler abortó en Windows; la observación se hizo
mediante la API oficial y WebSocket, filtrando en memoria exclusivamente los
campos cerrados de `dux_api_transport_failure`. No se volcó el evento HTTP completo.
Una consulta diagnóstica inicial usó un nombre de tabla inexistente y terminó
7500 sin escrituras; se corrigió a `dux_catalog_snapshots_v2` y se verificó la lectura.
La red local sigue sin validar la cadena TLS del dominio canónico; no se omitió
TLS. Pages técnico y verificaciones externas se acreditan por separado.

No se crearon pedidos, reservas o pagos de prueba ni se modificaron existencias,
flags comerciales, mantenimiento, promociones o credenciales. Sin force-push.
