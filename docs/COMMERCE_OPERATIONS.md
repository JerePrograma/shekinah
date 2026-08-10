# Operación del comercio

## Fallback manual temporal

Mientras `COMMERCE_ENABLED=false`, el flujo público autorizado usa el Link de Pago `https://link.mercadopago.com.ar/shekinahmoreno` y WhatsApp `5492236216559`.

Procedimiento operativo mínimo:

1. El comprador arma el carrito y, si el envío tiene total definido, copia el monto y abre el Link de Pago.
2. El comprador ingresa el monto en Mercado Pago y envía el carrito por WhatsApp.
3. Antes de preparar o entregar, el comercio debe verificar el cobro directamente en su cuenta de Mercado Pago. No aceptar capturas, texto de WhatsApp ni el retorno del navegador como prueba suficiente.
4. Asociar manualmente el pago con el carrito por importe, comprador y contexto de la conversación. Si hay ambigüedad, no liberar el pedido hasta confirmarla.
5. Para Correo con peso desconocido o superior a 5 kg, cotizar primero por WhatsApp; el sitio bloquea el Link de Pago mientras el total sea indeterminado.

Este flujo no escribe `orders`, `payments` ni `payment_events` en D1 y no recibe Webhooks del Link de Pago generado en el panel. No usar las consultas del backoffice para inferir su estado. Mantener registro operativo externo sólo según la política del negocio y sin copiar datos sensibles al repositorio.

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

La interfaz `/admin` consume:

- `/api/admin/products` y `/api/admin/products/:id` para el ABM del catálogo;
- `/api/admin/summary`;
- `/api/admin/orders?limit=25`;
- `/api/admin/exports/orders.csv`;
- `/api/admin/exports/analytics.csv`;
- `/api/admin/audit`.

El catálogo de productos es editable. Pedidos, analítica, exportaciones y auditoría permanecen de sólo lectura. Los endpoints de reportes aceptan opcionalmente `from=AAAA-MM-DD` y `to=AAAA-MM-DD` donde corresponda; el rango máximo es 366 días.

La auditoría registra:

- subject y email validados por Access;
- acción administrativa de lectura o mutación de catálogo;
- tipo e identificador de destino cuando corresponda;
- resultado HTTP;
- request ID técnico;
- fecha del servidor.

No registrar tokens JWT, cookies, cuerpos de petición, firmas de webhook ni parámetros completos de consulta.

## Reportes

- `summary`: pedidos, aprobados, pendientes, rechazados, facturación aprobada y ticket promedio.
- `analytics/funnel`: page view, product view, agregado, inicio y redirección de checkout.
- `analytics/products`: vistas y agregados por producto.
- `analytics/sources`: fuente agrupada.
- `analytics/devices`: clase de dispositivo agrupada.
- CSV de pedidos: hasta 1.000 filas por rango.
- CSV de analítica: hasta 1.000 filas por rango.

Las celdas CSV que comienzan con caracteres interpretables como fórmula se prefijan con apóstrofo. Aun así, los archivos deben abrirse como datos y no habilitar macros.

## Retención

El código no elimina pedidos, pagos, webhooks ni auditorías automáticamente. Para analítica, `purgeAnalyticsIfDue` reclama como máximo una ejecución por mes y elimina eventos, sesiones huérfanas y revocaciones con fecha estrictamente anterior al corte. Si la purga falla, libera el reclamo para permitir un reintento.

La política autorizada es de 730 días. Antes de habilitar `ANALYTICS_ENABLED=true`, configurar `ANALYTICS_RETENTION_DAYS=730`, comprobar el binding D1 y registrar evidencia de la primera ejecución controlada. Las revocaciones conservan sólo el HMAC de la sesión hasta alcanzar ese mismo corte.

No ejecutar borrados masivos sin backup y plan de reversión.

## Rotación de secretos

- Rotar de inmediato ante sospecha de exposición.
- `MERCADO_PAGO_ACCESS_TOKEN`: rotar en Mercado Pago y actualizar Pages antes de revocar el anterior, cuando el proveedor lo permita.
- `MERCADO_PAGO_WEBHOOK_SECRET`: coordinar el cambio para no rechazar notificaciones legítimas durante la transición.
- `ORDER_TOKEN_SECRET`: su rotación invalida los tokens públicos de pedidos existentes; planificar compatibilidad o conservar el valor mientras existan pedidos consultables.
- `ANALYTICS_HMAC_SECRET`: su rotación cambia el hash de sesión y dificulta eliminar sesiones históricas con el identificador local anterior.

Las dos últimas rotaciones tienen impacto funcional y no deben ejecutarse como mantenimiento rutinario sin plan específico.
