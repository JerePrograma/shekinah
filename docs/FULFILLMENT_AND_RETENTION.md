# Fulfillment, envío y retención

Desde el 2026-08-26, Dux es la única autoridad de inventario. Las reglas Mercado Libre y de stock local de este documento se conservan sólo como comportamiento histórico de pedidos legacy sin vínculo Dux. Los pedidos Dux nuevos están bloqueados hasta demostrar reserva, liberación, finalización y expiración mediante la API oficial.

## Alcance

El contrato de fulfillment aplica tanto a Checkout Pro como a WhatsApp. Antes de abrir WhatsApp, el backend valida nombre, celular, modalidad y, sólo para Correo Argentino, domicilio completo. También exige consentimiento explícito para compartir esos datos mediante WhatsApp, recalcula el carrito y persiste `orders` y `order_items`. `order_fulfillment` se persiste cuando la tarifa es determinística. Si Correo requiere una cotización manual, los datos quedan en memoria React y en el mensaje que el comprador decide abrir; D1 conserva sólo una huella SHA-256 para verificar la idempotencia, no la PII en claro. Nunca se guardan en `localStorage` ni analítica.

## Contrato operativo

El checkout y la continuación por WhatsApp solicitan siempre nombre completo y celular. Dirección, localidad, provincia y código postal son obligatorios únicamente para `correo_argentino`; `coordinated_pickup` los omite y el servidor normaliza cualquier valor legado a cadenas vacías para no persistir PII innecesaria. El cliente y el servidor rechazan solicitudes parciales o inválidas antes de crear el pedido o reservar stock. El CTA de WhatsApp permanece deshabilitado hasta que el formulario sea válido y se acepte el consentimiento específico. No se solicitan documento, datos de tarjeta ni información ajena a la coordinación.

Modalidades:

- `coordinated_pickup`: costo automático `ARS 0`;
- `correo_argentino`: hasta 1 kg inclusive `ARS 19.000`; más de 1 kg y hasta 5 kg inclusive `ARS 25.000`;
- para Correo, peso desconocido o superior a 5 kg: cotización manual por WhatsApp y cobro online bloqueado; el retiro coordinado continúa disponible por ARS 0.

Para un producto Dux no se deriva peso de envío, unidad ni granularidad desde el nombre o la presentación editorial. Hasta disponer de un campo oficial verificado, Correo Argentino queda en cotización manual y el checkout online falla cerrado. El clasificador histórico de presentaciones/nombres sólo aplica a productos legacy sin vínculo Dux y no define semántica de inventario.

En Checkout Pro integrado, `orders.total_minor` conserva el total autoritativo de productos más envío. Mercado Pago recibe el envío como un ítem separado y el webhook continúa comparando moneda e importe completo contra el pedido.

El Link de Pago manual fue retirado. El pedido de WhatsApp conserva en `orders.total_minor` el total recalculado por servidor antes de abrir el mensaje; ese registro y su estado `pending` no prueban pago, venta ni revenue.

## Migración

`migrations/0002_fulfillment_and_retention.sql` añade:

- `checkout_intents`, para reservar la intención idempotente y su huella de fulfillment;
- `order_fulfillment`, como relación uno a uno aditiva y compatible con pedidos anteriores;
- `analytics_maintenance`, para reclamar una única purga por mes.

`migrations/0003_checkout_intent_cart_fingerprint.sql` agrega la huella autoritativa del carrito a `checkout_intents`, backfillea desde pedidos existentes y evita reutilizar una reserva huérfana con otro carrito.

`migrations/0007_whatsapp_order_reservations.sql` agrega canal y resolución al pedido; `0008` aporta marcas temporales reutilizadas por ambos canales. Su reserva, vencimiento, aprobación y rechazo locales sólo permanecen para pedidos legacy sin vínculo ni identidad/candidata Dux. La expiración automática excluye expresamente pedidos Dux y nunca sustituye una liberación upstream.

`migrations/0008_checkout_pro_stock_and_whatsapp_identity.sql` conserva la ventana y marca histórica de consumo local. Sólo aplica a pedidos legacy. Para cualquier pedido presente en `dux_order_links`, `0012` bloquea líneas y cambios de estado; pagos, conciliación y expiración quedan fuera hasta que una migración posterior implemente el lifecycle Dux demostrado. Un reembolso no repone inventario automáticamente porque no prueba devolución de mercadería.

`migrations/0001_commerce.sql` permanece intacta.

## Analítica

Con `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS` es obligatorio y debe valer `730` en la configuración aprobada. La escritura de eventos programa una purga acotada como tarea de Pages Functions; el reclamo mensual evita ejecutar el borrado en cada solicitud.

La purga elimina eventos anteriores al corte, sesiones antiguas sin eventos y revocaciones vencidas. No procesa datos de pedidos ni PII.
