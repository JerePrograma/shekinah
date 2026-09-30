# Reserva directa Dux: diagnóstico y recuperación — 2026-09-30

## Base y alcance

Repositorio inicialmente limpio, `main` y `origin/main` sincronizados en
`d4ade25b2f8a3afb4f8bd43781fd4767dcf8fc4a`. Se ejecutaron status, switch main,
fetch, pull ff-only, status y log antes de editar. Sin ramas, PR, worktrees,
stashes, reset destructivo ni force-push. El encargo autoriza revisar CI/CD y
corregir `DIRECT_RESERVATION_UNVERIFIED`; no acredita una reserva por sí mismo.

## Evidencia remota inicial: verificado

- [CI #557](https://github.com/JerePrograma/shekinah/actions/runs/36614832765):
  `success`, job Verify y sus pasos aprobados sobre el SHA base. Artefacto
  `shekinah-dist-d4ade25b2f8a3afb4f8bd43781fd4767dcf8fc4a`, ID 11053684991.
- Pages Production `2fe6801c-5637-484f-893f-3d2543cd00aa`: `success`, SHA base,
  dominio `shekinah.ar`. Verificado mediante API y dashboard en Chrome.
- [Reconciliación Dux #233](https://github.com/JerePrograma/shekinah/actions/runs/36655469095):
  `failure` el 2026-09-30 01:30 UTC; Refresh Dux inventory snapshot terminó
  con HTTP 502 (HTTP_502). D1 conserva dos runs fallidos `DUX_PROVIDER_REJECTED`.
  El log no permite atribuir una causa interna específica al proveedor.
- [Reconciliación Dux #234](https://github.com/JerePrograma/shekinah/actions/runs/36682674429):
  `success` el 2026-09-30 07:15 UTC. D1 conserva primero un intento fallido
  y después `dux_sync_f8ecb976-0283-43a9-b85d-bf7ac78bfe6c` completado a las 07:18:53.360 UTC
  con 878 productos. El scheduler tiene cron de cinco minutos, pero los runs
  observados están separados por horas; no afirmar una frescura garantizada.
- Durante la validación apareció [#235](https://github.com/JerePrograma/shekinah/actions/runs/36724239992),
  también `failure`: dos intentos 13:47:49–13:48:31 y 13:49:02–13:49:32 UTC,
  ambos `DUX_PROVIDER_REJECTED`, con cero productos procesados. El job devolvió
  HTTP 502. Se preserva el último snapshot exitoso; no atribuir ese 502 de
  Shekinah al status HTTP interno de Dux sin el diagnóstico de Functions.
- Production conserva migraciones 0001–0025. No se aplicaron migraciones ni
  modificaron bindings, secretos o flags. WEB, VITE_WEB, ASSISTED, DIRECT,
  COMMERCE y DUX_API están en true; VITE_COMMERCE y editorial ML en false.
  El mantenimiento público está deshabilitado. La activación previa no cambia.

## Causa de la compra atascada: verificado / revisado por código

La lectura SELECT de Production encontró una solicitud aceptada que conserva
`direct_checkout_state=preparing`, `DIRECT_RESERVATION_UNVERIFIED`, un único
intento de reserva del 2026-09-21 y pedido cacheado Dux ID 3421572, número 2.
No tiene preferencia Mercado Pago ni pagos. Código Dux `799000516`, cantidad 1;
la lectura inicial del 2026-09-21 18:58:50.364 UTC es real 9, reservado 0,
disponible 9. El snapshot Dux actual registra real 7, reservado 2, disponible 5;
la última modificación de esa fila fue el 2026-09-24. No confundir ese timestamp
con el ciclo completo exitoso del 2026-09-30.

Otra solicitud posterior del mismo código tiene reserva confirmada y preferencia
histórica, también sin pagos en la lectura observada. El reservado 2 es global:
no atribuirlo automáticamente a la compra atascada. Se omiten datos personales,
tokens públicos, secretos y snapshots de clientes de este registro.

Por código, `hasPhysicalReservation` exige conservar el stock real inicial,
aumentar reservado y reducir disponible. La incompatibilidad devuelve el 409
correctamente, pero el catch anterior mantenía `preparing` y el siguiente avance
reutilizaba la orden cacheada. La cotización inmutable y 0024 impiden reemplazar
la lectura inicial para fabricar confirmación. No se hizo consulta viva directa
al proveedor para este pedido ni se ejecutaron reservas, preferencias o cobros
reales durante el diagnóstico.

## Cambio

- La incompatibilidad de reserva/evidencia pasa a `requires_review`; conserva
  compra, cotización, ledger, primer POST e historial financiero.
- Las lecturas incompatibles se guardan como diagnóstico separado del stock
  confirmado; se descarta el pedido cacheado para una nueva consulta.
- Sólo la continuación administrativa autenticada puede retomar esa revisión,
  y sólo para una operación previamente intentada. Reconsulta el mismo ID/número,
  referencia, líneas y total; mantiene la verificación física y los guards D1.
- El comprador consulta el estado guardado tras el 409 y detiene avances
  automáticos. No abre Mercado Pago, reemplaza la compra ni expone datos Dux.
- Administración muestra código/cantidad, ID/número y comparación de lecturas
  dentro del soporte plegado; recarga estado después de un avance fallido.
- No hay migración ni backfill de solicitudes antiguas: una compra atascada
  adopta el estado nuevo al siguiente avance. No se modificó su fila en remoto.

## Secuencia de validación

- `npm ci`: verificado, Node 24.18.0 / npm 11.16.0. Cinco avisos de dependencias
  (dos moderate, tres high); no se ejecutó audit fix ni cambió el lockfile.
- `npm run install:browsers`: verificado.
- Regresión inicial aislada: fallido esperado; esperaba `requires_review` y
  obtuvo `preparing` antes de implementar la corrección.
- Primera prueba dirigida: 92 aprobadas, 1 fallida por mock sin la nueva lectura
  GET tras error. Segunda: 99 aprobadas, 1 fallida por avance del reloj de prueba
  antes de montar el efecto. Se corrigieron los mocks/secuencia de la prueba.
- Última prueba dirigida: verificado, 4 archivos / 100 pruebas aprobadas, incluidos
  guard de pago, consulta sin otro POST, anulación, reemplazo de ID, diagnóstico
  inválido y detención pública después del 409.
- `npm run verify`: verificado, 124 archivos; 958 pruebas aprobadas y 14 omitidas
  del bloque histórico de reservas locales WhatsApp. Lint, TypeScript, catálogo,
  pesos, build, activos, seguridad y automatización aprobados; E2E 47/47 aprobadas
  en Chromium, incluidas sesiones administrativas, compra, retorno y mantenimiento.
- `npm run build:pages`: verificado, mismos 124 archivos / 958 aprobadas / 14
  omitidas y todos sus controles aprobados. Build público y administrativo generado.
- Enlaces de los cuatro documentos afectados, lockfile intacto y revisión del
  diff completo: verificado. `git diff --check` y `git diff --cached --check`:
  verificado, rutas preparadas explícitamente, sin dist, binarios, credenciales
  ni artefactos temporales en el índice.

## Rollout y pendientes

CI y Pages del cambio aún pendientes al crear el registro. Deben acreditarse
con el SHA publicado, jobs, artefacto y deployment, separados de la base anterior.
El fallback WhatsApp autorizado se conserva; Link de Pago y checkout legacy
permanecen retirados. Se solicitó un único reintento del job fallido #235 para
observar el diagnóstico cerrado de Functions con tail filtrado. No se creó un
segundo scheduler ni se imprimieron headers, bodies, URLs con query o secretos.
El resultado del reintento estaba pendiente al crear este registro.

La observación del reintento sí acreditó `dux_api_transport_failure` versión 2:
`providerStatus=400`, `kind=provider_rejected`, `endpoint=/v2/items`, `attempts=1`,
`phase=classify_response`, `errorClass=http_status`, `headersReceived=true`.
El cliente no reintenta ciegamente ese GET 400; el job conserva su retry acotado
del ciclo completo. El 502 observado en Actions es de Shekinah al propagar el
rechazo, no un HTTP 502 de Dux. No se inspeccionó ni publicó el body del proveedor;
la causa específica de su rechazo sigue sin acreditación y requiere soporte Dux
con endpoint, timestamps y status, sin enviar credenciales o datos de clientes.

La corrección no certifica la reserva física del pedido 2. Resolver la discrepancia
mediante Dux oficial y evidencia exacta, sin cobrar ni reenviar el pedido. El
lifecycle existente sólo libera reservas confirmadas: el cierre local de una
pendiente nunca confirmada necesita un coordinador validado. No hay cancelación
automática ni compensación inventada. Los rechazos observados del proveedor y
la irregularidad temporal del scheduler siguen siendo incidencias observadas.
