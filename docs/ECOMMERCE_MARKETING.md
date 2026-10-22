# Marketing y evolución del e-commerce

## Incorporación del 22 de octubre de 2026

Shekinah incorpora una sección **Marketing** en la administración, con cupones,
promociones automáticas y anuncios. La base de datos empieza sin campañas:
el administrador decide qué publicar y con qué condiciones.

Las campañas nacen por defecto como borradores y permiten edición, activación y
desactivación. Los anuncios pueden aparecer en la franja superior de la tienda
o en el inicio, con texto y un enlace interno opcional. Las fechas se ingresan
en la hora local del navegador y se conservan como instantes UTC en el servidor.
No se agrega publicidad de terceros ni seguimiento adicional.

El alta usa una clave estable por borrador: perder la respuesta y reintentar
los mismos datos recupera la misma campaña. Si esos datos se modifican durante
una incertidumbre de guardado, el conflicto exige actualizar el listado y revisar
la campaña existente antes de continuar.

Los descuentos admiten porcentajes enteros del 1 al 90, compra mínima en ARS,
tope monetario, vigencia, prioridad, SKU Dux exactos y límite global de pedidos
iniciados. Una lista de SKU vacía abarca todos los productos de la compra.
Se aplica el beneficio monetario mayor entre las promociones elegibles y el
cupón válido ingresado; no se acumulan. En un empate se usa la prioridad y el
orden estable de campañas. Un cupón inválido o que no aplica requiere corrección
o retiro explícito: no se informa como aceptado.

El mínimo se calcula sobre el subtotal base del carrito. El envío no se descuenta.
Esta versión aplica beneficios a la compra directa con retiro coordinado.
Correo Argentino conserva su cotización asistida y no acepta cupones.

## Importes y conservación de una compra

Dux conserva nombre base, SKU, precio base, unidades, stock y reservas. Shekinah
aplica una regla comercial explícita sobre ese precio base, conservando ambos
importes en evidencia. La cotización del carrito es estimativa: antes de preparar
la orden se releen los precios y existencias de Dux y se calcula el beneficio en
el servidor. El navegador envía productos, cantidades, versión y código de cupón;
nunca determina el importe cobrable.

Cada precio unitario final se expresa en centavos. El porcentaje se redondea por
unidad; un tope limita el descuento a los centavos representables por la cantidad
de cada SKU, sin dividir el mismo SKU en varias líneas ni superar ese tope.
Puede quedar un remanente inferior a la cantidad de unidades de una línea.
Por eso el tope expresa un máximo. Ningún precio final puede quedar en cero.

Dux recibe el precio unitario final, neto de IVA según el contrato existente,
con `porc_desc=0`. El pedido retornado debe coincidir con esas líneas y con el
total final. Mercado Pago reconstruye las mismas líneas persistidas. No se
descarta la comprobación de reserva física ni la consulta financiera autoritativa.
La aceptación de un precio promocional por el proveedor se debe acreditar en
Preview antes de habilitar una campaña real; las pruebas locales usan gateways
sintéticos y no acreditan un pedido o pago real.

El cupón forma parte de la identidad inmutable de la solicitud. El beneficio
se fija al crear el borrador de la orden, junto con el reclamo atómico del cupo.
Cambiar después la campaña no recotiza la orden ni provoca otra reserva Dux.
Un resultado incierto conserva su cupo y operación. El contador representa
pedidos iniciados, incluidos intentos fallidos o inciertos; no representa ventas
ni clientes únicos y no se libera por vencimiento local.

La recuperación de una compra tiene prioridad sobre una nueva cotización.
El recibo muestra el subtotal y el ahorro persistidos cuando existe un total
confirmado. La ausencia de campañas no cambia los importes habituales.

## Persistencia y puesta en servicio

- `0028_marketing.sql`: campañas, índices y ledger inmutable de cupos por orden.
- `0029_marketing_direct_checkout.sql`: protecciones adicionales para vincular
  el precio base Dux, la regla, la cotización guardada y las líneas finales.
- `/api/admin/marketing`: lectura y escritura con la sesión, protección de origen
  y auditoría existentes.
- `/api/marketing`: anuncios/promociones públicos y cotización de carrito.
  Los códigos de cupones privados no se incluyen en el listado público.

Aplicar ambas migraciones en orden, primero en Preview y después en Production,
con los bookmarks, comprobaciones y separación de entornos de
[COMMERCE_DEPLOYMENT.md](COMMERCE_DEPLOYMENT.md). No modificar migraciones
anteriores ni reaplicar migraciones ya registradas. Comprobar integridad de
claves foráneas, campañas vacías y guards nuevos antes de activar campañas.
La ausencia completa de marketing conserva el precio habitual para compras
sin cupón. Si existe una promoción activa pero faltan sus protecciones de
checkout, la compra se bloquea: no vuelve silenciosamente al precio íntegro.

Una compilación o un push no acredita una migración aplicada. Mantener separados
el resultado local, CI, SHA desplegado, esquema remoto y prueba de proveedores.
No cambiar mantenimiento, flags comerciales ni inventario para hacer pasar una
verificación de marketing.

## Próximas capacidades propuestas

| Prioridad | Capacidad | Resultado esperado y condición |
| --- | --- | --- |
| Alta | Seguimiento de preparación y envío | Estado de entrega comprensible para el comprador, separado del pago y con evidencia logística real. |
| Alta | Cotización automática de envíos | Usar pesos y dimensiones estructurados por SKU, cobertura y tarifas verificadas; conservar el circuito asistido mientras falten datos. |
| Alta | Rendimiento de campañas | Separar pedidos iniciados, pagos aprobados, reintegros y ahorro concedido; reutilizar la analítica consentida. |
| Media | Favoritos y recompra | Guardar productos preferidos y volver a armar un carrito con precios y disponibilidad actuales. |
| Media | Cuenta de cliente | Historial y direcciones con autenticación; habilita límites por cliente y beneficios de primera compra verificables. |
| Media | Productos relacionados | Recomendaciones por categorías Dux existentes y disponibilidad vigente, sin inventar equivalencias sanitarias. |
| Media | SEO comercial y Merchant Center | Datos de producto, disponibilidad y políticas consistentes con la tienda, con validación de las fichas. |
| Posterior | Recuperación de carritos | Mensajes sólo con consentimiento, canal configurado y autorización específica; no se envía nada con esta implementación. |
| Posterior | Beneficios adicionales | Importes fijos, combos y fidelización requieren reglas de reparto, identificación y conciliación propias antes de cobrarse. |

Para la propuesta SEO, la documentación primaria de Google describe
[datos de producto y Merchant Center](https://developers.google.com/search/docs/appearance/structured-data/product)
y [datos estructurados comerciales](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing).
Estas propuestas no se presentan como funcionalidades ya implementadas.
