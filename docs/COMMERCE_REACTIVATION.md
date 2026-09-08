# Reactivación comercial e idempotencia

## Contrato vigente — 2026-09-08

El usuario autorizó implementar Checkout Pro, pedidos registrados en la propia web, idempotencia persistente y gestión asistida en Dux cuando no exista una operación pública automatizable y verificada. Esta autorización sustituye el objetivo histórico de mantener todas las ventas cerradas; no demuestra que el circuito ya esté implementado, desplegado o activado.

Dux conserva autoridad sobre identidad, SKU, precio, unidad y stock. Mercado Pago conserva autoridad financiera. Aceptar un pedido manual no confirma un pago y un reembolso no confirma devolución física ni repone inventario. El contenido editorial Mercado Libre no condiciona la venta.

No retirar guards ni habilitar flags por esta autorización solamente. Antes de cobrar deben acreditarse unidad comercial, total definitivo, compromiso real de stock, webhook y tratamiento de incidencias. Una reserva asistida debe tener evidencia y trazabilidad; un clic administrativo o un POST exitoso no demuestran por sí solos su efecto físico. No ejecutar cobros, reintegros o comprobantes fiscales de prueba sin caso y límites autorizados.

## Alcance implementado en esta corrección

`server/orders.ts` → `updateOrderFromPayment` separa la evidencia financiera de la proyección del pedido:

1. Valida importe, moneda y referencia contra el pedido existente.
2. Persiste el pago con el UPSERT idempotente existente por `provider_payment_id`.
3. Comprueba que la fila persistida corresponde al mismo pedido, importe, moneda y referencia. Una identidad reutilizada incompatiblemente devuelve `PAYMENT_IDENTITY_CONFLICT` y no transiciona el pedido.
4. Ejecuta `assertDuxOrderLifecycleUnlinked` sin relajar sus condiciones.
5. Actualiza el estado del pedido a partir de todos sus pagos persistidos, conservando las prioridades existentes.

La escritura financiera y la proyección del pedido no comparten una transacción que pueda borrar la primera ante un error posterior. No se crea otro ledger, no cambia la firma pública de la función y no se modifica el esquema.

| Situación | Evidencia financiera | Pedido e inventario |
| --- | --- | --- |
| Pago incompatible | No se registra como pago válido de ese pedido | Sin transición |
| Falla al escribir el pago | No se afirma persistencia | Sin transición |
| Bloqueo Dux o esquema Dux ausente tras la escritura | El pago válido permanece | El guard sigue rechazando la transición |
| Falla SQL al proyectar el pedido | El pago válido permanece | La sentencia fallida no se considera exitosa |
| Reintento compatible | Se reutiliza la misma identidad de pago | Se vuelve a intentar la proyección, sin omitir guards |
| Pedido histórico compatible sin bloqueo | Se conserva la agregación de pagos existente | Se mantiene el comportamiento anterior |

El webhook conserva firma, consulta autoritativa y comprobaciones de contexto. Si la proyección falla, su manejo de errores sigue registrando el evento como fallido/reintentable: guardar un pago no equivale a declarar el pedido cumplido. Esta corrección no elimina las respuestas 503 de lifecycle ni activa nuevas preferencias o pedidos.

Las afirmaciones de documentos anteriores según las cuales el bloqueo Dux impide también persistir `payments` describen el comportamiento previo. El bloqueo del pedido permanece; la evidencia financiera ya no debe depender de ese bloqueo.

## Validación y límites

`server/orders.test.ts` conserva los casos previos de importe, moneda, referencia, identidad y agregación. Verifica además conservación financiera para vínculos Dux y pedidos históricos mapeados, reintentos concurrentes del mismo pago, interrupción SQL posterior a su escritura, recuperación idempotente, fallo de escritura y esquema Dux ausente. Las pruebas usan el adaptador SQLite existente y datos sintéticos; no mutan proveedores.

Ejecutar las herramientas del repositorio con las versiones fijadas: `npm run verify` y `npm run build:pages`. Cualquier ejecución auxiliar con otro runtime se informa separadamente y no sustituye Vitest, E2E, CI, D1 remoto ni pruebas reales con proveedores. CI y Pages deben comprobarse sobre el mismo SHA; un despliegue puede preceder al fin de CI.

No se aplican migraciones, no se cambian flags, no se realizan compras y no se acredita operación productiva con este documento.

## Continuación necesaria antes de la apertura

Completar la intención comercial persistente compartida entre canales y la reclamación atómica de operaciones Dux, reutilizando `dux_order_links` y `dux_order_operations`. Un resultado mutante incierto no autoriza otro POST ni siquiera al vencer una clave o lease.

Resolver identidad Dux canónica en las líneas y guards SQL mediante una migración nueva, sin editar migraciones aplicadas ni reconstruir asociaciones editoriales falsas. Acreditar unidades, depósito/variante, disponibilidad y reserva real antes de ofrecer el cobro. La falta de cancelación pública no es un bloqueo funcional global si existe un procedimiento asistido validado, pero ese procedimiento todavía debe implementarse y comprobarse.

Completar pedido web independiente de WhatsApp, consulta segura, aprobación comercial separada del pago, gestión administrativa de incertidumbre/liberación/finalización y presentación explícita del pago con incidencia. La conservación en `payments` no resuelve por sí sola la cola administrativa ni la respuesta pública de estado, que requieren trabajo adicional.

Validar Preview antes de producción, respaldar antes de cualquier migración y abrir sólo las capacidades acreditadas. El cierre de nuevas ventas debe mantener webhooks, evidencia y conciliación de operaciones existentes. No restaurar una base sobre cobros nuevos, borrar evidencia ni liberar stock por un vencimiento local.
