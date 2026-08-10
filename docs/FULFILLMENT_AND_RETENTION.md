# Fulfillment, envío y retención

## Alcance

El contrato persistente de este documento aplica al Checkout Pro integrado, actualmente preparado pero deshabilitado. El fallback manual autorizado no escribe fulfillment en D1: los datos permanecen en el estado React de la página y sólo se incluyen en el mensaje de WhatsApp si el comprador decide abrirlo.

## Contrato operativo

El checkout solicita nombre completo, celular, dirección, localidad, provincia y código postal. Esos datos no se almacenan en `localStorage`. En Checkout Pro integrado se envían al iniciar el pedido y se persisten en `order_fulfillment`.

Modalidades:

- `coordinated_pickup`: costo automático `ARS 0`;
- `correo_argentino`: hasta 1 kg inclusive `ARS 19.000`; más de 1 kg y hasta 5 kg inclusive `ARS 25.000`;
- para Correo, peso desconocido o superior a 5 kg: cotización manual por WhatsApp y cobro online bloqueado; el retiro coordinado continúa disponible por ARS 0.

Una presentación explícita y válida se usa sólo cuando no contradice un peso único derivable del nombre. Si ambos valores difieren, el peso se clasifica como desconocido y Correo queda en cotización manual. El nombre se usa como respaldo únicamente cuando no existe presentación y contiene una sola expresión inequívoca. No existe peso por defecto.

En Checkout Pro integrado, `orders.total_minor` conserva el total autoritativo de productos más envío. Mercado Pago recibe el envío como un ítem separado y el webhook continúa comparando moneda e importe completo contra el pedido.

En el fallback manual, el total mostrado en el navegador es sólo el importe operativo que se copia para que el comprador lo ingrese en el Link de Pago; no existe un `orders.total_minor` hasta que se active el flujo integrado. El comercio debe verificar y asociar el cobro manualmente antes del fulfillment.

## Migración

`migrations/0002_fulfillment_and_retention.sql` añade:

- `checkout_intents`, para reservar la intención idempotente y su huella de fulfillment;
- `order_fulfillment`, como relación uno a uno aditiva y compatible con pedidos anteriores;
- `analytics_maintenance`, para reclamar una única purga por mes.

`migrations/0003_checkout_intent_cart_fingerprint.sql` agrega la huella autoritativa del carrito a `checkout_intents`, backfillea desde pedidos existentes y evita reutilizar una reserva huérfana con otro carrito.

`migrations/0001_commerce.sql` permanece intacta.

## Analítica

Con `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS` es obligatorio y debe valer `730` en la configuración aprobada. La escritura de eventos programa una purga acotada como tarea de Pages Functions; el reclamo mensual evita ejecutar el borrado en cada solicitud.

La purga elimina eventos anteriores al corte, sesiones antiguas sin eventos y revocaciones vencidas. No procesa datos de pedidos ni PII.
