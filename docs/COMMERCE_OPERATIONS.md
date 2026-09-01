# Operación del comercio

## Estado operativo vigente

Dux Software es la autoridad de inventario, pero el corte productivo read-only todavía no se completó. El 2026-09-01 la API oficial respondió directamente con la credencial autorizada y resolvió empresa `12862`, sucursal `1`, depósito `25566` y `743` items; no se confirmó el nombre exacto del plan y no debe inferirse. Tres reconciliaciones Pages históricas no alcanzaron una respuesta HTTP clasificable. La causa fue aislada en `redirect: 'error'` y el candidato adopta el modo manual seguro, aún pendiente de publicación, `0014` y sync. La API pública tampoco documenta cómo liberar, cancelar, finalizar o vencer en forma segura la reserva de un pedido, ni expone en `GET /v2/items` la semántica de unidad necesaria para vender.

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

Las migraciones `0010` a `0013` ya están aplicadas y verificadas en preview y production; los secretos y variables Dux requeridos están configurados server-side. `0013` dejó cero contadores locales en los documentos editoriales y agregó guardas contra su reintroducción. `0014` está versionada pero aún debe aplicarse antes del cutover. Unidad y lifecycle continúan bloqueando el comercio aun si el snapshot read-only resulta exitoso.

## Responsabilidades

- Operar el stock físico, unidades, depósitos y sincronización con Mercado Libre en Dux.
- Mantener en Shekinah sólo contenido editorial y precios autorizados.
- No cargar stock manual en Shekinah para ningún producto; toda disponibilidad comercial debe provenir de Dux.
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

La reconciliación obtiene el inventario paginado completo y publica en D1 sólo su delta. El cliente serializa las solicitudes con al menos cinco segundos entre inicios; D1 bloquea solapamientos, renueva el lease cada diez intentos HTTP y aplica un cooldown global entre corridas. No existe un GET por producto y los retries se limitan a lecturas seguras. La paginación fija el total, exige que permanezca estable y termina sólo con conteo exacto. El techo es 20 páginas/1.000 items y 1.000 identidades después de variantes; staging agrupa 50 filas cambiadas por sentencia y rechaza antes del bind un payload UTF-8 fuera del margen D1. La fase de lecturas del cliente permite como máximo siete minutos y 45 intentos HTTP totales; mapping, hashing y publicación D1 quedan fuera de ese reloj y se controlan con sus límites propios y el resultado real de Functions. El core exitoso usado por los handlers productivos llega a 42 consultas D1; al sumar catálogo/bootstrap/auditoría, el endpoint interno llega a 43, el administrativo exitoso a 45 y su falla capturada extrema a 48. Un no-op del core usa entre 18 y 21. Antes de staging reserva `64 + 14 × delta` contra un tope local conservador de 40.000 estimadas por día UTC. Exceder cualquier límite falla cerrado. Un `429` respeta `Retry-After` cuando está disponible. `redirect: 'manual'` nunca sigue redirecciones y cualquier `300`–`399` se rechaza antes de leer cuerpo o `Location`.

El presupuesto de 40.000 protege esta D1 y deja margen frente a las 100.000 filas escritas diarias de Workers/D1 Free, pero la cuota real es account-wide. Antes de preview, producción y habilitación del scheduler revisar `rows_written` en Cloudflare para todas las D1 de la cuenta. Una reserva no se libera si luego falla la publicación: ese consumo conservador evita reintentos que subestimen escrituras ya realizadas.

El workflow `.github/workflows/dux-reconcile.yml` ejecuta `/api/internal/dux/reconcile` únicamente si la variable de GitHub `DUX_RECONCILIATION_ENABLED` vale `true`. Como el `if` del job se evalúa antes de cargar variables del environment, ese flag debe ser una variable de repositorio u organización; una variable definida sólo en `cloudflare-pages-production` no habilita el job. Debe permanecer ausente o en `false`. `DUX_SCHEDULER_SECRET` debe existir con valores coincidentes en Pages production y en el environment GitHub, sin imprimirlos.

No habilitar el scheduler hasta validar el mapping con un snapshot real. El primer sync debe salir del backoffice autenticado: `/api/admin/dux/sync` puede seleccionar `kind=initial`; `/api/internal/dux/reconcile` siempre es `scheduled` y no ejecuta bootstrap por nombre. El candidato usa vínculo persistido → código externo → SKU de producto/variante → barcode Dux exacto → clave conservadora de nombre sólo durante bootstrap. Contradicciones de presentación/ID vetan ese paso y no se usa fuzzy matching. Sin sync productivo no existe evidencia de sus conteos reales ni de la cobertura de barcodes.

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

Después de aplicar `0012`, `0013` y `0014` en el entorno correcto, estas consultas ayudan a diagnosticar sin mutar datos:

```sql
SELECT status, COUNT(*) AS generations
FROM dux_inventory_generations
GROUP BY status
ORDER BY status;
```

```sql
SELECT generation_id, status, item_count, changed_count, started_at,
       completed_at, published_at, failed_at
FROM dux_inventory_generations
ORDER BY started_at DESC
LIMIT 20;
```

```sql
SELECT generation_id, COUNT(*) AS staged_items
FROM dux_inventory_generation_items
GROUP BY generation_id
ORDER BY generation_id;
```

```sql
SELECT
  (SELECT COUNT(*) FROM dux_inventory_items) AS visible_items,
  (SELECT COUNT(*) FROM dux_inventory_generation_items) AS staged_items,
  (SELECT COUNT(*) FROM dux_inventory_generations WHERE status = 'loading') AS loading,
  (SELECT COUNT(*) FROM dux_inventory_generations WHERE status = 'published') AS published;
```

```sql
SELECT company_id, branch_id, deposit_id, verified_at
FROM dux_tenant_context
WHERE id = 1;
```

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
- `403`: permisos o acceso insuficiente; confirmar alcance y plan directamente con Dux sin inferir su nombre.
- `429`: respetar la espera indicada; no multiplicar workers ni retries.
- `300`–`399`: `provider_redirect`/`DUX_PROVIDER_REJECTED`; nunca seguir ni inspeccionar `Location`.
- `5xx`: indisponibilidad temporal; snapshot como diagnóstico, venta cerrada.
- timeout de GET: retry acotado.
- timeout de futura mutación: resultado incierto; consultar antes de repetir.
- payload inválido: contrato incompatible; cerrar y conservar error sanitizado.

Un snapshot obsoleto puede ayudar al operador, pero no autoriza una venta.

## Incidente observado y runbook seguro

El 2026-09-01 se ejecutaron tres sync manuales de producción. Todos terminaron `DUX_UNAVAILABLE` con cero procesados, mapeados, no mapeados y ambiguos. D1 conserva esos tres ciclos fallidos, pero `dux_tenant_context`, `dux_inventory_items` y `dux_order_links` continúan sin filas; no existe snapshot utilizable.

En `f138820`, el deployment `8781412e-629b-4473-8081-89c6fbc1ffec` registró sólo el diagnóstico terminal seguro `fetch_exception` para `/v2/empresas`, con `providerStatus=null` y `attempts=3`. Esto indica una excepción de transporte antes de una respuesta HTTP, no un `5xx` demostrado. El evento no incluye token, URL completa, query, cuerpo, mensaje de excepción ni PII. El diagnóstico aislado posterior verificó la incompatibilidad con `redirect: 'error'`; el candidato usa modo manual y distingue `fetch_headers`, `read_body` y `classify_response` sin registrar mensajes crudos.

Ante una repetición después de migrar `0014`:

1. mantener `DUX_API_ENABLED`, comercio, Mercado Libre y scheduler en `false`;
2. ejecutar como máximo un sync administrativo sobre el SHA exacto y observar `kind`, `endpoint`, `providerStatus`, `attempts`, `phase`, `errorClass` y `headersReceived`;
3. consultar runs, generaciones, staging transitorio y publicación visible;
4. ante una falla capturada, comprobar que la generación nueva figure `failed`, su staging quede limpio y la generación anterior continúe `published` si existía; ante un kill/1102 puede quedar `loading` con staging hasta que la recuperación versionada del lease actúe después de 30 minutos;
5. escalar sólo con la evidencia sanitizada observada; no atribuir el fallo a DNS, TLS o un status del proveedor sin prueba;
6. volver a `DUX_API_ENABLED=false` al terminar y no activar el scheduler;
7. no repetir intentos en bucle, no ampliar retries y no usar stock local, Excel o Mercado Libre como fallback.

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

No habilitar comercio hasta completar todos los requisitos de `docs/COMMERCE_DEPLOYMENT.md`, incluidas prueba de reserva, consulta, cancelación/liberación y finalización Dux, sandbox Mercado Pago, webhook, migración, CI y deployment del mismo SHA. El scheduler read-only puede evaluarse únicamente después del primer sync `initial` auditado, un segundo ciclo no-op exitoso y la configuración/verificación productiva de `DUX_SNAPSHOT_MAX_AGE_SECONDS=1800`; no sustituye unidad/lifecycle y no habilita comercio. Un pago productivo o una reserva real requieren autorización humana puntual.
