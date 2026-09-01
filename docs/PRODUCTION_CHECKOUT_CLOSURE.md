# Cierre productivo de Checkout Pro con inventario Dux

## Decisión operativa

Dux Software es la única autoridad del inventario físico, identidad externa, depósito, unidad/medida y pedidos o reservas. Shekinah conserva el catálogo editorial, carrito, orden local y coordinación. Mercado Pago procesa y verifica Checkout Pro. Dux sincroniza Mercado Libre sin que Shekinah intervenga.

La integración Mercado Pago autorizada es:

```text
Aplicación: Shekinah
Application ID: 7373984348988262
```

El token Dux, Access Token Mercado Pago y secretos de webhook permanecen exclusivamente como secretos cifrados de Cloudflare Pages.

## Estado actual: bloqueo seguro

La salida no está activa:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
```

Bloqueos:

1. la lectura Dux desde Pages Functions falla antes de recibir un status HTTP, aunque la misma credencial y los endpoints oficiales respondieron directamente desde el host de operación;
2. el mapping corregido en `39ab007` todavía no pudo auditarse contra un snapshot real; el catálogo local no posee un campo de barcode independiente y compara el barcode Dux con SKU/variant SKU canónicos;
3. `GET /v2/items` no publica unidad/pesabilidad/divisibilidad o paso decimal suficiente;
4. la API pública no documenta cancelación/liberación/finalización/expiración segura de reservas de pedidos.

No se confirmó el nombre exacto del plan Dux y no debe inferirse. El acceso directo efectivo, el token configurado y los IDs descubiertos no resuelven los cuatro bloqueos anteriores.

Por diseño, Checkout responde antes de crear una preferencia. WhatsApp se bloquea antes de abrir el canal. No se crean pedidos Dux reales ni se usa stock local o Mercado Libre como fallback.

## Regla de inventario

El snapshot D1 es sólo la última observación. No se transforma en stock físico ni se combina con `stockQuantity` local. Un producto Dux:

- mapeado y con semántica verificada: podrá ser vendible según las reglas Dux;
- stock cero o negativo: agotado;
- no mapeado o ambiguo: preservado, no vendible;
- semántica de unidad no verificada: no vendible;
- snapshot obsoleto o Dux caído: no vendible temporalmente.

No se redondean decimales, no se infieren gramos/kilos desde el nombre y no se importa Excel.

## Ciclo obligatorio antes de activar

1. backend valida producto, mapping y cantidad solicitada;
2. Dux reserva el carrito completo mediante pedido;
3. Shekinah persiste pedido local ↔ pedido Dux;
4. Mercado Pago crea o recupera una única preferencia;
5. webhook firmado verifica el pago por API;
6. `approved` finaliza Dux exactamente una vez;
7. `rejected`/`cancelled` libera Dux exactamente una vez;
8. abandono o vencimiento también libera por un mecanismo oficial;
9. un timeout mutante se consulta antes de cualquier retry.

No se implementa el paso 2 hasta disponer de los pasos 6 a 9. Crear una reserva sin poder liberarla no es una degradación aceptable.

## Migración y configuración

`migrations/0012_dux_authoritative_inventory.sql`, junto con `0010`, `0011` y `0013_remove_local_catalog_stock.sql`, quedó aplicada y verificada primero en preview y luego en production el 2026-09-01. `0013` saneó seis documentos productivos, dejó en cero los contadores locales y exige snapshot Dux exacto en toda línea comercial nueva. Los guards permanecen activos y no deben retirarse.

Configurar por nombre y entorno:

```text
DB
DUX_API_TOKEN
DUX_SCHEDULER_SECRET
DUX_COMPANY_ID
DUX_BRANCH_ID
DUX_DEPOSIT_ID
DUX_SNAPSHOT_MAX_AGE_SECONDS
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
ORDER_TOKEN_SECRET
PUBLIC_SITE_URL=https://shekinah.ar
ALLOWED_SITE_ORIGINS=https://shekinah.ar
MERCADO_PAGO_CHECKOUT_MODE=production
```

Los IDs Dux deben provenir de `GET /v2/empresas`, `GET /v2/sucursales` y `GET /v2/depositos`; no del seller Mercado Libre o de una pantalla del ERP.

Los valores verificados son empresa `12862`, sucursal `1` y depósito `25566`; `GET /v2/items` informó `743` items en la lectura directa. Los secretos y variables server-side quedaron configurados sin revelar valores. El estado final conserva `DUX_API_ENABLED=false`.

## Gate de activación

No cambiar `DUX_API_ENABLED`, `COMMERCE_ENABLED`, `VITE_COMMERCE_ENABLED` o el scheduler hasta demostrar:

- acceso API autorizado y token válido, sin inferir el plan;
- lectura real sin exponer secretos;
- lectura completa desde Pages Functions y snapshot auditado;
- mapping corregido y auditado contra un snapshot real, con cantidades revisadas;
- unidad/divisibilidad oficiales;
- reserva, consulta, cancelación/liberación y finalización Dux;
- idempotencia y timeout incierto;
- compensación cuando Mercado Pago falla;
- WhatsApp aprobado/rechazado/vencido;
- sandbox Mercado Pago y webhook;
- migración, CI y deployment del mismo SHA;
- smoke público no destructivo.

`VITE_COMMERCE_ENABLED` es build-time; requiere deployment nuevo. `COMMERCE_ENABLED` y `DUX_API_ENABLED` son runtime server-side. Los tres deben representar el mismo estado autorizado.

No ejecutar un cobro real ni reservar stock productivo como smoke automático. La prueba financiera final requiere autorización expresa.

## Evidencia del cierre seguro del 2026-09-01

- se intentaron tres sync manuales de producción; todos terminaron `DUX_UNAVAILABLE` con cero procesados, mapeados, no mapeados y ambiguos;
- D1 conserva los tres ciclos fallidos y cero filas de tenant, inventario/snapshot y vínculos de pedidos;
- el diagnóstico de `f138820` registró exclusivamente `fetch_exception` en `/v2/empresas`, `providerStatus=null`, `attempts=3`, sin token, query, cuerpo, mensaje de error ni PII;
- CI `#416` concluyó correctamente;
- Pages publicó el deployment productivo canónico `8781412e-629b-4473-8081-89c6fbc1ffec` sobre `f138820`, con `fail_open=false` y bindings intactos;
- el builder omitió auto-install y ejecutó npm `11.6.0`; el build terminó correctamente;
- `DUX_API_ENABLED`, comercio, Mercado Libre y scheduler quedaron apagados.

Después de esa fase, `39ab007` retiró el runtime de stock local, bloqueó su reintroducción y corrigió el orden del mapping; `0013` quedó aplicada en ambas D1 remotas. La validación local aprobó 329 pruebas, mantuvo 14 omisiones históricas y aprobó 25 de 25 pruebas de navegador. Este avance no reemplaza el snapshot Dux inexistente ni habilita el comercio.

El evento seguro permite separar un `5xx` real de una excepción de transporte. `providerStatus=null` exige investigar conectividad/DNS/TLS entre Cloudflare y Dux; no autoriza a aumentar retries, habilitar el scheduler ni usar otra fuente de stock.
