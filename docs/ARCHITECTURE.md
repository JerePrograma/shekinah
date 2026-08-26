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

El código conserva componentes históricos de stock local y de Mercado Libre para compatibilidad y trazabilidad, pero no deben volver a activarse como autoridad. No existe fallback a Excel, scraping, cookies del ERP ni inferencia de unidad mediante el nombre del producto.

## Estado de activación

La integración Dux implementada es de lectura y diagnóstico. La cuenta indicada por el cliente muestra Plan ESTÁNDAR y necesita PRO/FULL más token. Además, la API pública revisada no demuestra:

- unidad, pesabilidad, divisibilidad o granularidad comercial en `GET /v2/items`;
- cancelación, liberación, finalización o expiración segura de una reserva creada con la API de pedidos.

Hasta resolver ambos puntos, `DUX_API_ENABLED`, `COMMERCE_ENABLED` y `VITE_COMMERCE_ENABLED` permanecen en `false`. Checkout Pro y WhatsApp fallan cerrados antes de crear una preferencia, abrir el canal o mutar Dux.

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
5. sólo para bootstrap, nombre normalizado exacto y único.

El resultado es `mapped`, `unmapped` o `ambiguous`. Cero o varios candidatos no alteran el producto local y lo mantienen no vendible. Un producto ausente en Dux tampoco se borra.

El snapshot D1 conserva cantidades `REAL` y metadatos observados sin `floor`, `ceil`, `round`, conversiones de gramos/kilos ni escalas inferidas. Dux sigue siendo la autoridad; D1 sólo reduce llamadas y permite diagnóstico.

## Integración Dux

`server/dux-api.ts` centraliza la API oficial Dux v2:

- base `https://erp.duxsoftware.com.ar/WSERP/rest/services`;
- autenticación `Authorization: Bearer <token>`;
- `GET /v2/empresas`;
- `GET /v2/sucursales?id_empresa=...`;
- `GET /v2/depositos`;
- `GET /v2/items` paginado y filtrado por depósito.

El cliente valida respuestas explícitamente, preserva decimales y valores negativos observados, aplica timeout, serializa a una solicitud cada cinco segundos, respeta `Retry-After` cuando existe y limita retries a lecturas seguras. D1 impide corridas solapadas, renueva el lease antes de cada request y conserva un cooldown global entre corridas; el listado se limita a 100 páginas de 50 items. Superar 5.000 items falla cerrado en vez de abrir otra corrida concurrente. Una respuesta inválida, `401`, `403`, `429`, `5xx` o timeout nunca habilita una venta.

`server/dux-inventory.ts` valida empresa, sucursal y depósito contra esas lecturas, ejecuta el mapeo exacto y persiste la proyección. El scheduler `dux-reconcile.yml` llama a `/api/internal/dux/reconcile`, pero su job sólo corre con `DUX_RECONCILIATION_ENABLED=true`; ese flag no debe activarse sin plan, token, IDs y migración verificados.

## Persistencia

Las migraciones publicadas permanecen inmutables. `migrations/0012_dux_authoritative_inventory.sql` agrega de forma aditiva:

- contexto de tenant Dux;
- ciclos de sincronización;
- snapshot, identidad y mapping de items;
- relación futura entre pedido local y pedido Dux;
- ledger de operaciones Dux para idempotencia y resultados inciertos.

`0012` agrega además los guards `dux_order_link_requires_empty_order`, `dux_order_items_lifecycle_blocked`, `dux_order_items_update_blocked`, `dux_order_items_delete_blocked`, `dux_order_status_lifecycle_blocked` y `dux_mapped_order_status_lifecycle_blocked`. Hasta que una migración aditiva posterior implemente el lifecycle oficial, un pedido Dux no puede materializar líneas ni cambiar de estado. El último guard también pone en cuarentena preferencias o pedidos anteriores al corte cuando alguna línea ya coincide con una identidad Dux, evitando que alcancen los triggers legacy de stock local.

Las tablas locales de stock y las tablas Mercado Libre anteriores se conservan como legado. Para productos Dux no representan stock físico ni reservas válidas.

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
