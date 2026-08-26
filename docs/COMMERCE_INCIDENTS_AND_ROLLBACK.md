# Incidentes y rollback

## Prioridades

1. Cortar nuevas ventas antes de crear cobros o reservas incorrectas.
2. No perder webhooks de Mercado Pago asociados a operaciones históricas.
3. No repetir una mutación Dux cuyo resultado sea incierto.
4. Preservar evidencia en D1, Dux, Mercado Pago, Cloudflare y Git.
5. No exponer secretos ni PII.
6. Recuperar mediante cambios versionados y reversibles.

## Corte seguro

Ante cualquier incidente de inventario, cantidad, mapping, Dux o Mercado Pago:

```text
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
```

Si el problema es de configuración o contrato Dux, además:

```text
DUX_API_ENABLED=false
```

Mantener siempre:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

El corte bloquea nuevas preferencias y pedidos WhatsApp. No elimina D1, no borra snapshots, no reactiva stock local y no deshabilita el webhook Mercado Pago si existen pagos iniciados previamente.

## Dux no disponible

### `401`

Tratar como token inválido, vencido o mal configurado. Cerrar Dux y comercio, verificar únicamente el nombre/tipo del secreto en el entorno correcto y generar o rotar token mediante Dux. No registrar el valor.

### `403`

Tratar como permisos o plan insuficiente. Confirmar PRO/FULL y alcance del token con Dux. No usar cookies del ERP, scraping, JSF ni endpoints internos.

### `429`

El cliente debe conservar la serialización de una solicitud cada cinco segundos y respetar `Retry-After` cuando exista. No aumentar concurrencia, lanzar varios schedulers ni reintentar sin límite.

### `5xx`, timeout o payload inválido

Detener ventas. Un timeout de GET admite retry acotado. Un timeout de una futura mutación es resultado incierto: registrar la operación, consultar por referencia y no repetirla ciegamente. Un snapshot obsoleto puede mostrarse como diagnóstico, nunca autorizar una venta.

## Lifecycle Dux no disponible

`DUX_ORDER_LIFECYCLE_UNAVAILABLE` es un bloqueo deliberado. Significa que no se pudo demostrar por la API pública cómo cancelar/liberar/finalizar/expirar una reserva. No eliminar el guard ni crear primero la preferencia Mercado Pago.

Escalar a soporte Dux con estas preguntas exactas:

- endpoint oficial para anular o cancelar un pedido creado por API;
- efecto exacto sobre la reserva del depósito;
- endpoint/estado para finalizar sin doble descuento;
- expiración automática, si existe, y garantía temporal;
- consulta por referencia ante timeout;
- idempotencia o clave externa admitida;
- garantía de rechazo atómico por stock insuficiente.

Si Dux no ofrece un mecanismo público verificable, el comercio debe permanecer cerrado.

Un `503` del webhook o de la conciliación para un pedido con `dux_order_links` es el comportamiento esperado: conserva evidencia y evita una transición local sin compensación Dux. No resolverlo venciendo el pedido, actualizando su estado manualmente o deshabilitando los triggers de `0012`.

## Unidad o cantidad inconsistente

`GET /v2/items` revisado no expone unidad, pesabilidad, divisibilidad o regla de decimales suficiente. Si esos campos siguen ausentes:

- no inferirlos del nombre, SKU, presentación o categoría;
- no convertir gramos/kilos;
- no redondear, truncar ni escalar stock;
- preservar la cantidad observada en D1;
- marcar semántica no verificada y bloquear venta;
- solicitar a Dux el endpoint o campo oficial.

Valores negativos o decimales son observaciones válidas del proveedor. Una cantidad `<= 0` no habilita venta; un decimal positivo tampoco define por sí mismo la cantidad que el comprador puede solicitar.

## Mapping incorrecto

- detener venta de los items afectados;
- revisar vínculo persistido, código externo, SKU y código de barras exactos;
- no hacer fuzzy matching;
- no elegir automáticamente entre dos candidatos;
- no modificar ni borrar el producto editorial local;
- no copiar un ID Mercado Libre a empresa, sucursal o depósito Dux;
- registrar corrección mediante la operación administrativa auditada.

## Snapshot obsoleto o sync fallido

La proyección D1 no es autoridad. Si excede `DUX_SNAPSHOT_MAX_AGE_SECONDS`, la disponibilidad queda desconocida. Revisar el último `dux_sync_runs`, credenciales, IDs y rate limit. Una sincronización solapada debe reutilizar el lock y no iniciar una tormenta de requests.

No “recuperar” copiando stock local, desde Excel o desde Mercado Libre.

## Dux reservó y Mercado Pago falló

Este flujo no está activado actualmente. Cuando exista el lifecycle oficial:

1. si se demuestra que no existe preferencia, liberar/cancelar Dux con la operación idempotente;
2. si Mercado Pago tuvo resultado incierto, recuperar por `external_reference` antes de compensar;
3. no liberar si podría existir una preferencia cobrable;
4. persistir `compensation_pending` ante cualquier duda;
5. exigir intervención operativa si no se puede reconciliar.

Nunca arreglarlo con `GET stock`, resta local y `PUT item`.

## Firma o credencial Mercado Pago comprometida

- cortar nuevas ventas;
- rotar la credencial en Mercado Pago;
- actualizar el secreto cifrado de Pages;
- revisar eventos, pagos y pedidos desde el inicio de la posible exposición;
- validar cada pago contra la API;
- no aprobar por retorno del navegador, captura o mensaje del comprador;
- documentar IDs, SHA, ventana temporal y acciones sin guardar secretos.

La rotación no sustituye la conciliación de pagos ya iniciados.

## Mercado Libre directo detectado

Si logs, configuración o tráfico muestran consultas o mutaciones directas de inventario Mercado Libre:

1. mantener los flags Mercado Libre en `false`;
2. desactivar cualquier scheduler directo;
3. confirmar que Checkout y WhatsApp fallan antes de invocarlo;
4. preservar tablas y operaciones históricas para auditoría;
5. revisar si Dux y Shekinah compitieron por el mismo stock;
6. conciliar la existencia exclusivamente en Dux.

No borrar evidencia ni ejecutar un PUT compensatorio a Mercado Libre. Dux es quien sincroniza ese canal.

## D1 no disponible

Las APIs comerciales deben responder `503` y no redirigir a Mercado Pago ni abrir WhatsApp.

- no crear una base vacía con el mismo binding;
- comprobar proyecto Pages, entorno y migraciones;
- restaurar sólo con backup/autorización;
- al recuperar, revisar ciclos Dux y pagos pendientes;
- no autorizar stock desde una copia obsoleta.

## R2 o administración no disponibles

El incidente de imágenes no cambia la autoridad Dux. Conservar la referencia anterior, no eliminar assets legacy ni usar D1/Git/base64 como reemplazo. Si falla la autenticación administrativa, mantener APIs cerradas; no retirar middleware, firma de cookie, origen o rate limiting.

## Rollback de código

No usar `git reset --hard`, reescritura de historial, force-push o borrado manual del commit publicado.

Sobre `main` sincronizado:

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
git revert <SHA_COMPLETO>
npm ci --no-audit --no-fund
npm run install:browsers
npm run verify
git push origin main
```

Antes de revertir una versión que haya iniciado mutaciones Dux, inventariar todas las operaciones `pending`, `uncertain` y `compensation_pending`; cortar ventas y resolverlas con el proveedor. El estado actual no ejecuta mutaciones Dux.

No revertir hacia una versión que reactive Mercado Libre o stock local como autoridad.

## Rollback de base

`0012` es aditiva. La opción conservadora es dejar sus tablas sin uso tras un rollback de aplicación. No hacer `DROP TABLE` inmediato ni editar la migración aplicada.

Para transformar o eliminar esquema:

1. cerrar comercio y scheduler;
2. confirmar cero operaciones Dux activas o inciertas;
3. respaldar D1 y guardar punto Time Travel;
4. preparar SQL versionado y revisado;
5. probar sobre copia local;
6. obtener autorización explícita por la pérdida o transformación;
7. aplicar en ventana controlada;
8. verificar relaciones, conteos y pagos.

Las tablas Mercado Libre históricas tampoco se borran como parte de este cierre.

## Cierre del incidente

Registrar:

- inicio y fin con zona horaria;
- SHA antes y después;
- flags, bindings y entorno;
- endpoint Dux o Mercado Pago afectado;
- alcance sobre pedidos, reservas y pagos;
- operaciones inciertas y resolución;
- pruebas ejecutadas;
- acciones externas en Dux, Mercado Pago, Cloudflare y GitHub;
- responsables, autorizaciones y pendientes.

Nunca incluir tokens, firmas, cookies ni PII en el informe.
