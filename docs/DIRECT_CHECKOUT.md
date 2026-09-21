# Compra directa con Dux y Mercado Pago

El titular autorizó expresamente el 2026-09-15 ampliar la preparación asistida y aplicar una nueva migración después de 0023. Esta ampliación implementa compra directa para retiro coordinado, cuyo envío es cero. El cliente carga nombre y celular una vez, continúa la compra, ve el total confirmado por el servidor y abre Checkout Pro. WhatsApp es opcional para coordinación. La implementación y sus pruebas no acreditan por sí solas una activación productiva.

El [smoke productivo del 21 de septiembre](validation/DIRECT_CHECKOUT_PRODUCTION_2026-09-21.md)
acreditó ese recorrido sin aprobación administrativa, abrió Checkout Pro sin
cobrar y cerró la reserva de prueba por Dux y Shekinah. Consultar
[CURRENT_STATE.md](CURRENT_STATE.md) para los flags efectivos y las incidencias
que permanecen; las instrucciones de despliegue inicial se conservan como
procedimiento histórico y no autorizan reaplicar migraciones ya aplicadas.

## Contrato y autoridad

Se usa el contrato oficial Dux v2 revisado el 2026-09-15: [crear pedido](https://developers.duxsoftware.com.ar/reference/crear_pedido), [listar pedidos](https://developers.duxsoftware.com.ar/reference/listar_pedidos) y [listar productos](https://developers.duxsoftware.com.ar/reference/listar_items). La versión Markdown/OpenAPI de esas referencias documenta el cuerpo de `POST /v2/pedidos`, el depósito para reserva y el filtro `referencia` de `GET /v2/pedidos`. La descripción histórica de que no existía ese esquema ni recuperación por referencia quedó superada por esta revisión.

El catálogo publicado identifica el código Dux. Para cada compra se consulta su precio en `PRECIOS DEL NEGOCIO`, IVA y stock del depósito autorizado directamente en Dux. Las cantidades comerciales son enteras; 12,68 unidades disponibles admiten 12 y rechazan 13. No se interpreta ese decimal como peso ni se utilizan precios o stock enviados por el navegador. El pedido Dux recibe precio neto e IVA separado; su total y sus líneas deben coincidir con el total bruto fijado en Shekinah antes de habilitar Mercado Pago.

La reserva se acredita mediante el pedido exacto activo, referencia, empresa, sucursal, códigos, cantidades, precio, IVA, número e ID, más el aumento del stock reservado y la reducción del disponible sin disminuir el stock real. La comparación es conservadora: un movimiento concurrente incompatible exige revisión y no habilita el cobro. Obtener un ID no es suficiente. Una nueva consulta al pedido antes de confirmar detecta anulaciones ocurridas durante una pausa.

## Persistencia y recuperación

`0024_direct_dux_checkout.sql` agrega estado y progreso a `checkout_intents`, una exclusión temporal por compra, un coordinador D1 de peticiones Dux y guards específicos de origen `automatic_api`. Conserva las migraciones previas, las líneas y estados históricos, la idempotencia y la separación financiera. No reconstruye tablas de clientes ni inventario.

`POST /api/orders/[publicToken]/prepare` avanza como máximo una llamada Dux. No acepta body ni precios y exige origen válido, token protegido y límites de acceso. `GET .../request-status` continúa siendo de sólo lectura. Las consultas del checkout y la reconciliación comparten un intervalo mínimo de cinco segundos por entorno D1 cuando la compra directa está habilitada. No habilitar simultáneamente tráfico Preview y Production con el mismo token Dux: son bases independientes y sus coordinadores no se comparten.

El intento se persiste inmediatamente antes del POST Dux. Una respuesta incierta sólo se recupera por referencia; incluso una búsqueda vacía no autoriza otro POST. El navegador retoma el mismo progreso, con un máximo de 120 verificaciones automáticas por período de observación. Una pausa puede requerir volver a consultar el estado; no se genera otra clave. Una cotización vencida antes de cualquier intento Dux cierra únicamente el borrador sin reserva. Después de intentar el POST se conserva la incertidumbre y la evidencia.

La administración distingue las compras en preparación de las confirmadas. «Continuar verificación Dux» usa `POST /api/admin/web-order-requests/[id]/resume`, autenticación, origen, auditoría y la misma identidad persistida. No recibe datos de carrito ni habilita otro POST ante incertidumbre. La recuperación requiere que la configuración de compra directa siga habilitada; durante un rollback debe diagnosticarse la incidencia antes de reabrirla.

Una solicitud directa que todavía no tiene orden puede cerrarse como incidencia
mediante el rechazo administrativo existente. El servidor exige una preparación
sin lease activo, cambia conjuntamente la solicitud a `rejected` y la preparación
a `failed`, invalida el claim y conserva el error y el progreso para auditoría.
Una respuesta tardía no puede reabrirla. Una orden ya creada o una reserva incierta
exigen su circuito de recuperación/cierre; este rechazo no libera stock ni pagos.
Tampoco permite aceptar manualmente una preparación directa en curso.

El diagnóstico `dux_order_api_transport_failure` registra únicamente endpoint,
método y estado HTTP; si no llegaron encabezados, distingue timeout de excepción
de transporte. No registra token, query, referencia, headers ni cuerpos. No cambia
los reintentos permitidos ni convierte una respuesta incierta en éxito.

La coordinación ocupa una consulta D1 por intento y reserva ventanas de inicio de un segundo separadas seis segundos. Una espera fuera de su ventana falla antes de consultar Dux. Con DIRECT habilitado, el sincronizador admite hasta 24 intentos HTTP y escribe hasta 500 identidades por sentencia JSON, conservando el límite de 1,9 MB por carga, las 1.000 identidades, el presupuesto diario y la publicación atómica. Su plazo máximo de siete minutos queda dentro del lease de treinta minutos sin heartbeats adicionales. La prueba con cliente real simulado mide 44 consultas D1 para 1.000 productos y un retry; quedan seis para el envoltorio y los caminos de error dentro del límite de [50 consultas por invocación de D1 Free](https://developers.cloudflare.com/d1/platform/limits/). Si se agota el presupuesto o una carga excede el tamaño, no se publica un catálogo parcial.

## Pago y cierre

Dux puede devolver la referencia ASCII completa en mayúsculas. La recuperación
acepta únicamente la identidad exacta o esa normalización, rechaza coincidencias
múltiples y conserva todos los cotejos de empresa, sucursal, líneas y total. No
reenvía el POST. La evidencia normalizada usa la identidad interna inmutable y
`providerReference` conserva la referencia literal del proveedor; los guards D1
y las migraciones aplicadas no se modifican.

El endpoint de Checkout Pro existente acepta la reserva automática sólo con `DIRECT_CHECKOUT_ENABLED=true` y todos los guards 0024 presentes. Reutiliza su preferencia persistida y no inicia un pago antes de confirmar stock y total. Las evidencias autoritativas de Mercado Pago conservan su prioridad aunque exista una incidencia Dux. La redirección y el retorno no acreditan un pago; el webhook verifica al proveedor. El checkout legacy y el Link de Pago manual permanecen retirados.

La API pública revisada no documenta anular o finalizar pedidos. El cierre operativo usa la [gestión de pedidos](https://ayuda.duxsoftware.com.ar/es/articles/8886589-gestion-de-pedidos) y la [reserva de stock](https://ayuda.duxsoftware.com.ar/es/articles/8736752-como-utilizar-reserva-de-stock) oficiales de Dux, y luego la confirmación administrativa existente en Shekinah. Se conservan los guards de 30 minutos desde el intento de pago, conciliación de hasta dos minutos y bloqueo de liberación con pago pendiente o aprobado. Finalizar requiere pago aprobado verificado. Un reintegro no repone stock automáticamente.

No hay cancelación automática de reservas abandonadas. Se aplica la revisión operativa de 60 minutos de la [política comercial](COMMERCE_CUSTOMER_POLICY.md); el negocio debe resolverla mediante el flujo soportado. No prometer operación desatendida de liberación/finalización.

## Envío

La compra directa de esta ampliación cubre retiro coordinado sin cargo. Correo mantiene la cotización asistida en la misma solicitud. Se conservan los tramos acordados de ARS 19.000 hasta 1 kg y ARS 25.000 entre más de 1 y 5 kg; aplicarlos automáticamente requiere peso logístico estructurado y cobertura acreditados. `GET /v2/items` no acredita ese peso. No inferirlo sólo del nombre, no cobrar envío desconocido a cero y no presentar una estimación como total definitivo.

## Despliegue y rollback

1. Publicar el SHA validado con `DIRECT_CHECKOUT_ENABLED=false`; conservar cerrados los otros flags comerciales durante la migración. `VITE_COMMERCE_ENABLED` permanece falso porque pertenece al checkout anterior.
2. Consultar el historial remoto completo de ambas D1. Para esta ampliación sólo se admite el prefijo continuo 0001–0023 o 0001–0024. Detenerse ante una migración desconocida o inconsistencia.
3. Guardar un bookmark nuevo de Preview. Aplicar exclusivamente 0024 si está pendiente; verificar el historial, todos los objetos de `DIRECT_CHECKOUT_GUARDS`, las seis columnas nuevas, los objetos previos y `PRAGMA foreign_key_check` vacío. Production requiere la evidencia de Preview y un bookmark propio antes de la misma operación. No ampliar el script histórico `apply-commerce-d1.ps1`, cuyo alcance deliberado termina en 0023.
4. Configurar `DUX_ORDER_PERSONAL_ID` y `DUX_ORDER_CUSTOMER_ID` a partir de identidades existentes verificadas en Dux. Conservar token, empresa, sucursal, depósito y secretos server-side; nunca usar `VITE_*` para secretos. El ejemplo versionado deja valores sin completar y el flag cerrado.
5. Inspeccionar `/api/admin/commerce-readiness`: `directCheckout` distingue esquema, identidades, flag, bloqueos y compras en preparación/revisión. `ready` valida configuración y D1; no hace llamadas al proveedor ni sustituye el smoke.
6. Abrir WEB, comprobar solicitud durable e idempotente y cerrar su prueba; abrir ASSISTED y comprobar su circuito; abrir DIRECT y comprobar reserva Dux; abrir COMMERCE sólo con reserva confirmada y crear una preferencia controlada sin cobro. Cada apertura requiere despliegue, propagación, diagnóstico y logs. Registrar flags, hora UTC, SHA y cierre de pruebas.
7. Ante un fallo, cerrar únicamente el flag recién abierto, conservar evidencia y corregir hacia adelante. La recuperación de estados y el cierre administrativo no justifican restaurar D1. No reaplicar 0020–0023 ni eliminar reservas directamente en tablas.

El [registro de validación](validation/DIRECT_CHECKOUT_2026-09-15.md) acredita por separado suite local, ambas D1, CI, Pages, flags, Dux real, Checkout Pro sin pago y limpieza. Hasta obtener cada recibo, esa etapa permanece pendiente de acreditación.
