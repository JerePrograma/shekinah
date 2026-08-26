# Operación del comercio

## Estado operativo vigente

Dux Software es la autoridad de inventario, pero la integración productiva todavía está bloqueada por configuración y contrato externo. La cuenta aportada muestra Plan ESTÁNDAR; Dux exige PRO/FULL y token para la API. La API pública revisada tampoco documenta cómo liberar, cancelar, finalizar o vencer en forma segura la reserva de un pedido, ni expone en `GET /v2/items` la semántica de unidad necesaria para vender.

Mantener:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
```

Con esta configuración no se crean pedidos Dux, preferencias Mercado Pago ni pedidos WhatsApp nuevos. Tampoco se consulta o modifica Mercado Libre. El catálogo y el carrito se conservan, pero una disponibilidad no confirmable no autoriza una venta.

## Responsabilidades

- Operar el stock físico, unidades, depósitos y sincronización con Mercado Libre en Dux.
- Mantener en Shekinah sólo contenido editorial y precios autorizados.
- No cargar stock manual en Shekinah para productos vinculados a Dux.
- No importar Excel ni usar una planilla como fuente de mapping o stock.
- No deducir gramos, kilos, divisibilidad o pasos de venta desde nombres de productos.
- No corregir cantidades Dux con redondeo, truncamiento, multiplicación o división.

## Lectura y reconciliación Dux

El código read-only usa:

```text
https://erp.duxsoftware.com.ar/WSERP/rest/services
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
Authorization: Bearer <token>
```

La reconciliación obtiene el inventario paginado y escribe un snapshot D1. El cliente serializa las solicitudes con al menos cinco segundos entre inicios; D1 bloquea solapamientos, renueva el lease antes de cada request y aplica un cooldown global entre corridas. No existe un GET por producto y los retries se limitan a lecturas seguras. El máximo operativo es 100 páginas de 50 items; excederlo falla cerrado. Un `429` respeta `Retry-After` cuando está disponible.

El workflow `.github/workflows/dux-reconcile.yml` ejecuta `/api/internal/dux/reconcile` únicamente si la variable de GitHub `DUX_RECONCILIATION_ENABLED` vale `true`. No habilitarla antes de verificar plan, token, IDs, migración y deployment. `DUX_SCHEDULER_SECRET` debe existir con valores coincidentes en Pages production y en el environment GitHub `cloudflare-pages-production`, sin imprimirlos.

## Controles del backoffice

La vista Dux es de diagnóstico y debe mostrar:

- si la API está habilitada;
- estado y hora del último ciclo;
- empresa, sucursal y depósito validados;
- items procesados;
- mappings `mapped`, `unmapped` y `ambiguous`;
- cantidad observada sin redondeo;
- estado de unidad/semántica;
- snapshot fresco, obsoleto o ausente;
- errores sanitizados.

Un producto Dux muestra el inventario como sólo lectura. Si el mapping no es único o la unidad no está verificada, no se habilita la venta ni aparece un control alternativo de stock local. El operador puede conservar o corregir slug, imágenes, descripción, categorías y contenido comercial sin modificar la identidad Dux.

## Diagnóstico D1 de sólo lectura

Después de aplicar `0012` en el entorno correcto, estas consultas ayudan a diagnosticar sin mutar datos:

```sql
SELECT last_sync_status, COUNT(*) AS cantidad
FROM dux_inventory_items
GROUP BY last_sync_status
ORDER BY last_sync_status;
```

```sql
SELECT mapping_status, COUNT(*) AS cantidad
FROM dux_inventory_items
GROUP BY mapping_status
ORDER BY mapping_status;
```

```sql
SELECT cod_item, local_product_id, mapping_status,
       stock_real, stock_reservado, stock_disponible,
       last_synced_at, last_sync_error_code
FROM dux_inventory_items
WHERE mapping_status <> 'mapped'
   OR last_sync_status <> 'ok'
ORDER BY updated_at DESC;
```

```sql
SELECT id, kind, status, processed_count, mapped_count,
       unmapped_count, ambiguous_count, error_code,
       started_at, completed_at
FROM dux_sync_runs
ORDER BY started_at DESC
LIMIT 20;
```

No editar estas tablas para “arreglar” stock. Una corrección de mapping debe seguir el contrato administrativo y nunca reescribir el item Dux ni el producto editorial por coincidencia difusa.

## Checkout Pro

Cuando la integración pueda activarse, el control diario deberá verificar:

1. pedido/reserva Dux confirmado antes de la preferencia;
2. una sola relación entre pedido local, pedido Dux y `external_reference`;
3. webhooks firmados y pagos reconsultados a Mercado Pago;
4. importe, moneda, entorno, collector y metadata exactos;
5. finalización Dux exactamente una vez en `approved`;
6. liberación Dux exactamente una vez en `rejected` o `cancelled`;
7. operaciones inciertas reconciliadas antes de reintentar;
8. ningún acceso a Mercado Libre desde el flujo.

Hoy esos puntos no pueden demostrarse porque Dux no publica el lifecycle de compensación. `DUX_ORDER_LIFECYCLE_UNAVAILABLE` es el comportamiento correcto; no debe “resolverse” relajando el guard ni creando la preferencia primero.

Un pedido presente en `dux_order_links`, o un pedido histórico cuya línea ya corresponda a una identidad/candidata Dux, no se concilia, aprueba, rechaza ni vence localmente. El webhook conserva el evento como fallido/reintentable y la expiración automática lo omite. No forzar estados, insertar líneas ni borrar los triggers de `0012`.

El webhook Mercado Pago continúa disponible para pedidos históricos. Nunca se usa un retorno de navegador como prueba de pago y un reintegro no repone stock automáticamente.

## WhatsApp

El orden futuro es reserva Dux → pedido local → apertura de WhatsApp. Aprobar no descuenta otra vez; rechazar libera por el mecanismo oficial Dux. Mientras ese mecanismo no exista o no se demuestre, el backend bloquea el pedido antes de abrir WhatsApp.

No abrir manualmente el canal desde la aplicación como bypass. Si el comercio acuerda una venta fuera del sistema, debe administrarla enteramente en Dux y no presentarla como pedido reservado por Shekinah.

## Mercado Libre retirado

Shekinah no opera OAuth, sync, webhooks ni reservas Mercado Libre para inventario. No se debe:

- reactivar `.github/workflows/mercadolibre-reconcile.yml`;
- configurar `MERCADO_LIBRE_CATALOG_ENABLED=true`;
- usar el mirror histórico para autorizar Checkout o WhatsApp;
- ejecutar PUT de stock o publicaciones;
- copiar el seller ID `445638367` a un campo de empresa/sucursal/depósito Dux.

Dux continúa siendo responsable de sincronizar la tienda `HERBOLARIOMDP` con Mercado Libre.

## Rate limit e indisponibilidad

- `401`: token inválido o ausente; cerrar y revisar configuración.
- `403`: permisos o plan insuficiente; confirmar PRO/FULL con Dux.
- `429`: respetar la espera indicada; no multiplicar workers ni retries.
- `5xx`: indisponibilidad temporal; snapshot como diagnóstico, venta cerrada.
- timeout de GET: retry acotado.
- timeout de futura mutación: resultado incierto; consultar antes de repetir.
- payload inválido: contrato incompatible; cerrar y conservar error sanitizado.

Un snapshot obsoleto puede ayudar al operador, pero no autoriza una venta.

## Secretos

Rotar ante sospecha de exposición y cargar sólo como secretos cifrados de Pages:

- `DUX_API_TOKEN`;
- `DUX_SCHEDULER_SECRET`;
- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `ORDER_TOKEN_SECRET`;
- secretos administrativos y analíticos ya existentes.

No imprimir valores, colocarlos en Git, usar prefijo `VITE_` ni persistir el token Dux en claro en D1.

## Retención, privacidad e imágenes

La política existente de pedidos, pagos, auditoría y analítica se conserva. No registrar DNI, CUIT, dirección, teléfono o email en logs técnicos. Cuando Dux habilite pedidos, enviar únicamente los campos obligatorios del contrato.

Las imágenes administradas continúan en R2 mediante `CATALOG_IMAGES`; el cambio de autoridad de inventario no altera assets legacy ni contenido editorial. No usar D1, Git o base64 como reemplazo de R2.

## Criterio de apertura

No habilitar comercio hasta completar todos los requisitos de `docs/COMMERCE_DEPLOYMENT.md`, incluidas prueba de reserva, consulta, cancelación/liberación y finalización Dux, sandbox Mercado Pago, webhook, migración, CI y deployment del mismo SHA. Un pago productivo o una reserva real requieren autorización humana puntual.
