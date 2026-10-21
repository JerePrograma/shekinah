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

Archivos funcionales: `functions/api/admin/dux/status.ts`,
`functions/api/admin/dux/sync.ts`, `functions/api/internal/dux/reconcile.ts`,
`scripts/run-dux-reconcile.mjs`, `server/dux-cron.ts`, `server/dux-cron.test.ts`,
`server/dux-inventory-reader.ts`, `server/dux-inventory.ts`,
`server/dux-reconcile-runner.test.ts`, `server/test-fixtures/dux-reconcile-fetch-stub.mjs`,
`server/dux-sync-operation.ts`, `server/dux-sync-operation.test.ts`,
`src/admin/DuxPanel.tsx`, `src/admin/DuxPanel.test.tsx` y
`migrations/0026_dux_resumable_sync.sql`. Documentación: este registro, su contrato,
`README.md`, `docs/CURRENT_STATE.md` y `docs/CONTINUATION.md`.

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
slugs y cantidades fraccionarias 12.68. No acredita una lectura real de Dux.

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
documentales y revisión del diff completo: verificado. Lockfile intacto y sólo
las 20 rutas declaradas, sin dist, binarios, credenciales ni backups en Git.

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

## Estado del rollout al preparar el cambio

Pendiente publicar y acreditar el SHA, aplicar 0026 Preview→Production y ejecutar
el nuevo sincronizador real. Sin cobros, pedidos, reservas, modificaciones de stock,
flags ni credenciales. El fallback WhatsApp autorizado se conserva; Link de Pago
y checkout legacy siguen retirados. La cadencia automática y los rechazos Dux
permanecen como incidencias hasta evidencia posterior. No hubo force-push.
