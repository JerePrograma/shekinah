# Fulfillment, envío y retención

## Alcance

El contrato persistente aplica a Checkout Pro y, cuando el comprador completa datos con una tarifa determinística, al pedido pendiente de WhatsApp. Antes de abrir WhatsApp, el backend recalcula el carrito y siempre persiste `orders` y `order_items`; `order_fulfillment` se persiste sólo si el request incluye datos completos y la tarifa es determinística. El formulario totalmente vacío y los envíos que requieren cotización manual no persisten PII: esos datos permanecen en memoria React y, si fueron completados, se incluyen únicamente en el mensaje que el comprador decide abrir. Nunca se guardan en `localStorage` ni analítica.

## Contrato operativo

El checkout solicita nombre completo, celular, dirección, localidad, provincia y código postal. Esos datos no se almacenan en `localStorage`. En Checkout Pro integrado se envían al iniciar el pedido y se persisten en `order_fulfillment`.

Modalidades:

- `coordinated_pickup`: costo automático `ARS 0`;
- `correo_argentino`: hasta 1 kg inclusive `ARS 19.000`; más de 1 kg y hasta 5 kg inclusive `ARS 25.000`;
- para Correo, peso desconocido o superior a 5 kg: cotización manual por WhatsApp y cobro online bloqueado; el retiro coordinado continúa disponible por ARS 0.

Una presentación explícita y válida se usa sólo cuando no contradice un peso único derivable del nombre. Si ambos valores difieren, el peso se clasifica como desconocido y Correo queda en cotización manual. El nombre se usa como respaldo únicamente cuando no existe presentación y contiene una sola expresión inequívoca. No existe peso por defecto.

En Checkout Pro integrado, `orders.total_minor` conserva el total autoritativo de productos más envío. Mercado Pago recibe el envío como un ítem separado y el webhook continúa comparando moneda e importe completo contra el pedido.

En el canal manual, el Link de Pago continúa sin monto predefinido y el cobro debe verificarse manualmente. Sin embargo, el pedido de WhatsApp ya conserva en `orders.total_minor` el total recalculado por servidor antes de abrir el mensaje; ese registro y su estado `pending` no prueban pago, venta ni revenue.

## Migración

`migrations/0002_fulfillment_and_retention.sql` añade:

- `checkout_intents`, para reservar la intención idempotente y su huella de fulfillment;
- `order_fulfillment`, como relación uno a uno aditiva y compatible con pedidos anteriores;
- `analytics_maintenance`, para reclamar una única purga por mes.

`migrations/0003_checkout_intent_cart_fingerprint.sql` agrega la huella autoritativa del carrito a `checkout_intents`, backfillea desde pedidos existentes y evita reutilizar una reserva huérfana con otro carrito.

`migrations/0007_whatsapp_order_reservations.sql` agrega canal y resolución al pedido. La reserva se deriva de los items de pedidos WhatsApp pendientes: no hay contador duplicado ni TTL. Aprobar descuenta el stock físico y consume la reserva en la misma transición D1; rechazar conserva el físico y libera la reserva. Un pedido abandonado permanece pendiente y reserva stock hasta una resolución administrativa.

`migrations/0001_commerce.sql` permanece intacta.

## Analítica

Con `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS` es obligatorio y debe valer `730` en la configuración aprobada. La escritura de eventos programa una purga acotada como tarea de Pages Functions; el reclamo mensual evita ejecutar el borrado en cada solicitud.

La purga elimina eventos anteriores al corte, sesiones antiguas sin eventos y revocaciones vencidas. No procesa datos de pedidos ni PII.
