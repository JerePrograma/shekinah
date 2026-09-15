# Política comercial del cliente — 2026-09-15

El titular delegó resolver las preguntas comerciales conservando los acuerdos existentes y adoptando criterios razonables para lo restante. Estas decisiones pueden corregirse posteriormente. No sustituyen las comprobaciones de proveedores ni acreditan por sí solas la activación productiva.

## Precios y disponibilidad

Dux conserva la autoridad de producto, código, precio, clasificación y disponibilidad. Se venden unidades comerciales enteras: una disponibilidad de 12,68 permite 12 unidades y conserva el remanente de 0,68. El decimal de stock no es un peso. El servidor revalida el carrito y no agrega recargos, descuentos o existencias ficticios.

## Entrega e importe final

Se mantienen las tarifas acordadas, expresadas en ARS:

| Condición | Importe |
| --- | ---: |
| Retiro coordinado | 0 |
| Correo, peso total mayor a cero y hasta 1.000 g inclusive | 19.000 |
| Correo, peso total mayor a 1.000 g y hasta 5.000 g inclusive | 25.000 |
| Peso desconocido, más de 5 kg o destino no confirmado | Cotización previa |

No se establece una compra mínima adicional a un carrito válido. Correo requiere domicilio completo y cobertura efectiva del transportista; no se promete cobertura universal. La entrega local a domicilio y el retiro en una sucursal de Correo quedan como coordinaciones excepcionales, con condiciones confirmadas antes del pago. El retiro sin cargo no representa una promesa de entrega gratuita a cualquier domicilio.

La tarifa por peso requiere un dato logístico estructurado por código Dux, con unidad y embalaje verificables cuando corresponda. Esa fuente no está acreditada al escribir este documento. Por eso el circuito Dux asistido conserva la cotización de Correo: el código no interpreta el nombre ni el stock decimal como peso y no cobra un envío desconocido a cero. Aplicar automáticamente estos tramos a Dux continúa pendiente de datos y contrato verificables.

Para excepciones se conserva el carrito y se ofrece retiro o consulta por WhatsApp. Si ya existe una solicitud, la cotización, el total y el pago deben continuar en esa misma solicitud. WhatsApp es opcional y una consulta no constituye un pedido, reserva o pago confirmado.

## Medios de pago

Las nuevas preferencias Checkout Pro excluyen el tipo `ticket` mediante `payment_methods.excluded_payment_types`, conforme a la [configuración oficial de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-settings/payment-methods). En Argentina ese tipo incluye Pago Fácil y Rapipago, según la [referencia de medios de pago](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-api/payment-methods/get). Se priorizan medios online y se conservan las opciones de tarjetas y dinero en cuenta que ofrezca el proveedor. No se fijan cuotas ni se excluyen marcas de tarjetas.

Se conserva `binary_mode=false`: una respuesta pendiente real sigue requiriendo conciliación y protección de stock. Excluir efectivo no garantiza aprobación inmediata. No se alteran preferencias antiguas ni se crea otra para reemplazar una respuesta incierta. La reserva Dux confirmada, los precios del servidor y el total definitivo preceden al pago.

La prueba del cuerpo enviado al proveedor valida esta configuración. La aceptación de una preferencia real con la cuenta productiva y el recorrido de redirección deben acreditarse por separado durante el smoke autorizado, sin cobro real.

## Reservas sin pago

Se adopta un umbral operativo de revisión de 60 minutos corridos desde la reserva confirmada. No es una liberación automática ni una promesa de atención permanente. El operador administrativo autorizado revisa el caso y resuelve las excepciones antes de ofrecer el cobro.

Si hubo un intento de pago, debe respetarse la protección financiera existente de 30 minutos y consultarse Mercado Pago con la vigencia exigida por el guard. Un pago pendiente o acreditado no se trata como abandono. Sólo se confirma la liberación en Shekinah después de la liberación real mediante el flujo Dux soportado. La preferencia conserva su vigencia técnica actual de 30 minutos; este criterio de revisión no la extiende.

## Criterio de finalización

El cliente carga los datos una vez, conoce el total confirmado, paga en Mercado Pago después de la reserva y recupera el mismo pedido al regresar. El checkout automático sigue pendiente de un contrato Dux verificable para el ciclo completo y de stock vigente sostenido. El circuito asistido y una consulta WhatsApp no se presentan como evidencia de automatización completa. Consultar la [operación y sus requisitos](COMMERCE_OPERATIONS.md) y registrar el resultado real del despliegue y de cada smoke.
