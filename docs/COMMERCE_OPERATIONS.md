# Operación del comercio

## Fallback manual temporal

Mientras `COMMERCE_ENABLED=false`, el flujo público autorizado usa el Link de Pago `https://link.mercadopago.com.ar/shekinahmoreno` y WhatsApp `5492236216559`.

Procedimiento operativo mínimo:

1. El comprador arma el carrito y, si el envío tiene total definido, puede copiar el monto y abrir el Link de Pago.
2. Al solicitar WhatsApp, el servidor recalcula el carrito, crea un pedido pendiente y reserva stock antes de abrir el mensaje.
3. El comprador ingresa el monto en Mercado Pago y envía el mensaje que incluye el identificador del pedido.
4. Antes de aprobar, preparar o entregar, el comercio debe verificar el cobro directamente en su cuenta de Mercado Pago. No aceptar capturas, texto de WhatsApp ni el retorno del navegador como prueba suficiente.
5. Aprobar desde el backoffice confirma la venta, descuenta el stock físico una vez y consume la reserva. Rechazar conserva el físico y libera la reserva.
6. Para Correo con peso desconocido o superior a 5 kg, cotizar primero por WhatsApp; el Link de Pago continúa bloqueado mientras el total sea indeterminado.

Este flujo siempre escribe `orders` y `order_items`; escribe `order_fulfillment` sólo para datos completos con tarifa determinística. No escribe `payments` ni `payment_events` y no recibe webhooks del Link de Pago generado en el panel. `pending` significa reserva vigente, no pago. Sólo la verificación manual seguida de aprobación administrativa confirma la venta.

Con consentimiento y analítica habilitada, un clic válido en el enlace registra `manual_payment_click`; la apertura del canal asistido registra `whatsapp_open`. Ambos son interacciones first-party sin monto, carrito ni PII. No sumarlos a pedidos, pagos aprobados, revenue ni «ventas».

## Controles diarios de Checkout Pro

Los controles siguientes aplican cuando Checkout Pro integrado esté habilitado:

- Revisar pedidos `pending` antiguos y contrastarlos con Mercado Pago antes de cualquier acción manual.
- Verificar eventos de webhook en `failed`; el proveedor debe reintentarlos y el registro permite reclamar nuevamente sólo eventos fallidos.
- Comparar `payments.amount_minor` y `orders.total_minor` para detectar inconsistencias.
- Revisar que no haya pedidos aprobados sin pago asociado.
- Controlar errores de Functions sin registrar cuerpos, access tokens, firmas ni secretos.

Consultas de diagnóstico de sólo lectura:

```sql
SELECT status, COUNT(*) AS cantidad
FROM orders
GROUP BY status
ORDER BY status;
```

```sql
SELECT o.id, o.status, o.total_minor, o.created_at
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.status = 'approved' AND p.provider_payment_id IS NULL;
```

```sql
SELECT provider_event_key, status, attempt_count, error_code, received_at
FROM payment_events
WHERE status = 'failed'
ORDER BY received_at DESC;
```

```sql
SELECT id, status, mp_preference_attempted_at, last_error_code, updated_at
FROM orders
WHERE mp_preference_attempted_at IS NOT NULL
  AND mp_preference_id IS NULL
ORDER BY updated_at DESC;
```

Un pedido en este último estado no debe liberarse ni reintentarse manualmente sin confirmar primero en Mercado Pago que no existe una preferencia para su `external_reference`.

## Backoffice

`/admin` comprueba primero `/api/admin/auth/session`. Sin sesión muestra el formulario; un login válido emite una cookie `__Host-` de ocho horas y recién entonces monta las consultas administrativas. Cerrar sesión elimina la cookie. Ninguna contraseña se guarda en `localStorage`, `sessionStorage`, IndexedDB, auditoría o logs.

`POST /api/admin/auth/logout` invalida inmediatamente la cookie propia. Si en el futuro se habilita el fallback de Access, su sesión externa conserva el ciclo de vida definido por Cloudflare y debe cerrarse también en ese proveedor; el logout propio no revoca un JWT emitido por Access.

La interfaz `/admin` consume:

- `/api/admin/products` y `/api/admin/products/:id` para el ABM del catálogo;
- `/api/admin/summary`;
- `/api/admin/orders?limit=25`;
- `/api/admin/exports/orders.csv`;
- `/api/admin/exports/analytics.csv`;
- `/api/admin/audit`.

El catálogo de productos es editable. Pedidos, analítica, exportaciones y auditoría permanecen de sólo lectura. Los endpoints de reportes aceptan opcionalmente `from=AAAA-MM-DD` y `to=AAAA-MM-DD` donde corresponda; el rango máximo es 366 días.

La excepción son los pedidos `channel='whatsapp'` en estado `pending`: pueden aprobarse o rechazarse. Los botones quedan inactivos durante la request y desaparecen al alcanzar un estado terminal. Los pedidos Checkout Pro y los pedidos WhatsApp aprobados/rechazados permanecen de sólo lectura.

## Reservas pendientes de WhatsApp

El stock reservado es `SUM(order_items.quantity)` de pedidos WhatsApp pendientes. No existe contador que deba «devolverse». Revisar diariamente los pendientes antiguos: no tienen TTL y seguirán reduciendo disponibilidad hasta una resolución administrativa. Nunca corregirlos editando SQL, sumando stock o cambiando items; aprobar o rechazar mediante la API autenticada.

### Operación cotidiana del catálogo candidato

- localizar productos por nombre, identificador o categoría y combinar filtros de categoría, disponibilidad y stock;
- usar la edición rápida sólo para stock y disponibilidad, esperando la confirmación del servidor;
- dejar `stockQuantity` ausente cuando el stock no se controla; usar un entero de 0 a 1.000.000 cuando sí se controla;
- interpretar stock controlado en cero como no disponible efectivo, aunque la disponibilidad manual esté activa;
- usar la disponibilidad manual para retirar un producto de venta aunque tenga stock;
- recordar que el cobro manual no modifica inventario: el pedido WhatsApp reserva al crearse, la aprobación descuenta el físico y el rechazo libera la reserva derivada.

El carrito nunca acepta más de `min(99, stockQuantity)` por línea y Checkout Pro vuelve a validar el stock vigente. Si el stock cambia mientras existe un carrito, el comprador debe corregirlo antes de continuar.

### Imágenes administrativas

La carga admite JPEG, PNG y WebP de hasta 4 MiB. El preview local no confirma persistencia. El servidor valida magic bytes, genera la key y sólo escribe mediante la API administrativa autenticada. En reemplazo debe conservarse la imagen anterior hasta que la nueva referencia quede persistida; sólo se limpian objetos administrados no referenciados. Nunca eliminar archivos de `/images/original/catalog/`.

R2 y `CATALOG_IMAGES` están configurados y desplegados con `shekinah` para production y `shekinah-preview` para preview. Ambos buckets usan clase Standard/default y mantienen `publicR2DevEnabled=false`; la lectura comercial pasa exclusivamente por Pages. El smoke autenticado de upload/reemplazo/delete sigue no disponible por ausencia de credencial administrativa en claro. Un fallo de infraestructura nunca debe resolverse desactivando validaciones ni guardando imágenes en D1/Git.

La auditoría registra:

- subject y actor normalizados por sesión propia o por Access;
- acción administrativa de lectura o mutación de catálogo;
- tipo e identificador de destino cuando corresponda;
- resultado HTTP;
- request ID técnico;
- fecha del servidor.

No registrar tokens JWT, cookies, cuerpos de petición, firmas de webhook ni parámetros completos de consulta.

Los intentos de login se limitan en D1 por IP y por usuario mediante scopes HMAC. Ocho intentos por IP o veinte por usuario dentro de quince minutos activan un bloqueo de quince minutos al intento siguiente. `CF-Connecting-IP` es la fuente de IP en Pages; si falta, todas esas solicitudes comparten un scope cerrado. No borrar la tabla ni desactivar el control para recuperar acceso.

## Reportes

- `summary`: separa sesiones e interacciones consentidas de pedidos, pagos aprobados, facturación confirmada y ticket promedio; un click manual nunca alimenta revenue.
- `analytics/funnel`: sesiones únicas con page view, product view, agregado, clic manual, WhatsApp e hitos del checkout integrado.
- `analytics/products`: eventos y sesiones de vistas/agregados por producto, con conversión segura y sin divisiones inválidas.
- `analytics/sources`: fuente agrupada.
- `analytics/devices`: clase de dispositivo agrupada.
- `analytics/trend`: serie diaria agregada en D1 para sesiones y eventos relevantes.
- CSV de pedidos: hasta 1.000 filas por rango.
- CSV de analítica: hasta 1.000 filas por rango.

Las celdas CSV que comienzan con caracteres interpretables como fórmula se prefijan con apóstrofo. Aun así, los archivos deben abrirse como datos y no habilitar macros.

## Retención

El código no elimina pedidos, pagos, webhooks ni auditorías automáticamente. Para analítica, `purgeAnalyticsIfDue` reclama como máximo una ejecución por mes y elimina eventos, sesiones huérfanas y revocaciones con fecha estrictamente anterior al corte. Si la purga falla, libera el reclamo para permitir un reintento.

La política autorizada y configurada es de 730 días. `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS=730`, las D1 aisladas y los HMAC independientes quedaron verificados el 2026-08-11. Las revocaciones conservan sólo el HMAC de la sesión hasta alcanzar ese mismo corte.

No ejecutar borrados masivos sin backup y plan de reversión.

## Rotación de secretos

- Rotar de inmediato ante sospecha de exposición.
- `MERCADO_PAGO_ACCESS_TOKEN`: rotar en Mercado Pago y actualizar Pages antes de revocar el anterior, cuando el proveedor lo permita.
- `MERCADO_PAGO_WEBHOOK_SECRET`: coordinar el cambio para no rechazar notificaciones legítimas durante la transición.
- `ORDER_TOKEN_SECRET`: su rotación invalida los tokens públicos de pedidos existentes; planificar compatibilidad o conservar el valor mientras existan pedidos consultables.
- `ANALYTICS_HMAC_SECRET`: su rotación cambia el hash de sesión y dificulta eliminar sesiones históricas con el identificador local anterior.
- `ADMIN_PASSWORD_HASH`: generar fuera del repositorio un nuevo formato PBKDF2-HMAC-SHA-256 con salt aleatoria y 100.000 iteraciones, actualizar el secreto cifrado de production y preview y desplegar. Ese costo quedó comprobado dentro del límite CPU efectivo del runtime Bundled (32 ms en un smoke remoto negativo con credencial ficticia); no bajarlo sin una nueva validación. Nunca cargar la contraseña en claro ni guardar el hash en documentación.
- `ADMIN_USERNAME`: actualizarlo como secreto server-side junto con el hash si cambia la cuenta; no requiere modificar frontend ni código.
- `ADMIN_SESSION_SECRET`: rotarlo con al menos 32 bytes aleatorios para invalidar globalmente todas las sesiones administrativas existentes. Debe ser independiente de la contraseña y de otros secretos.
- `ADMIN_RATE_LIMIT_SECRET`: mantenerlo independiente. Rotarlo sólo de forma deliberada porque crea scopes HMAC nuevos; las filas anteriores quedan inertes y vencen por retención.

`ORDER_TOKEN_SECRET`, `ANALYTICS_HMAC_SECRET`, `ADMIN_SESSION_SECRET` y `ADMIN_RATE_LIMIT_SECRET` tienen impacto funcional y no deben rotarse como mantenimiento rutinario sin un plan específico. Después de una rotación administrativa, comprobar login, API protegida y logout sin imprimir valores.
