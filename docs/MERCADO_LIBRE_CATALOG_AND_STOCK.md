# Mercado Libre: integración histórica retirada

> **Documento histórico.** Desde 2026-08-26 este diseño no es normativo ni debe activarse. Dux Software es la única autoridad de inventario y sincroniza Mercado Libre. Consultar `docs/FULL_STACK_COMMERCE.md` y `docs/COMMERCE_DEPLOYMENT.md` para la arquitectura vigente.

## Estado vigente

Shekinah no debe:

- consultar publicaciones o User Products para decidir stock;
- reservar o liberar stock Mercado Libre;
- modificar cantidades o publicaciones;
- usar webhooks Mercado Libre como fuente de inventario;
- ejecutar reconciliación periódica Mercado Libre;
- usar precio, moneda o estado Mercado Libre para crear Checkout;
- volver a habilitar OAuth con fines de inventario.

La autoridad queda separada así:

- Dux: stock, identidad externa, depósito, unidad/medida, pedidos/reservas y sincronización Mercado Libre;
- Shekinah: catálogo editorial, carrito, orden local y coordinación;
- Mercado Pago: Checkout Pro y estado financiero;
- Mercado Libre: canal sincronizado por Dux, fuera de Shekinah.

Los flags deben permanecer:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

## Motivo del retiro

Mantener simultáneamente una reserva Dux y una mutación Mercado Libre desde Shekinah crearía dos autoridades y carreras intercanal. El cliente ya usa la integración Dux ↔ Mercado Libre para la cuenta `HERBOLARIOMDP`, seller ID `445638367`. Shekinah debe leer el resultado autoritativo desde Dux.

El seller ID y el ID de usuario Dux `3851` son datos de sistemas distintos. Ninguno se reutiliza como `id_empresa`, `id_sucursal`, `id_deposito` o `id_personal`.

## Código y datos históricos

La implementación anterior incluía:

- OAuth Authorization Code y tokens rotativos cifrados;
- mirror de publicaciones, variaciones y User Products;
- mapping por SKU;
- webhooks de items, stock y órdenes;
- reservas versionadas mediante `x-version`;
- ledger de compensación;
- scheduler de reconciliación.

Se conserva código y esquema cuando borrarlos no es necesario para el cierre seguro. La migración `migrations/0009_mercadolibre_catalog_and_inventory.sql` sigue siendo parte de la historia del esquema y no debe modificarse ni eliminarse. Sus tablas no autorizan stock ni venta.

Los endpoints históricos administrativos, OAuth, webhook e internos quedan funcionalmente retirados. No deben hacer solicitudes externas ni cambiar inventario. El workflow `.github/workflows/mercadolibre-reconcile.yml` ya no forma parte de la automatización autorizada.

## Prohibiciones operativas

- no volver a activar flags para “usar mientras Dux no responde”;
- no usar el mirror D1 como fallback;
- no ejecutar PUT compensatorios;
- no restaurar el scheduler anterior;
- no copiar stock Mercado Libre a Dux o al catálogo local;
- no borrar notificaciones, conexiones o ledgers históricos sin backup y autorización;
- no interpretar una venta Mercado Libre como evento financiero de Mercado Pago Checkout Pro.

## Incidentes históricos pendientes

Si existen filas anteriores `pending`, `uncertain` o `compensation_pending`:

1. mantener comercio cerrado;
2. preservar evidencia;
3. consultar estado real en Mercado Libre y Dux por canales autorizados;
4. no reintentar una mutación a ciegas;
5. resolver manualmente con trazabilidad;
6. confirmar el stock final en Dux, que vuelve a ser la autoridad;
7. documentar el cierre antes de considerar una limpieza de tablas o secretos.

El retiro de la integración no justifica eliminar datos que podrían explicar una divergencia anterior.

## Configuración legacy

Las siguientes variables y secretos pertenecen al diseño retirado y no son requisito para la arquitectura Dux:

```text
MERCADO_LIBRE_CLIENT_ID
MERCADO_LIBRE_APPLICATION_ID
MERCADO_LIBRE_EXPECTED_SELLER_ID
MERCADO_LIBRE_CLIENT_SECRET
MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY
MERCADO_LIBRE_SCHEDULER_SECRET
```

No es necesario borrarlos de inmediato si existen operaciones históricas que auditar. Cualquier remoción futura requiere inventario previo, backup y comprobación de que ninguna ruta activa depende de ellos. Nunca mostrar sus valores.

## Arquitectura sustituta

La integración vigente usa sólo la API oficial Dux v2, server-side, con Bearer:

```text
https://erp.duxsoftware.com.ar/WSERP/rest/services
GET /v2/empresas
GET /v2/sucursales
GET /v2/depositos
GET /v2/items
```

El snapshot D1 permite navegación y diagnóstico, pero Dux sigue siendo autoridad. Checkout Pro y WhatsApp permanecen bloqueados hasta demostrar unidad/divisibilidad y el ciclo completo de reserva, liberación y finalización Dux.

No usar Excel ni nombres de producto para llenar lo que la API no expone.
