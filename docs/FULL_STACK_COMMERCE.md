# Comercio full-stack

## Estado y alcance

Este documento describe la arquitectura preparada en el repositorio. Las verificaciones externas se informan por fecha y no habilitan por sí solas el comercio.

La decisión vigente es:

```text
Dux -> inventario, unidades, depósitos y pedidos/reservas
Shekinah -> catálogo editorial, carrito, orden local y coordinación
Mercado Pago -> preferencia, pago y webhook
Dux -> sincronización de Mercado Libre
```

Shekinah no está entre Dux y Mercado Libre. La integración directa Mercado Libre quedó retirada del camino activo; su código y tablas históricas se conservan únicamente para compatibilidad y auditoría.

El 2026-09-01 la API Dux v2 respondió directamente con la credencial autorizada y permitió descubrir empresa `12862`, sucursal `1`, depósito `25566` y `743` items. El nombre exacto del plan no fue confirmado y no debe inferirse. `GET /v2/items` sigue sin publicar unidad/pesabilidad/divisibilidad y la API pública de pedidos no documenta cancelación, liberación, finalización o expiración segura de una reserva. Tres lecturas Pages históricas fallaron; la causa se aisló en `redirect: 'error'` y el candidato adopta el modo manual seguro, aún pendiente de cutover. El comercio permanece fail-closed hasta demostrar el transporte productivo y ambos contratos comerciales.

## Reglas de autoridad

### Dux Software

Dux es la única fuente de verdad para:

- código e identidad externa del item de inventario;
- stock real, reservado y disponible;
- empresa, sucursal y depósito;
- unidad, pesabilidad, divisibilidad y granularidad comercial cuando la API las exponga;
- pedido o reserva que afecte inventario;
- sincronización propia con Mercado Libre.

Un snapshot D1 no cambia esa autoridad. No se redondea, trunca, escala ni convierte una cantidad Dux. No se deduce una unidad desde el nombre, la presentación editorial, el SKU o el código de barras.

### Shekinah

Shekinah sigue gobernando:

- slug y URL pública;
- imágenes y descripción comercial;
- categorías, SEO y textos;
- precios, mientras no exista una decisión comercial explícita diferente;
- carrito, fulfillment, orden local e idempotencia;
- coordinación entre Dux y Mercado Pago.

El navegador envía identificadores, cantidades solicitadas, fulfillment y clave idempotente. Nunca es autoridad de precio, stock, unidad, moneda, envío o total.

### Mercado Pago

Mercado Pago se limita a Checkout Pro. La orden local precede a la preferencia; el webhook firmado y una consulta autoritativa a la API determinan el estado financiero. Un retorno del navegador no prueba pago. Un reembolso tampoco prueba devolución física y no repone inventario automáticamente.

### Mercado Libre

Dux sincroniza Mercado Libre. Shekinah no consulta publicaciones para decidir stock, no reserva allí, no modifica cantidades y no ejecuta un scheduler Mercado Libre. Los endpoints históricos directos quedan retirados.

## Componentes

### Frontend

- `src/cart/`: carrito persistido defensivamente y sincronizado entre pestañas;
- `src/pages/CartPage.tsx`: edición de líneas, fulfillment, Checkout Pro y WhatsApp;
- `src/data/runtime-catalog.ts`: lectura de catálogo por API first-party;
- `src/catalog/model.ts`: contrato de proyección externa y estados de mapping;
- `src/admin/DuxPanel.tsx`: estado read-only del inventario Dux;
- `src/pages/PaymentReturnPage.tsx`: consulta del estado local, sin confiar en query params del proveedor.

Cuando Dux está deshabilitado o su lifecycle no está demostrado, Checkout Pro y WhatsApp muestran indisponibilidad y conservan el carrito. El frontend no llama a Dux ni a Mercado Libre.

### Cloudflare Pages Functions

| Ruta | Función | Estado seguro |
| --- | --- | --- |
| `/api/checkout/preferences` | crear Checkout Pro | bloqueada antes de Mercado Pago mientras Dux no tenga lifecycle verificable |
| `/api/orders/whatsapp` | registrar pedido antes de abrir WhatsApp | bloqueada antes de abrir el canal por la misma razón |
| `/api/webhooks/mercadopago` | verificar pagos | conserva firma, consulta e idempotencia; no inventa mutaciones Dux |
| `/api/orders/:publicToken/status` | consultar pedido | token opaco de capacidad |
| `/api/internal/dux/reconcile` | refrescar snapshot Dux | read-only, secreto server-to-server y scheduler desactivado por default |
| `/api/admin/*` | backoffice | sesión administrativa, mismo origen y auditoría |
| endpoints Mercado Libre históricos | OAuth, sync o webhook directo | retirados; no tocan stock |

La arquitectura no necesita VPS. La lógica se ejecuta en Pages Functions y los datos se persisten en D1.

### Cliente Dux v2

`server/dux-api.ts` usa exclusivamente la API pública oficial:

```text
Base: https://erp.duxsoftware.com.ar/WSERP/rest/services
Auth: Authorization: Bearer <token>
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
```

El listado de items se pagina; no se hace un GET por producto ni una llamada por render. Las lecturas se serializan con un intervalo mínimo de cinco segundos, aplican timeout y retries limitados sólo para operaciones seguras. Se atienden `429`, `Retry-After` cuando existe y `error.reintentar_en_segundos` cuando forma parte de la respuesta documentada. El cliente usa `redirect: 'manual'`, no sigue redirecciones y rechaza todo `300`–`399` antes de leer cuerpo o `Location`.

Los parsers exigen identificadores, strings y números finitos. Cantidades decimales o negativas se conservan como observación exacta. La paginación fija el total inicial, exige que permanezca estable y sólo termina si el número de filas recibidas coincide exactamente. Una respuesta inválida o incompleta falla cerrada.

### Mapping y snapshot D1

`migrations/0012_dux_authoritative_inventory.sql` agrega:

- `dux_tenant_context`;
- `dux_sync_runs`;
- `dux_inventory_items`;
- `dux_order_links`;
- `dux_order_operations`.

Las dos tablas de pedidos son preparatorias y no habilitan mutaciones. `0012` bloquea por trigger cualquier línea o transición de un pedido vinculado y también pone en cuarentena pedidos históricos con líneas ya asociadas a identidades Dux. `assertDuxOrderLifecycleUnlinked` bloquea webhook y conciliación, el evento queda fallido/reintentable y `expireWhatsappReservations` omite esos pedidos. No retirar estos guards hasta reemplazarlos mediante una migración aditiva con liberación y finalización Dux demostradas.

Las migraciones `0010` a `0013` quedaron aplicadas y verificadas en preview y production el 2026-09-01. `0013` retira los contadores locales de los documentos activos, elimina sus triggers de reserva/consumo y exige una versión exacta del snapshot Dux en toda línea comercial nueva. Tres sync manuales productivos fallaron `DUX_UNAVAILABLE` con todos los conteos de items en cero; D1 conserva los ciclos fallidos, pero no contiene tenant, inventario/snapshot ni vínculos de pedidos Dux.

`0014_dux_atomic_inventory_snapshots.sql`, todavía pendiente en las D1 remotas, agrega generaciones, staging incremental y presupuesto conservador por D1/día. Cada sync conserva la publicación anterior mientras compara el universo completo; reserva `64 + 14 × delta` y stagea sólo filas nuevas, cambiadas o recién ausentes. Un único batch transaccional aplica el delta por `UPSERT`, publica la generación y la frescura global, actualiza tenant/run y limpia staging. Un trigger impide publicar si `changed_count` difiere del staging o `item_count` de la cardinalidad visible resultante. Una corrida idéntica no reescribe inventario; una carga o publicación fallida conserva el snapshot anterior.

El snapshot guarda identidad Dux, depósito, cantidades observadas, timestamps, estado y error. Los campos de unidad o divisibilidad permanecen explícitamente no verificados cuando v2 no los devuelve; nunca se completan a partir del nombre.

El mapeo es determinístico:

1. vínculo persistido;
2. código externo exacto;
3. SKU exacto;
4. código de barras exacto y único;
5. clave conservadora de nombre exacta y única sólo durante bootstrap.

No hay fuzzy matching. `unmapped` y `ambiguous` preservan el producto local sin cambiar contenido, pero lo dejan no vendible. Un item Dux ausente se marca como ausente sin borrar el producto editorial.

El candidato restringe el nombre a la corrida administrativa `initial` cuando aún no existe inventario. La clave aplica NFKC, minúsculas, espacios normalizados, diacríticos plegados preservando `ñ` y equivalencias de cantidad sólo para tokens completos; veta contradicciones con presentación o ID. No aplica fuzzy matching, sinónimos, singularización, coincidencias parciales ni aritmética de packs. El barcode Dux se compara de forma exacta contra los identificadores canónicos de producto y variante porque el catálogo local no dispone de un campo de barcode independiente. La canonicalización sólo compara identidad y no infiere semántica comercial ni transforma stock. El scheduler debe permanecer desactivado hasta validar el resultado contra un snapshot real y resolver cualquier ambigüedad observada.

## Flujo de Checkout Pro requerido

El flujo que deberá activarse cuando Dux publique o confirme el contrato completo es:

1. el backend valida carrito, mapping y semántica de cantidad;
2. crea un pedido Dux que contiene todo el carrito y reserva en el depósito configurado;
3. persiste la relación pedido Shekinah ↔ pedido Dux;
4. crea o recupera una única preferencia Mercado Pago;
5. el webhook verifica firma, payment ID, entorno, collector, referencia, metadata, moneda e importe;
6. `approved` finaliza el pedido Dux exactamente una vez;
7. `rejected` o `cancelled` libera la reserva Dux exactamente una vez;
8. un timeout mutante se reconcilia por consulta antes de cualquier reintento.

La API pública revisada documenta `POST /v2/pedidos` y `GET /v2/pedidos`, pero no el paso 6 ni el 7. Por eso el código actual no ejecuta `POST /v2/pedidos`, no crea una preferencia y responde `DUX_ORDER_LIFECYCLE_UNAVAILABLE` con la integración habilitada. Si Dux está deshabilitado responde `DUX_API_DISABLED`.

## Flujo de WhatsApp requerido

WhatsApp debe usar la misma reserva Dux:

1. validar carrito y mapping;
2. reservar todo el pedido en Dux;
3. persistir orden local y relación Dux;
4. recién entonces abrir WhatsApp;
5. aprobar sin volver a descontar o rechazar liberando exactamente una vez.

Mientras no exista cancelación/liberación documentada, el backend no abre WhatsApp para un pedido nuevo. No hay fallback a la reserva local anterior.

## Estados e idempotencia

La migración prepara estados para distinguir operación no intentada, pendiente, confirmada, incierta, compensación pendiente, liberada, finalizada o bloqueada. El ID Dux, la referencia Mercado Pago, preference ID y payment ID deben correlacionarse con el ID local sin exponer identificadores internos como token público.

Dux no documenta una clave nativa de idempotencia en pedidos. Shekinah debe reclamar una operación única en D1 antes de mutar, usar una referencia estable y consultar Dux después de una respuesta incierta. Nunca repite ciegamente una mutación que pudo haber sido aplicada.

## Disponibilidad y UX

- snapshot fresco y mapping válido: puede mostrarse la cantidad observada con su fecha;
- stock cero o negativo: agotado;
- sin mapping o mapping ambiguo: no vendible;
- unidad/divisibilidad no verificadas: no vendible;
- Dux caído y snapshot obsoleto: no vendible temporalmente;
- refresh en curso: feedback visible sin borrar el carrito.

El comprador no ve IDs técnicos, tokens, depósito interno ni errores crudos. El backoffice sí presenta estado de vínculo, depósito, timestamp y error sanitizado, con inventario Dux read-only.

## Seguridad y privacidad

- `DUX_API_TOKEN` y `DUX_SCHEDULER_SECRET` son secretos server-side;
- `DUX_COMPANY_ID`, `DUX_BRANCH_ID` y `DUX_DEPOSIT_ID` se obtienen de la API, no de IDs Mercado Libre;
- no se registran token, DNI, CUIT, dirección, teléfono ni email en logs;
- se envían a Dux sólo los datos mínimos que el contrato de pedido exija cuando ese flujo sea habilitado;
- `401`, `403`, `429`, `5xx`, timeout o respuesta inválida bloquean venta;
- no hay fallback a stock local, Mercado Libre o Excel.

El diagnóstico productivo histórico de `f138820` agrega sólo campos cerrados: `kind`, ruta sin query, status HTTP cuando existe y cantidad de intentos. El evento observado fue `fetch_exception` en `/v2/empresas`, `providerStatus=null`, `attempts=3`; no incluyó token, URL completa, cuerpo, mensaje de excepción ni PII. El candidato v2 suma fase, clase allowlisted y presencia de headers, sin mensajes, URL, query, headers, cuerpo o credenciales. Un `3xx` se registra como `provider_redirect` y se rechaza; nunca se sigue.

## Activación

Para abrir comercio deben verificarse simultáneamente: acceso API Dux autorizado sin inferir el plan, token, IDs de tenant, `0012`, `0013` y `0014` aplicadas, snapshot real, mapping auditado con datos reales, unidad y granularidad verificadas, creación y consulta de pedido, liberación/cancelación, finalización, sandbox Mercado Pago, webhook, CI, deployment y smoke del SHA exacto.

El corte read-only previo exige además: un primer sync desde `/api/admin/dux/sync` con `kind=initial`; exactamente una generación `published` y cero `loading`; `item_count` igual a la tabla visible, `changed_count` igual a la carga inicial y staging vacío tras publicar; conteos del run coherentes; cero duplicados mapeados; toda semántica `unavailable_from_v2_items`; y cero `checkout_eligible`. El endpoint del scheduler siempre es `scheduled` y no puede ejecutar el bootstrap inicial.

Hasta entonces:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

No se ejecuta un pago real ni una reserva productiva como smoke automático.

La fase diagnóstica del 2026-09-01 cerró con CI `#416` exitoso y deployment Pages production `8781412e-629b-4473-8081-89c6fbc1ffec` sobre `f138820`, con `fail_open=false`, bindings D1/R2 intactos y build exitoso bajo npm `11.6.0` sin auto-install. `39ab007` eliminó el fallback local. La fase actual agrega transporte manual, snapshot atómico y bootstrap conservador y aprobó la validación local completa; su SHA, CI, deployment, migración `0014` y sync aún no se afirman. `DUX_API_ENABLED`, comercio, Mercado Libre y la reconciliación programada permanecen deshabilitados.
