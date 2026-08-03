# Fulfillment, envío y retención

## Contrato operativo

El checkout solicita nombre completo, celular, dirección, localidad, provincia y código postal. Esos datos no se almacenan en `localStorage`: sólo se envían al iniciar el pedido y se persisten en `order_fulfillment`.

Modalidades:

- `coordinated_pickup`: costo automático `ARS 0`;
- `correo_argentino`: hasta 1 kg inclusive `ARS 19.000`; más de 1 kg y hasta 5 kg inclusive `ARS 25.000`;
- peso desconocido o superior a 5 kg: cotización manual por WhatsApp y checkout online bloqueado.

La presentación explícita del catálogo tiene prioridad. El nombre se usa como respaldo únicamente cuando no existe presentación y contiene una sola expresión de peso inequívoca. No existe peso por defecto.

`orders.total_minor` conserva el total autoritativo de productos más envío. Mercado Pago recibe el envío como un ítem separado y el webhook continúa comparando moneda e importe completo contra el pedido.

## Migración

`migrations/0002_fulfillment_and_retention.sql` añade:

- `checkout_intents`, para detectar la reutilización de una clave con datos de entrega distintos;
- `order_fulfillment`, como relación uno a uno aditiva y compatible con pedidos anteriores;
- `analytics_maintenance`, para reclamar una única purga por mes.

`migrations/0001_commerce.sql` permanece intacta.

## Analítica

Con `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS` es obligatorio y debe valer `730` en la configuración aprobada. La escritura de eventos programa una purga acotada como tarea de Pages Functions; el reclamo mensual evita ejecutar el borrado en cada solicitud.

La purga elimina eventos anteriores al corte, sesiones antiguas sin eventos y revocaciones vencidas. No procesa datos de pedidos ni PII.
