# Solicitudes web persistentes y gestión comercial

## Alcance implementado

Continuación del encargo del 2026-09-08. Este circuito registra una **solicitud previa a la compra**, independiente de WhatsApp. No se presenta como pedido pagado, reserva, cotización definitiva ni sustituto de Checkout Pro. Complementa [COMMERCE_REACTIVATION.md](COMMERCE_REACTIVATION.md) y [COMMERCE_PAYMENT_VISIBILITY.md](COMMERCE_PAYMENT_VISIBILITY.md).

El comprador reutiliza los datos de entrega del carrito y recibe una referencia y un enlace protegido. El servidor obtiene la identidad, el nombre y el precio observado del snapshot Dux, nunca del navegador. Las cantidades son solicitudes que requieren confirmar presentación y unidad comercial. No se infieren unidades o peso desde nombres. El total permanece `null`; el envío por correo queda a cotizar, no gratuito. Retiro conserva el costo autorizado de cero sin inventar un precio final del pedido.

El administrador puede consultar la solicitud y su detalle y aceptarla para gestión o rechazarla. No se implementa en este circuito una operación para cobrar, reservar, liberar, facturar o confirmar cumplimiento. Esas operaciones requieren el coordinador Dux/Checkout Pro y evidencia independientes. Aceptar sólo cambia `submitted` a `accepted`; rechazar cambia a `rejected`. La resolución contraria posterior produce conflicto. Repetir la misma resolución devuelve el estado actual sin otra transición.

## Persistencia e idempotencia

`0020_web_order_requests.sql` amplía `checkout_intents`, sin crear otro libro de operaciones comerciales. Las intenciones históricas conservan `intent_kind=legacy` y sus huellas. Las solicitudes web agregan referencia, hashes de capacidades, snapshot inmutable y resolución con actor y fecha.

La clave UUID no autoriza por sí sola una recuperación: se exige además un secreto aleatorio de propietario de 256 bits, cuyo hash queda en D1. El token público se deriva por HMAC con dominio separado y sólo su hash se almacena. La respuesta pública contiene referencia, estado y fechas, pero no datos de entrega, hash de propietario, clave idempotente, IDs financieros ni referencias Dux.

La huella autoritativa normaliza líneas ordenadas, cantidades, versión del catálogo y entrega. Una clave de su propietario con otro contenido devuelve 409 antes de nuevas lecturas de catálogo o escrituras comerciales. Otro propietario recibe 404. Compradores con claves distintas no se fusionan aunque sus carritos sean iguales.

El INSERT único y las cuotas de creación se ejecutan en un único batch D1. Los contendientes que no insertaron su referencia candidata no consumen una nueva cuota de creación. No hay llamadas HTTP a proveedores dentro de una transacción ni mutaciones externas en este flujo. Un fallo de respuesta después de persistir se recupera con la misma clave/capacidad; no se expira para recrear otra solicitud. El replay no recalcula contra un snapshot nuevo.

En el navegador, IndexedDB serializa la reclamación entre pestañas y conserva únicamente las capacidades técnicas, no los datos de entrega. Si no puede persistir la identidad, no envía el alta. No existe fallback volátil que genere claves tras una recarga. Preparar otra solicitud requiere una acción deliberada y volver a leer la resolución terminal; se archiva la capacidad anterior y no se borran datos del servidor. No se garantiza deduplicación entre navegadores independientes o después de que el usuario borre su almacenamiento: son identidades distintas, no un deduplicado global por carrito.

La migración impide modificar el snapshot, borrar solicitudes por una expiración local o convertir su misma clave a `orders` mediante una ruta legacy. Esa conversión queda explícitamente pendiente, no se salta la coordinación por cambiar de canal.

## Endpoints y controles

- `POST /api/orders/request`: `mode=create` con identidad, líneas y entrega; `mode=recover` con identidad y capacidad. Origen exacto, JSON acotado, campos estrictos y controles server-side.
- `GET /api/orders/:publicToken/request-status`: consulta pública mínima con token opaco.
- `GET /api/admin/web-order-requests`: listado paginado, con pendientes primero y sin filtro temporal que oculte solicitudes antiguas.
- `GET /api/admin/web-order-requests/:id`: detalle protegido con los datos necesarios para gestionar.
- `POST /api/admin/web-order-requests/:id/resolve`: resolución comercial autenticada, origen, auditoría y transición condicionada.

Las APIs administrativas reutilizan middleware y `handleAdminRequest`; no se confía en el frontend para autorizar. El formulario no pide consentimiento de WhatsApp para registrar la solicitud. Sólo después del registro ofrece una comunicación opcional con el número autorizado, compartiendo la referencia y no el token de consulta ni los datos de entrega.

La protección contra abuso usa `commerce_request_rate_limits`: HMAC de IP sin almacenar la IP en claro, acceso por IP/ventana y presupuesto global. Los límites iniciales son 20 altas por IP/día, 500 altas globales/día, 40 consultas por IP/15 minutos y 5000 accesos globales/día. La purga es acotada. Estos límites no acreditan por sí solos capacidad ni cuota disponible de toda la cuenta Cloudflare; comprobar consumo real en Preview antes de activar. Son contadores de protección, no stock ni otro ledger comercial.

## Configuración y activación pendiente

Los únicos flags nuevos son:

```text
WEB_ORDERS_ENABLED=false
VITE_WEB_ORDERS_ENABLED=false
```

La ausencia de cada flag equivale a cerrado. No se cambian flags efectivos con este commit. `WEB_ORDERS_ENABLED` permite sólo altas de solicitudes; recuperación, consultas y administración continúan disponibles con altas cerradas. No depende de `COMMERCE_ENABLED` y no lo habilita. `ORDER_TOKEN_SECRET` se reutiliza únicamente en servidor; no rotarlo sin un plan que preserve las capacidades de solicitudes pendientes. Ningún secreto usa prefijo `VITE_`.

El frontend, cuando se habilita este modo, conserva total pendiente, no calcula pesos Dux por nombres y sustituye el alta WhatsApp por una comunicación opcional posterior. Mientras una solicitud permanece asociada al navegador no se inicia desde ese carrito otra operación legacy; esto no reemplaza un coordinador server-side de reservas entre canales, que sigue pendiente.

Antes de activar:

1. Verificar main/CI/deployment exactos y las bases y bindings reales de Preview y producción. No confundir Pages con el Worker homónimo.
2. Obtener y conservar un backup verificable o bookmark Time Travel antes de 0020. Identificar pedidos, intenciones y pagos existentes y la lista real de migraciones.
3. Aplicar el SQL versionado mediante el mecanismo D1 ya configurado, primero en Preview. No editar migraciones anteriores ni correr comandos contra una base deducida por nombre.
4. Comprobar columnas, índices, triggers nuevos y guards Dux anteriores, datos históricos y `PRAGMA foreign_key_check` / `PRAGMA integrity_check` donde estén disponibles.
5. Probar en Preview alta, respuesta perdida, recuperación con altas cerradas, propietario incorrecto, cambio de payload, dos clientes distintos, cuotas, aceptación/rechazo, auditoría y móvil/escritorio. No es necesario ni está autorizado cobrar o mutar Dux para esta comprobación.
6. Repetir backup, migración y verificación en producción antes de habilitar ambos flags separados para este circuito y realizar el smoke en el dominio canónico. No activar Checkout Pro por este resultado.

No se aplicó 0020 a ninguna D1 remota en esta iteración. No se acreditaron configuración efectiva, smoke autenticado, reserva Dux ni compra real.

## Rollback no destructivo

Cerrar ambos flags de altas web. Mantener las rutas de recuperación y consulta, la administración, webhooks financieros y toda la evidencia. No restaurar una base anterior sobre solicitudes o cobros nuevos, no borrar filas de `checkout_intents`, no borrar capabilities del navegador como reparación y no retirar los guards Dux. No volver a un binario que carezca de las consultas necesarias para solicitudes ya registradas: realizar el cierre por configuración y corregir el código hacia adelante.

## Validación

Las pruebas de núcleo ejecutan las funciones reales sobre SQLite. La prueba concurrente usa ocho workers con conexiones independientes al mismo archivo y valida un único alta, cuota y resolución. La migración se prueba también sobre el esquema completo anterior y datos históricos. Las pruebas de handlers cubren origen, flags, campos, recuperación y sesión/auditoría administrativa; las de React comprueban registro, errores, identidad conservada, confirmaciones y ausencia de falsa reserva o pago. Playwright prueba IndexedDB real entre pestañas mediante un módulo interceptado sólo en el test, sin incorporar un endpoint de depuración al producto.

Registrar resultados por SHA. Una transpilación auxiliar no es lint/typecheck ni sustituye la suite bajo Node de `.node-version`. Los proveedores de estas pruebas son simulados o no se invocan; no equivalen a D1 remoto, Dux, Mercado Pago ni a un E2E comercial productivo.
