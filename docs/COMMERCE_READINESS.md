# Diagnóstico de preparación comercial

## Objetivo

Este documento describe el diagnóstico administrativo de sólo lectura incorporado después de la reactivación comercial autorizada. Su función es separar **código desplegado**, **esquema D1**, **configuración**, **estado Dux**, **configuración de Mercado Pago** y **contrato externo todavía no demostrado**. Ningún resultado del diagnóstico activa una capacidad ni sustituye una prueba operativa.

La vista administrativa usa `/api/admin/commerce-readiness`. Requiere la misma identidad y auditoría que el resto del backoffice. No llama Dux ni Mercado Pago; inspecciona exclusivamente D1 y la presencia/validez estructural de configuración ya disponible en Pages. Los valores de secretos nunca forman parte de la respuesta.

## Solicitudes web

El diagnóstico comprueba que `0020_web_order_requests.sql` esté materializada por sus columnas, tabla de rate limit y guards SQL, en vez de asumir que un archivo versionado equivale a una migración aplicada. También informa si `WEB_ORDERS_ENABLED` está abierto, si existe la protección `ORDER_TOKEN_SECRET`, si hay snapshot Dux publicado y cuántas solicitudes existen o siguen `submitted`.

El frontend muestra además el valor compilado de `VITE_WEB_ORDERS_ENABLED`, que el servidor no puede deducir de forma fiable del entorno de ejecución. Ambos controles deben habilitarse de forma deliberada después de migrar y probar el entorno correspondiente. Cerrar las altas no debe romper recuperación, consulta o administración de solicitudes ya existentes.

Un snapshot obsoleto se presenta como advertencia para la solicitud asistida; no convierte el registro en una reserva ni en un cobro. Checkout Pro, en cambio, lo trata como bloqueo.

## Checkout Pro

El diagnóstico informa, sin revelar valores:

- `COMMERCE_ENABLED` y `DUX_API_ENABLED`;
- modo de Mercado Pago;
- validez estructural de la credencial de Mercado Pago y, en producción, correspondencia con la aplicación autorizada según el contrato existente;
- presencia de la clave de webhook y de la protección de pedidos;
- validez del origen público configurado;
- resultado actual de `assertDuxCommerceLifecycleAvailable`;
- disponibilidad y frescura del snapshot Dux.

Además conserva tres bloqueos de contrato independientes de los flags. No se eliminan por compilar o por habilitar Dux:

1. `DUX_ORDER_PRODUCT_SCHEMA_UNVERIFIED`;
2. `DUX_ORDER_REFERENCE_RECOVERY_UNVERIFIED`;
3. `DUX_ORDER_RELEASE_FINALIZE_UNVERIFIED`.

Mientras cualquiera siga vigente, el diagnóstico declara `automaticDuxMutationAllowed=false`.

## Revisión pública Dux del 10 de septiembre de 2026

Se revisó nuevamente la documentación pública oficial, porque el encargo inicial referenciaba rutas que ya no coinciden con la referencia publicada actual.

Referencia oficial observada:

- **Crear Pedido**: `POST /WSERP/rest/services/pedido/nuevopedido`;
- **Consultar Pedidos**: `GET /WSERP/rest/services/pedidos`.

La creación documenta como obligatorios `fecha`, `id_empresa`, `id_sucursal_empresa`, `apellido_razon_social`, `categoria_fiscal` y `productos`. También documenta `referencia` y `id_deposito`; este último se describe como depósito en el que se quiere reservar stock.

La consulta exige empresa, sucursal y rango de fechas y documenta paginación y filtros como `nroPedido`, cliente, CUIT y estados. La referencia pública consultada **no documenta un filtro por `referencia`**. Por lo tanto, que el POST acepte una referencia estable no demuestra que una respuesta perdida pueda recuperarse automáticamente y de forma inequívoca por esa referencia antes de decidir un retry.

La representación pública recuperada de Crear Pedido identifica `productos` como un array obligatorio, pero no expone en ese esquema los campos internos de cada objeto de producto con precisión suficiente para programar una mutación sin inventarlos. Tampoco se acreditó en esas páginas un endpoint de liberación/anulación/finalización que satisfaga el contrato de inventario del proyecto.

Por estas razones esta iteración no añade un POST Dux. Tampoco utiliza facturas, cobros u otros comprobantes como sustituto del lifecycle de pedido: eso mezclaría stock, cumplimiento y fiscalidad.

Referencias verificadas al implementar:

- <https://developers.duxsoftware.com.ar/reference/crear-pedido-1>
- <https://developers.duxsoftware.com.ar/reference/consultar-pedidos-1>

Revisar nuevamente antes de implementar una mutación: la documentación externa puede cambiar.

## Estado Dux leído desde D1

La vista muestra únicamente metadatos operativos:

- existencia del esquema Dux esperado;
- flags de colección, catálogo público y cutover transaccional de `dux_catalog_control`;
- disponibilidad, cantidad, fecha y frescura del snapshot v2;
- resultado de la última sincronización;
- cantidad de vínculos y operaciones Dux en estados que requieren atención;
- cantidad de pedidos con divergencia financiera detectada desde `payments` y `orders`.

No lee ni publica el payload completo del catálogo, PII de pedidos, tokens, cuerpos del proveedor o credenciales. Si el esquema Dux está incompleto o una lectura estructural falla, se informa como no verificable; no se inventa un estado saludable.

## Uso operativo

Antes de activar solicitudes web, el bloque correspondiente debe demostrar al menos: esquema 0020 aplicado, secreto de token válido, snapshot disponible y flag server-side abierto; el operador debe comprobar por separado el flag compilado del frontend y realizar el smoke de Preview/producción correspondiente.

Antes de activar Checkout Pro, un tablero sin errores de configuración **no es suficiente**. Los bloqueos del contrato Dux deben desaparecer por una implementación versionada y probada que demuestre creación, recuperación ante incertidumbre, unidad/cantidad, reserva y compensación/finalización. No cambiar el diagnóstico a verde retirando los códigos sin resolver la operación que representan.

El diagnóstico es deliberadamente de sólo lectura. La activación de flags, aplicación de migraciones, creación de pedidos Dux, cobros y reintegros permanecen fuera de este endpoint y conservan sus procedimientos y autorizaciones propios.
