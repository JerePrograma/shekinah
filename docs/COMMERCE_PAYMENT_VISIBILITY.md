# Visibilidad financiera y pendientes comerciales

## Alcance implementado — 2026-09-08

Continuación de [COMMERCE_REACTIVATION.md](COMMERCE_REACTIVATION.md). Esta etapa implementa la lectura pública del pago con incidencia y una bandeja administrativa de consulta. Las menciones anteriores a estos dos puntos como pendientes son históricas; la ejecución asistida de tareas Dux, el pedido web y la apertura de Checkout Pro siguen pendientes. No acredita una compra operativa.

`server/order-payment-state.ts` calcula el estado financiero desde `payments`, con identidad, referencia, moneda e importe exactos. Conserva la prioridad de la proyección existente: approved, refunded, pending, rejected, cancelled. Cero filas exactas significa `none`, no pago ni suma de importes parciales. El estado comercial `orders.status` permanece separado y no se modifica.

La consulta pública por token conserva la protección existente, sus respuestas 404 indistinguibles y `no-store`. Una única lectura SQL devuelve pedido y pago coherentes. No expone IDs internos, IDs del proveedor, referencia Dux ni datos de entrega. El contrato agrega `payment` sin retirar campos; el cliente conserva compatibilidad con respuestas anteriores.

Un pago aprobado cuyo pedido no se haya proyectado a aprobado, o varios pagos aprobados, requiere revisión. El retorno informa que el pago fue recibido, indica no volver a pagar y separa preparación/entrega. Una aprobación manual sin pago no se anuncia como cobro. Ante una falla posterior de consulta, la pantalla conserva la evidencia financiera que ya recibió. Un reintegro no acredita devolución física ni liberación de stock.

`server/commerce-attention.ts` y `/api/admin/commerce-attention` proyectan una fila por pedido desde los libros existentes, sin crear otro ledger ni duplicar tareas por lecturas repetidas. Incluyen cobros múltiples, divergencia financiera y operaciones Dux pendientes, inciertas, de compensación, revisión o finalización. No aplican el filtro temporal del informe: un pedido antiguo pendiente continúa visible. La paginación es de 25 filas; no se ejecutan expiraciones ni mutaciones de inventario.

La bandeja se abre bajo demanda en Pedidos, usa autenticación y auditoría administrativas existentes y ofrece instrucciones de revisión, no botones que simulen una liberación o finalización. La lectura fallida no se presenta como una lista vacía. No se incluyen cambios de configuración, migraciones, llamadas nuevas a proveedores ni activación comercial.

## Validación

Las regresiones usan el adaptador SQLite del repositorio y datos sintéticos. Cubren pagos con estados de pedido diferentes, cobertura exacta, duplicados, prioridad financiera, ausencia de pago, reintegro sin liberación, colas antiguas, paginación y consulta protegida. Las pruebas React cubren información financiera, reintento, sesión vencida y rechazo de respuestas inválidas.

El resultado de `npm run verify`, CI y Pages se informa sobre el SHA publicado. Las verificaciones auxiliares con otro runtime no sustituyen esas pruebas ni acreditan D1 remoto, Dux o Mercado Pago reales. Mantener cerrada la entrada de ventas nuevas hasta completar intención compartida, unidad, reserva, preferencia, pedido web y gestión asistida verificadas.
