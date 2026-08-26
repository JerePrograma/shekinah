# Cierre productivo de Checkout Pro y stock local

## Decisión operativa

Shekinah es la fuente de verdad del catálogo, los precios y el inventario. Mercado Pago se usa
exclusivamente para crear la preferencia de Checkout Pro, cobrar, notificar estados y verificar el
resultado financiero. La pantalla **Tus productos** de Mercado Pago no participa del stock.

La integración productiva autorizada corresponde a:

```text
Aplicación: Shekinah
Application ID: 7373984348988262
```

El Access Token y el secreto de Webhooks permanecen únicamente como secretos cifrados de
Cloudflare Pages. El repositorio no contiene ni debe contener sus valores.

La integración opcional con Mercado Libre queda deshabilitada para este modelo operativo:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

## Regla de inventario

Un producto sin `stockQuantity` sigue visible y editable en el backoffice, pero no es vendible por
Checkout Pro ni por WhatsApp. El administrador debe cargar un entero real antes de habilitarlo:

- `stockQuantity` ausente: inventario todavía no configurado;
- `stockQuantity = 0`: agotado;
- `stockQuantity > 0`: stock físico administrado por Shekinah;
- `availableQuantity = stockQuantity - reservedQuantity`: disponibilidad pública.

Ningún flujo interpreta la ausencia de stock como cantidad ilimitada.

## Ciclo de reserva

Checkout Pro reserva de forma atómica al crear el pedido. La reserva dura 30 minutos mientras no
exista evidencia de pago pendiente. Un pago pendiente verificado conserva la reserva aunque venza
esa ventana. `approved` consume el stock exactamente una vez. `rejected` y `cancelled` acortan la
ventana al instante; `failed` recuperable conserva la reserva para permitir la recuperación segura
de la preferencia y la libera por vencimiento si el intento se abandona.

WhatsApp usa el mismo inventario: crea una reserva pendiente por 24 horas, la aprobación
administrativa consume una sola vez y el rechazo libera sin modificar el stock físico.

La migración `0010_checkout_terminal_reservation_release.sql` corrige pedidos terminales históricos
y materializa la liberación inmediata para futuras transiciones.

## Activación externa obligatoria

Aplicar primero las migraciones pendientes en preview y luego en producción. Antes de abrir ventas,
cargar stock real para los productos que se ofrecerán y comprobar que no existan reservas
inconsistentes.

En Cloudflare Pages **production**, verificar por nombre y entorno, sin leer ni registrar valores:

```text
DB
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
ORDER_TOKEN_SECRET
PUBLIC_SITE_URL=https://shekinah.ar
ALLOWED_SITE_ORIGINS=https://shekinah.ar
MERCADO_PAGO_CHECKOUT_MODE=production
COMMERCE_ENABLED=true
VITE_COMMERCE_ENABLED=true
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

`VITE_COMMERCE_ENABLED` es build-time: requiere un deployment nuevo. `COMMERCE_ENABLED` es
runtime server-side. Ambos deben coincidir. En modo `production`, el backend rechaza cualquier
Access Token cuyo identificador embebido no corresponda a la aplicación Shekinah
`7373984348988262`. El panel de Mercado Pago sigue siendo la autoridad para confirmar que la
credencial está activa y pertenece a la cuenta autorizada.

No ejecutar un cobro real como smoke automático. El cierre productivo se valida con build, pruebas,
migraciones, configuración por nombre, endpoint de Webhook y una prueba financiera manual
expresamente autorizada.
