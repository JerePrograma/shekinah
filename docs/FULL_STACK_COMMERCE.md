# Comercio full-stack

## Estado y alcance

Este documento describe el código preparado en el repositorio. No certifica por sí solo que D1, Mercado Pago Checkout Pro, Cloudflare Access, Pages o el webhook estén configurados en producción.

La solución conserva el catálogo versionado como base comercial canónica y persiste únicamente altas, overrides y tombstones en D1. En el Checkout Pro integrado el frontend envía únicamente identificadores y cantidades; `server/dynamic-cart.ts` vuelve a localizar los productos en el catálogo efectivo, valida disponibilidad y recalcula el importe en centavos ARS. Ningún precio o total recibido desde el navegador se utiliza como autoridad para crear una preferencia.

El candidato de inventario extiende el producto con `stockQuantity` opcional. Su ausencia conserva el modelo legacy sin control de existencias; con control, el valor debe ser entero entre 0 y 1.000.000. La disponibilidad efectiva equivale a disponibilidad manual activa y, además, stock no controlado o mayor que cero. El cliente restringe cantidades a `min(99, stock)` y el servidor rechaza cantidades superiores al stock vigente al recalcular el carrito. Esto es control administrativo y restricción de compra, no reserva ni decremento transaccional de unidades.

Desde el 2026-08-10 existe además un fallback manual explícitamente autorizado para operar mientras Checkout Pro permanezca cerrado: el carrito copia el total visible y abre un Link de Pago de Mercado Pago configurado sin monto; el comprador ingresa ese importe y envía el detalle del carrito por WhatsApp. Ese fallback no crea un pedido, no usa D1 y no representa una confirmación autoritativa de pago.

## Componentes

### Frontend

- `src/cart/`: dominio puro, persistencia defensiva en `localStorage`, reconciliación con el catálogo y sincronización por evento `storage`.
- `src/pages/CartPage.tsx`: edición de cantidades, eliminación, vaciado, total, Checkout Pro integrado, fallback manual de Link de Pago y WhatsApp.
- `src/pages/PaymentReturnPage.tsx`: los retornos del proveedor sólo consultan el estado persistido del Checkout Pro integrado; no interpretan `status`, `collection_status` ni otros parámetros del navegador como aprobación.
- `src/analytics/`: consentimiento explícito, sesión aleatoria revocable y eventos first-party mínimos.
- `src/admin/AdminBackoffice.tsx`: gate de sesión, login y logout; monta `ProductManager` y `AdminPage` únicamente después de autenticación server-side.
- `src/admin/ProductManager.tsx`: listado visual, búsqueda, filtros, resumen de estados, editor de producto, acciones rápidas de inventario/disponibilidad e imágenes con preview.

Los datos públicos autorizados actuales son:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

`src/commerce/env.ts` usa esos valores como defaults rastreados porque fueron autorizados expresamente. Una variable de build presente puede sobrescribirlos o deshabilitarlos con una cadena vacía. El número se normaliza a formato internacional de 8 a 15 dígitos y el Link de Pago sólo se acepta como HTTPS del host `link.mercadopago.com.ar`, sin credenciales, puerto, query ni fragmento. Son datos públicos, no secretos.

El custom domain del apex está activo y responde HTTPS 200; production usa el apex y preview conserva el dominio técnico de Pages. La redirección HTTPS de `www` al apex responde `301`, preserva path/query y termina en 200; el pack Universal cubre el apex y wildcard y negocia TLS 1.3.

### Cloudflare Pages Functions

| Ruta | Método | Protección |
| --- | --- | --- |
| `/api/checkout/preferences` | POST | mismo origen, flag de comercio, D1 y secretos |
| `/api/webhooks/mercadopago` | POST | firma HMAC de Mercado Pago, D1 e idempotencia |
| `/api/orders/:publicToken/status` | GET | token de capacidad no reversible |
| `/api/analytics/events` | POST | mismo origen y analítica habilitada |
| `/api/privacy/delete-session` | POST | mismo origen y hash de sesión |
| `/admin` | GET/HEAD | SPA de login; el HTML no concede autorización |
| `/api/admin/auth/login` | POST | mismo origen, body acotado, PBKDF2 y rate limiting D1 |
| `/api/admin/auth/session` | GET/HEAD | sesión propia firmada o fallback Access opcional |
| `/api/admin/auth/logout` | POST | mismo origen y eliminación inmediata de cookie |
| `/api/admin/*` restante | según contrato | middleware con identidad unificada y auditoría |

El checkout integrado se puede desactivar sin interrumpir webhooks de pagos iniciados previamente: `COMMERCE_ENABLED=false` bloquea únicamente la creación de nuevas preferencias. El webhook continúa operando mientras existan el binding D1 y las credenciales requeridas.

La arquitectura no necesita VPS. Las capacidades de backend previstas se ejecutan en Pages Functions y la persistencia utiliza D1.

### D1

La migración `migrations/0001_commerce.sql` crea:

- `orders`: pedido, total recalculado, estado y preferencia;
- `order_items`: fotografía inmutable de producto, SKU, cantidad y precio al iniciar el pedido;
- `payments`: estado verificado consultando la API de Mercado Pago;
- `payment_events`: recepción, reclamos de procesamiento, reintentos e idempotencia de webhooks;
- `analytics_revocations`, `analytics_sessions` y `analytics_events`: bloqueo de sesiones retiradas, sesión hasheada y eventos consentidos;
- `admin_audit`: actor administrativo normalizado, acción, resultado y metadatos limitados.

La migración aditiva `migrations/0002_fulfillment_and_retention.sql` agrega `checkout_intents`, `order_fulfillment` y `analytics_maintenance`; `migrations/0003_checkout_intent_cart_fingerprint.sql` vincula cada intención con la huella autoritativa del carrito y backfillea pedidos existentes. El fulfillment conserva en D1 los datos de entrega necesarios para operar el pedido; no se guardan en `localStorage`, analítica ni logs. No se almacenan números de tarjeta, documentos, correos de compradores ni el identificador de sesión analítica en claro.

`migrations/0004_catalog_admin.sql` agrega `catalog_product_mutations`. Cada fila contiene un producto validado o un tombstone, el actor administrativo y timestamps; no duplica masivamente los 510 productos canónicos.

`migrations/0005_admin_auth.sql` agrega `admin_login_rate_limits`. Las claves son HMAC de scopes de IP y usuario con un secreto exclusivo; no se persisten IP ni usuario en claro. Las ventanas se actualizan mediante upsert atómico y los registros vencidos se purgan durante nuevos intentos.

Stock y referencias de imágenes administradas reutilizan el JSON validado de `catalog_product_mutations`; el candidato no modifica las migraciones aplicadas `0001` a `0005` ni rellena cantidades ficticias para el catálogo base.

## Imágenes de catálogo administradas

Los 484 binarios legacy permanecen versionados e inmutables. El upload administrativo usa R2 mediante el binding `CATALOG_IMAGES` y publica cada objeto por una ruta first-party `/api/catalog-images/<uuid>.<ext>`; no se persisten base64, data URLs ni nombres recibidos del navegador.

El servidor acepta únicamente JPEG, PNG y WebP de hasta 4 MiB, comprueba MIME y magic bytes y genera la key. En reemplazo persiste primero la nueva referencia del producto; sólo entonces intenta eliminar la anterior cuando es un objeto administrado y no está compartido. Si la persistencia D1 falla después del upload, intenta retirar exclusivamente el objeto nuevo. Quitar una imagen nunca elimina un asset legacy. La baja lógica de un producto persiste primero el tombstone e intenta limpiar después únicamente sus objetos R2 administrados que ya no estén compartidos. Ese cleanup es best-effort: un fallo externo de `R2.delete` puede dejar un objeto huérfano que debe auditarse y reintentarse de forma segura.

Producción reutiliza el bucket existente `shekinah` y preview usa el bucket aislado `shekinah-preview`, ambos bajo el binding `CATALOG_IMAGES` de Pages. R2 está activo; los buckets conservan clase Standard/default y `publicR2DevEnabled=false`, de modo que la lectura pública sólo se expone por la ruta first-party. La infraestructura está verificada, pero no se debe afirmar upload productivo a partir del selector, el binding o una preview local: faltan commit, CI, deployment del SHA definitivo y smoke autenticado.

## Fallback manual temporal autorizado

El fallback sólo aparece cuando `VITE_COMMERCE_ENABLED` no vale `true`, existe un Link de Pago autorizado y el total de envío es determinístico.

1. El carrito conserva su cálculo local de productos y envío para presentar un total de referencia.
2. Antes de abrir el Link de Pago se validan los campos de entrega para evitar un cobro sin datos suficientes para coordinar el pedido.
3. El sitio intenta copiar el total, sin separadores de miles, al portapapeles y abre `https://link.mercadopago.com.ar/shekinahmoreno` en otra pestaña.
4. El comprador ingresa ese monto en Mercado Pago. El sitio no añade parámetros no documentados al enlace ni afirma que el importe haya sido precargado.
5. El comprador envía el carrito mediante WhatsApp al número autorizado para que el comercio pueda asociar manualmente carrito, pago y entrega.
6. Si el peso de Correo es desconocido o supera 5 kg, el Link de Pago queda bloqueado hasta obtener una cotización por WhatsApp.

Este flujo no debe confundirse con Checkout Pro: no genera `external_reference`, no crea una preferencia, no registra pedido o fulfillment en D1 y no puede considerar un pago aprobado por sí mismo. La verificación y asociación del cobro son operativas/manuales hasta activar la integración completa.

## Flujo de pago de Checkout Pro integrado

1. El navegador genera una UUID de idempotencia, la reutiliza durante 30 minutos para el mismo carrito y fulfillment normalizado y la sincroniza mediante `localStorage` sin guardar PII; luego envía productos, cantidades y datos de entrega.
2. La Function valida origen, flags, bindings y secretos.
3. El servidor recalcula el carrito desde el catálogo efectivo canónico más D1.
4. D1 registra cabecera e ítems en un único `batch` y reclama atómicamente un solo intento de creación de preferencia.
5. Se crea la preferencia de Checkout Pro por API con `external_reference` igual al ID interno. Ante un resultado de red incierto, no se repite la creación: se busca y recupera la preferencia por `external_reference`.
6. El navegador recibe una URL HTTPS autorizada de Mercado Pago y redirige fuera del sitio.
7. Los retornos `/pago/*` consultan D1 mediante un token público derivado con HMAC.
8. El webhook verifica `x-signature`, registra el evento de forma idempotente y consulta el pago directamente a Mercado Pago.
9. El pedido sólo cambia a `approved` cuando moneda e importe coinciden exactamente con el pedido registrado.

## Estados de pedido

Los siguientes estados corresponden exclusivamente al Checkout Pro integrado:

- `preference_pending`: pedido registrado, preferencia aún no creada;
- `pending`: preferencia creada o pago sin estado final;
- `approved`: pago confirmado por API tras webhook válido;
- `rejected`, `cancelled`, `refunded`: estados confirmados por proveedor;
- `failed`: no se pudo crear la preferencia; puede reintentarse con la misma clave y carrito.

Una notificación tardía no degrada un pedido ya aprobado a pendiente, rechazado o cancelado. Un reintegro puede llevarlo a `refunded`, estado que tampoco se degrada por notificaciones posteriores.

## Analítica y privacidad

No se dispara ninguna solicitud analítica antes de aceptar el consentimiento. Los eventos permitidos son una lista cerrada y contienen sólo:

- UUID de evento;
- sesión aleatoria, transformada a HMAC en servidor;
- nombre de evento;
- ruta sin query ni fragmento;
- producto opcional;
- fuente y clase de dispositivo en categorías gruesas;
- fecha del servidor.

No se envían IP, user agent, email, nombre ni identificadores de terceros desde la aplicación. Los registros técnicos propios de Cloudflare quedan sujetos a la configuración y política de esa plataforma.

El fallback manual no envía productos ni datos de entrega a Mercado Pago desde Shekinah. El contenido del carrito y, si están completos, los datos de entrega se incluyen únicamente cuando el comprador decide abrir el mensaje de WhatsApp.

## Modelo de amenazas cubierto por Checkout Pro

- manipulación de precio o total en DevTools;
- repetición de POST de checkout;
- webhooks duplicados o concurrentes;
- firmas de webhook ausentes o adulteradas e identificadores no incluidos en la firma;
- aprobación simulada modificando la URL de retorno;
- exposición accidental de secretos o source maps;
- acceso directo a APIs administrativas sin sesión propia o JWT Access válido;
- fórmulas maliciosas al abrir exportaciones CSV;
- eventos analíticos antes del consentimiento o posteriores a la revocación de esa sesión.

El fallback manual no hereda las garantías de precio autoritativo, idempotencia ni conciliación automática del Checkout Pro. Esa limitación es deliberada y visible en la interfaz.

## Límites deliberados

- El WhatsApp `5492236216559`, el dominio canónico `shekinah.ar` y el Link de Pago `shekinahmoreno` son datos actuales autorizados explícitamente el 2026-08-10; no proceden de la recuperación histórica del catálogo. `shekinah-7dl.pages.dev` permanece como dominio técnico de Pages y origen de preview.
- Se recopilan sólo los datos de entrega requeridos para fulfillment; no se solicitan datos de tarjeta ni facturación.
- No hay edición administrativa de pedidos ni reembolsos desde el backoffice.
- El retiro de consentimiento elimina los eventos de la sesión y conserva únicamente su HMAC en una lista de revocación para impedir que solicitudes en vuelo la vuelvan a crear.
- La purga analítica se reclama como máximo una vez por mes y elimina datos anteriores al plazo configurado; producción requiere la política autorizada de 730 días y `ANALYTICS_RETENTION_DAYS=730`.
- El rate limiting mínimo del login es persistente en D1. WAF, alertas y políticas de Access pueden sumar defensa de borde cuando exista un dominio/zona compatible, sin interceptar el login propio.
- El fallback manual debe retirarse o reevaluarse cuando Checkout Pro se active en producción, para no ofrecer dos flujos con garantías distintas sin una decisión comercial explícita.
- El stock no constituye una reserva; si se requiere decremento por pago, debe diseñarse una transición atómica ligada al pedido y al webhook, fuera del alcance del candidato actual.
- La persistencia de imágenes requiere R2 habilitado y el binding correcto en el deployment exacto; sin él, la API debe fallar cerrada y conservar la imagen anterior.
