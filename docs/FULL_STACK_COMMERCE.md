# Comercio full-stack

## Estado y alcance

Este documento describe el código preparado en el repositorio. No certifica por sí solo que D1, Mercado Pago, Cloudflare Access, Pages o el número de WhatsApp estén configurados en producción.

La solución conserva el catálogo versionado como fuente comercial canónica. El frontend envía únicamente identificadores y cantidades; `server/catalog.ts` vuelve a localizar los productos, valida disponibilidad y recalcula el importe en centavos ARS. Ningún precio o total recibido desde el navegador se utiliza para cobrar.

## Componentes

### Frontend

- `src/cart/`: dominio puro, persistencia defensiva en `localStorage`, reconciliación con el catálogo y sincronización por evento `storage`.
- `src/pages/CartPage.tsx`: edición de cantidades, eliminación, vaciado, total, Checkout Pro y WhatsApp.
- `src/pages/PaymentReturnPage.tsx`: los retornos del proveedor sólo consultan el estado persistido; no interpretan `status`, `collection_status` ni otros parámetros del navegador como aprobación.
- `src/analytics/`: consentimiento explícito, sesión aleatoria revocable y eventos first-party mínimos.
- `src/pages/AdminPage.tsx`: interfaz no enlazada desde la navegación pública.

El número de WhatsApp se lee de `VITE_WHATSAPP_NUMBER`. Es una configuración pública de build, no un secreto. Si no existe o no cumple el formato internacional de 8 a 15 dígitos, el CTA permanece deshabilitado.

### Cloudflare Pages Functions

| Ruta | Método | Protección |
| --- | --- | --- |
| `/api/checkout/preferences` | POST | mismo origen, flag de comercio, D1 y secretos |
| `/api/webhooks/mercadopago` | POST | firma HMAC de Mercado Pago, D1 e idempotencia |
| `/api/orders/:publicToken/status` | GET | token de capacidad no reversible |
| `/api/analytics/events` | POST | mismo origen y analítica habilitada |
| `/api/privacy/delete-session` | POST | mismo origen y hash de sesión |
| `/admin` | GET | JWT de Cloudflare Access validado en Function |
| `/api/admin/*` | GET | middleware con JWT de Access y auditoría |

El checkout se puede desactivar sin interrumpir webhooks de pagos iniciados previamente: `COMMERCE_ENABLED=false` bloquea únicamente la creación de nuevas preferencias. El webhook continúa operando mientras existan el binding D1 y las credenciales requeridas.

### D1

La migración `migrations/0001_commerce.sql` crea:

- `orders`: pedido, total recalculado, estado y preferencia;
- `order_items`: fotografía inmutable de producto, SKU, cantidad y precio al iniciar el pedido;
- `payments`: estado verificado consultando la API de Mercado Pago;
- `payment_events`: recepción, reclamos de procesamiento, reintentos e idempotencia de webhooks;
- `analytics_revocations`, `analytics_sessions` y `analytics_events`: bloqueo de sesiones retiradas, sesión hasheada y eventos consentidos;
- `admin_audit`: actor de Access, acción, resultado y metadatos limitados.

No se almacenan números de tarjeta, documentos, direcciones, teléfonos, correos de compradores ni el identificador de sesión analítica en claro.

## Flujo de pago

1. El navegador genera una UUID de idempotencia, la reutiliza durante 30 minutos para el mismo carrito y la sincroniza mediante `localStorage`; luego envía únicamente productos y cantidades.
2. La Function valida origen, flags, bindings y secretos.
3. El servidor recalcula el carrito desde `catalog/internal/catalog-index.json`.
4. D1 registra cabecera e ítems en un único `batch` y reclama atómicamente un solo intento de creación de preferencia.
5. Se crea la preferencia de Checkout Pro por API con `external_reference` igual al ID interno. Ante un resultado de red incierto, no se repite la creación: se busca y recupera la preferencia por `external_reference`.
6. El navegador recibe una URL HTTPS autorizada de Mercado Pago y redirige fuera del sitio.
7. Los retornos `/pago/*` consultan D1 mediante un token público derivado con HMAC.
8. El webhook verifica `x-signature`, registra el evento de forma idempotente y consulta el pago directamente a Mercado Pago.
9. El pedido sólo cambia a `approved` cuando moneda e importe coinciden exactamente con el pedido registrado.

## Estados de pedido

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

## Modelo de amenazas cubierto

- manipulación de precio o total en DevTools;
- repetición de POST de checkout;
- webhooks duplicados o concurrentes;
- firmas de webhook ausentes o adulteradas e identificadores no incluidos en la firma;
- aprobación simulada modificando la URL de retorno;
- exposición accidental de secretos o source maps;
- acceso directo a APIs administrativas sin JWT válido;
- fórmulas maliciosas al abrir exportaciones CSV;
- eventos analíticos antes del consentimiento o posteriores a la revocación de esa sesión.

## Límites deliberados

- No se inventa un número de WhatsApp.
- No se recopilan datos de envío o facturación del comprador.
- No hay edición administrativa de pedidos ni reembolsos desde el backoffice.
- El retiro de consentimiento elimina los eventos de la sesión y conserva únicamente su HMAC en una lista de revocación para impedir que solicitudes en vuelo la vuelvan a crear.
- No existe borrado automático por retención: la política y el plazo deben aprobarse antes de habilitar analítica productiva.
- La protección de borde, rate limiting, alertas y políticas de Access se configuran fuera del repositorio.
