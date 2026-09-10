# Semántica de cantidades de stock Dux

## Regla funcional confirmada — 2026-09-10

Las cantidades decimales observadas en el stock por depósito de Dux representan **equivalentes de la unidad comercial del ítem Dux**. No deben rechazarse ni redondearse durante la lectura del proveedor.

Ejemplo confirmado: si el ítem comercial es `Abedul 100gr` y Dux informa `stock_disponible = 12,68`, existen `12,68` equivalentes de ese ítem. Para una venta web que sólo admite cantidades enteras, hay **12 unidades comerciales completas vendibles** y queda un remanente de `0,68` unidad.

Si la presentación estructurada y verificada fuera exactamente 100 g, esos `12,68` equivalentes corresponden matemáticamente a 1.268 g (1,268 kg). Sin embargo, Shekinah **no debe inferir peso, presentación o unidad a partir del nombre del producto**. Esa conversión física sólo puede utilizarse cuando exista un dato estructurado y autoritativo que establezca la presentación.

## Contrato técnico

- `stock_real`, `stock_reservado` y `stock_disponible` se conservan como números decimales finitos tal como los entrega Dux.
- El carrito público sigue admitiendo cantidades enteras de ítems. Su máximo por producto es `floor(stock_disponible)`, limitado además por el máximo general del carrito.
- `12,68` permite solicitar 12 unidades completas; 13 debe rechazarse.
- Una cantidad positiva menor que 1 no alcanza para una unidad comercial completa y no habilita agregar una unidad al carrito.
- No se convierte el remanente fraccionario en otra variante, presentación o producto.
- No se usa el decimal de stock para calcular el peso de Correo Argentino. El peso de envío requiere datos de presentación estructurados o una cotización final asistida.
- Esta regla no habilita el checkout legacy ni sustituye la reserva Dux. La compra asistida continúa requiriendo la verificación exacta de pedido y reserva antes de ofrecer Mercado Pago.

La captura de stock actual ya conserva decimales. La regresión del carrito debe proteger específicamente que el límite de unidades completas use `Math.floor` sin destruir la observación decimal original.
