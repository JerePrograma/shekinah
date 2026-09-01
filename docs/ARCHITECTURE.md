# Arquitectura

## Resumen

Shekinah es una SPA React/TypeScript/Vite con backend en Cloudflare Pages Functions, persistencia Cloudflare D1 e imágenes administradas en R2.

La topología normativa de comercio es:

```text
Dux Software ──lectura de inventario / pedidos-reservas──> Shekinah ──Checkout Pro──> Mercado Pago
      │
      └──────────────────sincronización propia──────────────────────> Mercado Libre
```

- Dux es la única autoridad de identidad externa de inventario, stock, depósito, unidad, divisibilidad y semántica de cantidad.
- Shekinah es autoridad editorial y coordinadora: slugs, imágenes, descripciones, categorías, SEO, carrito y orden local.
- Mercado Pago es autoridad financiera del pago.
- Mercado Libre es sincronizado por Dux y queda fuera del flujo de inventario de Shekinah.

El esquema conserva columnas y migraciones históricas de stock local y Mercado Libre para trazabilidad, pero el runtime, el catálogo y la administración ya no las usan como autoridad. No existe fallback a stock precargado, Excel, scraping, cookies del ERP ni inferencia de unidad mediante el nombre del producto.

## Estado de activación

La integración Dux implementada es de lectura y diagnóstico. El 2026-09-01 la API oficial respondió directamente con la credencial autorizada y devolvió los IDs de tenant configurados y `743` items. El plan comercial exacto no fue confirmado y no debe inferirse. Tres lecturas históricas desde Pages fallaron antes de cualquier status HTTP; un diagnóstico aislado posterior comprobó que `redirect: 'error'` causaba la excepción y que `redirect: 'manual'` permitía clasificar la respuesta. El candidato corrige ese transporte, pero aún debe desplegarse y demostrarse con un sync productivo. Además, la API pública revisada no demuestra:

- unidad, pesabilidad, divisibilidad o granularidad comercial en `GET /v2/items`;
- cancelación, liberación, finalización o expiración segura de una reserva creada con la API de pedidos.

Hasta desplegar, migrar y auditar el primer sync, `DUX_API_ENABLED` permanece en `false`. Aun después de un corte read-only exitoso, unidad y lifecycle mantienen `COMMERCE_ENABLED` y `VITE_COMMERCE_ENABLED` en `false`; Checkout Pro y WhatsApp siguen fallando cerrados antes de crear una preferencia, abrir el canal o mutar Dux.

## Frontend

- `index.html`: documento raíz;
- `src/main.tsx`: montaje de React y proveedores globales;
- `src/App.tsx`: layout, navegación y selección de vista;
- `src/pages/`: inicio, catálogo, producto, carrito, retornos de pago, privacidad, administración y 404;
- `src/cart/`: estado persistente del carrito;
- `src/commerce/`: contratos, API y sesión de checkout;
- `src/analytics/`: consentimiento y cliente first-party;
- `src/data/authorized-commercial-data.ts`: acceso tipado al catálogo editorial;
- `src/data/runtime-catalog.ts`: proyección runtime recibida de APIs first-party;
- `src/admin/DuxPanel.tsx`: diagnóstico read-only de la proyección Dux.

El frontend no llama a Dux ni a Mercado Libre, no recibe tokens y no decide disponibilidad crítica. Una cantidad observada puede mostrarse sólo como información de snapshot; una venta requiere un ciclo Dux autoritativo que hoy está bloqueado.

## Navegación

El router propio conserva History API y enlaces HTML reales. `src/routing/routes.ts` resuelve rutas públicas, comerciales y administrativas; las desconocidas muestran la vista 404.

## Catálogo y mapping

El catálogo versionado y `catalog_product_mutations` conservan los datos editoriales locales. Dux no reemplaza slugs, imágenes, descripción, categorías ni precios como efecto colateral de la sincronización de inventario.

El mapping sigue este orden, sin coincidencia difusa:

1. vínculo Dux persistido;
2. identificador externo exacto;
3. SKU exacto cuando coincide con un código Dux;
4. código de barras exacto e inequívoco;
5. sólo para bootstrap, clave conservadora de nombre exacta y única.

El resultado es `mapped`, `unmapped` o `ambiguous`. Cero o varios candidatos no alteran el producto local y lo mantienen no vendible. Un producto ausente en Dux tampoco se borra.

El candidato incluye SKU de producto/variante, compara los barcodes Dux contra esos identificadores canónicos exactos y habilita el nombre sólo cuando la corrida es `initial` y `dux_inventory_items` está vacía. La clave aplica NFKC, minúsculas, espacios normalizados, diacríticos plegados preservando `ñ` y equivalencias de cantidad únicamente para tokens completos reconocidos. Una contradicción entre nombre, presentación e ID histórico veta el paso. No elimina puntuación arbitraria ni usa singularización, sinónimos, fuzzy matching, coincidencias parciales o aritmética de packs. La ambigüedad continúa bloqueando. El catálogo no tiene un campo barcode local independiente, por lo que la eficacia real del paso de barcode sigue pendiente de un snapshot productivo auditado.

La canonicalización anterior sólo compara identidad durante bootstrap. No define unidad comercial, pesabilidad, divisibilidad, paso comprable o peso de envío y no transforma ninguna cantidad Dux.

El snapshot D1 conserva cantidades `REAL` y metadatos observados sin `floor`, `ceil`, `round`, conversiones de gramos/kilos ni escalas inferidas. Dux sigue siendo la autoridad; D1 sólo reduce llamadas y permite diagnóstico.

## Integración Dux

`server/dux-api.ts` centraliza la API oficial Dux v2:

- base `https://erp.duxsoftware.com.ar/WSERP/rest/services`;
- autenticación `Authorization: Bearer <token>`;
- `GET /v2/empresas`;
- `GET /v2/sucursales?id_empresa=...`;
- `GET /v2/depositos`;
- `GET /v2/items` paginado y filtrado por depósito.

El cliente valida respuestas explícitamente, preserva decimales y valores negativos observados, aplica timeout, serializa a una solicitud cada cinco segundos, respeta `Retry-After` cuando existe y limita retries a lecturas seguras. Usa `redirect: 'manual'`, no sigue redirecciones y rechaza cualquier `300`–`399` antes de leer cuerpo o `Location`. La paginación fija el total de la primera respuesta, exige que no cambie y sólo termina cuando el conteo recibido coincide exactamente. Un deadline monotónico de siete minutos acota la fase de lecturas Dux —incluidos waits, retries y heartbeats—; el mapping, hashing, staging y batch de publicación posteriores quedan fuera de ese reloj y deben acreditarse con el resultado real de Functions frente al timeout externo de ocho minutos. D1 impide corridas solapadas, renueva el lease cada diez intentos HTTP y conserva un cooldown global. El techo es 20 páginas/1.000 items y también 1.000 identidades tras expandir variantes; staging inserta 50 filas por sentencia `json_each` y verifica el tamaño UTF-8 antes del bind. Un presupuesto global de 45 intentos HTTP deja cinco de margen frente a los 50 subrequests externos de Workers Free. El core exitoso usado por los handlers productivos consume como máximo 42 consultas D1; con catálogo, selección de bootstrap y auditoría, el endpoint interno llega a 43, el administrativo exitoso a 45 y su falla capturada extrema a 48. Un no-op del core usa entre 18 y 21. Todos los caminos productivos medidos permanecen bajo las 50 consultas D1 por invocación. Un universo, deadline, payload o presupuesto excedido, el intento HTTP 46 o una respuesta inválida, `3xx`, `401`, `403`, `429`, `5xx` o timeout falla cerrado y nunca habilita una venta.

La verificación directa resolvió empresa `12862`, sucursal `1` y depósito `25566`. Tres sync productivos históricos desde Pages fallaron con `DUX_UNAVAILABLE` y cero procesados. El diagnóstico de `f138820` emitió sólo `kind=fetch_exception`, `endpoint=/v2/empresas`, `providerStatus=null`, `attempts=3`, sin URL/query, token, cuerpo ni mensaje de excepción. La fase posterior aisló la causa y agrega un diagnóstico v2 con fase, clase cerrada y presencia de headers, manteniendo las mismas exclusiones. Aún no se publicó snapshot.

`server/dux-inventory.ts` valida empresa, sucursal y depósito contra esas lecturas, ejecuta el mapeo y persiste la proyección. El scheduler `dux-reconcile.yml` llama a `/api/internal/dux/reconcile`, pero su job sólo corre con `DUX_RECONCILIATION_ENABLED=true`. Como el `if` se evalúa antes de cargar variables del environment, el flag debe definirse a nivel repositorio u organización; permanece ausente o en `false` hasta completar y auditar el primer sync administrativo `initial`. Unidad y lifecycle son bloqueos independientes para el comercio.

## Persistencia

Las migraciones publicadas permanecen inmutables. `migrations/0012_dux_authoritative_inventory.sql` agrega de forma aditiva:

- contexto de tenant Dux;
- ciclos de sincronización;
- snapshot, identidad y mapping de items;
- relación futura entre pedido local y pedido Dux;
- ledger de operaciones Dux para idempotencia y resultados inciertos.

El 2026-09-01 se verificó que `0010` a `0013` están aplicadas en preview y production. `0013_remove_local_catalog_stock.sql` eliminó `stockQuantity`, `reservedQuantity` y `availableQuantity` de los documentos editoriales, retiró los triggers locales de reserva/consumo y agregó guardas que impiden reintroducir esos campos o insertar líneas comerciales nuevas sin una versión exacta de snapshot Dux mapeado. Las líneas históricas no se reescribieron.

El esquema versionado agrega `0014_dux_atomic_inventory_snapshots.sql`, todavía pendiente en las D1 remotas:

```text
dux_sync_runs
    └─ dux_inventory_generations
         └─ dux_inventory_generation_items (staging del delta)
                       │
                       └─ publicación atómica → dux_inventory_items
```

Cada corrida carga una generación `loading`; catálogo, administración y guards continúan leyendo sólo `dux_inventory_items`. El Worker compara el universo Dux completo con la publicación visible y stagea únicamente filas nuevas, modificadas o que pasan por primera vez a `absent`. Antes de staging reserva de forma atómica, por fecha UTC, `64 + 14 × changed_count` unidades estimadas dentro de un tope conservador de 40.000 por D1/día. Un único `D1Database.batch` aplica ese delta mediante `UPSERT`, supersede/publica generaciones, fija la frescura global al momento de finalización, actualiza tenant/run y elimina el staging. El trigger exige que `changed_count` coincida con el delta y que `item_count` coincida con la cardinalidad visible resultante. Una corrida idéntica no escribe inventario; un fallo revierte el batch y conserva íntegra la publicación anterior. El tope local deja margen, pero no sustituye revisar `rows_written` de toda la cuenta Cloudflare, cuya cuota Free es compartida entre D1.

`0012` agrega además los guards `dux_order_link_requires_empty_order`, `dux_order_items_lifecycle_blocked`, `dux_order_items_update_blocked`, `dux_order_items_delete_blocked`, `dux_order_status_lifecycle_blocked` y `dux_mapped_order_status_lifecycle_blocked`. Hasta que una migración aditiva posterior implemente el lifecycle oficial, un pedido Dux no puede materializar líneas ni cambiar de estado. `0013` elimina los triggers legacy de consumo y reserva para que ninguna ruta vuelva a depender de un contador local.

Las columnas de pedidos y las tablas Mercado Libre anteriores se conservan como historia. Los contadores locales ya no forman parte del contrato de producto ni de sus documentos D1; para toda venta nueva el inventario es exclusivamente Dux.

## Pedidos y pagos

El orden seguro requerido es:

1. validar el carrito y el vínculo Dux;
2. crear o reservar todo el pedido en Dux de forma idempotente;
3. persistir la relación pedido Shekinah ↔ pedido Dux;
4. crear la preferencia Mercado Pago;
5. verificar el pago por webhook y consulta autoritativa;
6. finalizar o liberar en Dux exactamente una vez.

La documentación pública Dux expone `POST /v2/pedidos` y `GET /v2/pedidos`, pero no documenta la compensación necesaria. Por ello el paso 2 no se ejecuta y todos los pasos posteriores permanecen bloqueados. Pagos, conciliación y expiración detectan `dux_order_links` o líneas asociadas a una identidad/candidata Dux y se detienen; el webhook conserva el evento como fallido/reintentable. Sólo los pedidos legacy sin relación Dux mantienen su comportamiento histórico.

## Administración

`/admin` exige una sesión server-side. La cookie propia es `HttpOnly`, `Secure`, `SameSite=Strict` y está firmada; Cloudflare Access es un fallback opcional, no un reemplazo del middleware.

El backoffice conserva el ABM editorial. Para Dux muestra vínculo, cantidad observada, depósito, última sincronización y error. La cantidad Dux es read-only. Si la semántica de unidad no está disponible se muestra como no verificada y el producto queda no vendible; nunca se habilita un control local para escribir stock sobre el mismo inventario.

Mercado Libre ya no tiene controles operativos activos. Sus endpoints administrativos y webhooks históricos responden como integración retirada y no sincronizan ni reservan stock.

## Seguridad

- los secretos no usan prefijo `VITE_`;
- el token Dux no se guarda en D1, logs ni respuestas;
- las entradas y respuestas externas se validan en el límite;
- las mutaciones usan idempotencia local y no se repiten ciegamente tras timeout;
- los totales se recalculan en servidor;
- las consultas D1 son parametrizadas;
- Checkout Pro, Dux y el scheduler permanecen deshabilitados por defecto;
- no hay fallback silencioso a stock local, Mercado Libre, Excel o una cantidad obsoleta.

## Build

```bash
npm ci
npm run install:browsers
npm run verify
npm run build:pages
```

El build es reproducible sin red Dux. La salida pública se genera en `dist`; las Pages Functions se publican desde `functions/`.

Para el candidato histórico `f138820`, CI `#416` y el deployment productivo `8781412e-629b-4473-8081-89c6fbc1ffec` concluyeron correctamente. La fase actual aprobó localmente `npm ci`, navegadores, `npm run verify` (358 aprobadas, 14 omitidas y Playwright 25/25) y `npm run build:pages` con Node `24.18.0`/npm `11.6.0`; su CI y deployment siguen pendientes. El builder omite la instalación automática, mantiene `fail_open=false` y preserva los bindings D1/R2. El éxito de build no cambia los flags cerrados.
