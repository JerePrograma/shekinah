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
```

Bloqueos:

1. la cuenta muestra Plan ESTÁNDAR; se requiere PRO/FULL y token;
2. `GET /v2/items` no publica unidad/pesabilidad/divisibilidad o paso decimal suficiente;
3. la API pública no documenta cancelación/liberación/finalización/expiración segura de reservas de pedidos.

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

Aplicar y verificar `migrations/0012_dux_authoritative_inventory.sql` primero en preview y luego en production. No se afirma que esté aplicada remotamente.

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

## Gate de activación

No cambiar `DUX_API_ENABLED`, `COMMERCE_ENABLED` o `VITE_COMMERCE_ENABLED` hasta demostrar:

- PRO/FULL y token válidos;
- lectura real sin exponer secretos;
- mapping y cantidades auditados;
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
