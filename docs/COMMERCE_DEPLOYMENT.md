# Despliegue del comercio

## Regla de activación

Este documento distingue código, migraciones, configuración, deployment y pruebas externas. Ninguna etapa demuestra automáticamente la siguiente.

El estado seguro esperado al desplegar este cambio es:

```text
DUX_API_ENABLED=false
DUX_RECONCILIATION_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

No activar comercio mientras falte cualquiera de estos requisitos:

- acceso API Dux v2 autorizado y verificable, sin inferir el nombre exacto del plan;
- token API válido cargado sólo como secreto server-side;
- empresa, sucursal y depósito obtenidos de endpoints oficiales;
- migraciones `0012_dux_authoritative_inventory.sql` y `0013_remove_local_catalog_stock.sql` aplicadas y verificadas;
- snapshot real y mappings auditados;
- unidad, pesabilidad, divisibilidad y granularidad comercial verificadas;
- creación y consulta de pedido Dux probadas;
- cancelación/liberación y finalización Dux documentadas y probadas;
- sandbox Mercado Pago y webhook aprobados;
- CI, deployment y smoke del mismo SHA.

El 2026-09-01 la API Dux respondió directamente con la credencial autorizada, pero no se verificó el nombre exacto del plan y no debe afirmarse uno. La API pública revisada sigue sin documentar el lifecycle de compensación. Además, las lecturas ejecutadas desde Pages Functions fallaron antes de recibir una respuesta HTTP del proveedor. Por eso el resultado de este despliegue es configuración preparada y fail-closed, no comercio activo.

## 1. Validar el commit exacto

Desde `main` sincronizado:

```powershell
git status
git switch main
git fetch origin
git pull --ff-only origin main
git status
npm ci
npm run install:browsers
npm run verify
npm run build:pages
git diff --check
```

Registrar SHA completo, resultados y cualquier prueba no ejecutada. No desplegar un commit con fallos conocidos ni usar otro SHA para la evidencia.

## 2. Aplicar la migración D1

`migrations/0012_dux_authoritative_inventory.sql` agrega contexto Dux, ciclos de sync, snapshot/mapping, vínculo futuro de pedidos y ledger de operaciones. `0013_remove_local_catalog_stock.sql` elimina del documento editorial los tres contadores locales, retira los triggers que reservaban o consumían esos contadores y exige snapshot Dux exacto para líneas comerciales nuevas. No borra productos, pedidos, líneas históricas, pagos, auditoría, Mercado Libre ni imágenes.

Antes de tocar una D1 remota:

1. confirmar que se opera el proyecto Pages `shekinah`, no el Worker homónimo;
2. confirmar que preview y production siguen usando bases distintas;
3. obtener bookmark Time Travel o backup verificable;
4. ejecutar primero preview;
5. inspeccionar tablas, índices, checks, `PRAGMA foreign_key_check` y los triggers `dux_order_link_requires_empty_order`, `dux_order_items_lifecycle_blocked`, `dux_order_items_update_blocked`, `dux_order_items_delete_blocked`, `dux_order_status_lifecycle_blocked` y `dux_mapped_order_status_lifecycle_blocked`;
6. recién entonces aplicar production.

Con una configuración Wrangler local correcta y no versionada:

```powershell
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations list DB --remote
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler d1 migrations list DB --remote --env production
```

Esos comandos suponen que el binding superior `DB` apunta a preview y `env.production.DB` a producción; comprobar los UUID antes de ejecutar. No agregar `--preview` si el archivo local no define `preview_database_id`. El 2026-09-01 se verificó por nombre y esquema que `0010` a `0013` están aplicadas en ambas bases. Esta evidencia no exime de comprobar nuevamente la lista remota.

Los seis triggers de `0012` y los tres guardas de `0013` son parte del estado fail-closed. Retirarlos requiere una migración aditiva posterior y evidencia del lifecycle oficial de reserva, liberación y finalización Dux.

## 3. Confirmar acceso oficial Dux

No inferir el plan por una pantalla del ERP ni intentar bypass. El procedimiento válido es:

1. confirmar con Dux que la cuenta tiene acceso API autorizado, sin afirmar un plan no comprobado;
2. generar un token desde el mecanismo oficial Dux;
3. cargarlo como `DUX_API_TOKEN` cifrado en Pages;
4. comprobar una lectura con Bearer sin registrar el token;
5. consultar empresa, sucursal y depósito mediante la API;
6. no deducir IDs desde Mercado Libre ni desde la pantalla del ERP.

API oficial implementada:

```text
Base: https://erp.duxsoftware.com.ar/WSERP/rest/services
GET /v2/empresas
GET /v2/sucursales?id_empresa=...
GET /v2/depositos
GET /v2/items
```

Los IDs aportados `445638367` (seller Mercado Libre) y `3851` (usuario Dux mostrado) no equivalen de forma demostrada a empresa, sucursal, depósito o personal.

La lectura directa verificada el 2026-09-01 resolvió empresa `12862`, sucursal `1` y depósito `25566`, y el listado paginado informó `743` items. La credencial funcionó desde el host de operación; esto demuestra acceso efectivo, no el nombre exacto del plan contratado.

## 4. Configurar Dux en Pages

Variables server-side por entorno:

```text
DUX_API_ENABLED=false
DUX_COMPANY_ID=12862
DUX_BRANCH_ID=1
DUX_DEPOSIT_ID=25566
DUX_SNAPSHOT_MAX_AGE_SECONDS=900
```

Secretos server-side:

```text
DUX_API_TOKEN
DUX_SCHEDULER_SECRET
```

No crear `VITE_DUX_API_TOKEN`. Verificar sólo nombre, tipo y entorno; nunca leer o imprimir valores. Mantener valores distintos por preview/production si la cuenta o permisos difieren.

Después de configurar, dejar `DUX_API_ENABLED=false` hasta que `0012`/`0013` estén aplicadas y el smoke read-only sea seguro. Activar read-only Dux no habilita comercio: el guard de lifecycle debe seguir bloqueando ventas.

## 5. Configurar reconciliación read-only

El único scheduler de inventario permitido es `.github/workflows/dux-reconcile.yml`. Llama a:

```text
POST https://shekinah.ar/api/internal/dux/reconcile
Authorization: Bearer <DUX_SCHEDULER_SECRET>
```

El job requiere:

- variable GitHub de repositorio u organización `DUX_RECONCILIATION_ENABLED=true`;
- secreto GitHub environment `DUX_SCHEDULER_SECRET`;
- el mismo secreto cifrado en Pages production;
- endpoint desplegado y `DUX_API_ENABLED=true`;
- migraciones `0012`/`0013` y token Dux válidos.

El `if` del job se evalúa antes de cargar variables del environment; por eso `DUX_RECONCILIATION_ENABLED` debe existir a nivel repositorio u organización, no sólo en `cloudflare-pages-production`. Por defecto debe faltar o valer `false`; así el workflow queda desactivado.

No habilitarlo aunque se recupere la conectividad hasta probar el mapping real. `39ab007` implementa vínculo persistido → código externo → SKU/variante → barcode Dux exacto contra identificadores canónicos → nombre exacto sólo en bootstrap. Exigir un sync manual read-only, revisar conteos/ambigüedades y comprobar el intervalo mínimo de cinco segundos. No ejecutar llamadas Dux durante build.

No restaurar el scheduler Mercado Libre. Dux sincroniza ese canal fuera de Shekinah.

## 6. Ejecutar smoke Dux read-only

Con cuenta, token y IDs confirmados:

1. `GET /v2/empresas`: la empresa configurada existe una sola vez;
2. `GET /v2/sucursales`: la sucursal pertenece a esa empresa;
3. `GET /v2/depositos`: el depósito pertenece a la empresa y está habilitado;
4. `GET /v2/items`: paginación completa, cantidades finitas y depósito correcto;
5. sincronización: un solo ciclo, sin thundering herd ni `429` repetidos;
6. D1: conteos de `mapped`, `unmapped` y `ambiguous` consistentes;
7. backoffice: cantidad y timestamp visibles, sin IDs/tokens en el frontend;
8. catálogo: ausentes o ambiguos preservados y no vendibles.

No mutar stock real ni crear pedidos como smoke. No afirmar una unidad o divisibilidad que `GET /v2/items` no entrega.

### Resultado productivo del 2026-09-01

Se ejecutaron tres reconciliaciones manuales autorizadas en producción. Las tres respondieron `DUX_UNAVAILABLE`, procesaron cero items y dejaron en cero `mapped`, `unmapped` y `ambiguous`; no publicaron contexto de tenant, inventario/snapshot ni vínculos de pedidos.

El candidato `f138820` agregó diagnóstico terminal sin datos sensibles. Su único evento fue:

```text
event=dux_api_transport_failure
kind=fetch_exception
endpoint=/v2/empresas
providerStatus=null
attempts=3
```

La ausencia de `providerStatus` significa que Pages no recibió una respuesta HTTP clasificable del proveedor; no demuestra un `5xx` Dux. El evento omite URL completa, query, token, cuerpo y mensaje de excepción. Finalizado el diagnóstico, `DUX_API_ENABLED` volvió a `false` y no se habilitó el scheduler.

## 7. Resolver el hard blocker de pedidos

La documentación pública revisada expone `POST /v2/pedidos` y `GET /v2/pedidos`, pero no demuestra cómo:

- anular/cancelar un pedido por API;
- liberar una reserva;
- finalizar/confirmar sin operación fiscal incorrecta;
- tratar preferencia abandonada o reserva vencida;
- resolver con certeza un timeout del POST;
- garantizar rechazo atómico por stock insuficiente.

Antes de implementar o habilitar mutaciones, obtener de soporte Dux documentación oficial para cada caso. Si existe endpoint, confirmar método, path, campos, estados, idempotencia y efectos de stock. Si sólo puede hacerse desde la UI del ERP, la arquitectura no es activable de forma segura.

También se debe obtener una fuente oficial para unidad, pesabilidad, divisibilidad y paso de venta. Está prohibido inferirlos por nombres o presentaciones locales.

## 8. Configurar Mercado Pago

La aplicación autorizada es:

```text
Aplicación: Shekinah
Application ID: 7373984348988262
```

Secretos:

```text
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
ORDER_TOKEN_SECRET
```

Variables:

```text
PUBLIC_SITE_URL=https://shekinah.ar
ALLOWED_SITE_ORIGINS=https://shekinah.ar
MERCADO_PAGO_CHECKOUT_MODE=production
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
```

El webhook productivo esperado es `https://shekinah.ar/api/webhooks/mercadopago`. Debe exigir firma y reconsultar el pago. La presencia del nombre de un secreto no demuestra que sea vigente ni que pertenezca a la cuenta correcta.

Probar primero sandbox y estados approved/pending/rejected/cancelled, duplicados y fuera de orden. Sin un lifecycle Dux completo no iniciar siquiera la preferencia: una prueba aislada de Mercado Pago no habilita comercio.

## 9. Mercado Libre

Mantener:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

No configurar OAuth, scheduler, webhooks o stock directo. Los endpoints históricos responden como retirados. No borrar tablas ni secretos existentes sólo por este cambio; pueden conservarse hasta una limpieza futura explícita y respaldada.

El cliente continúa usando la integración Dux ↔ Mercado Libre de la tienda `HERBOLARIOMDP`. Shekinah no debe competir con ella.

## 10. Validar preview

Con todos los flags de venta cerrados:

- sitio y catálogo responden;
- Dux deshabilitado produce `DUX_API_DISABLED`;
- Dux habilitado en entorno controlado pero sin lifecycle produce `DUX_ORDER_LIFECYCLE_UNAVAILABLE`;
- no se emite request a Mercado Pago después de esos errores;
- WhatsApp no se abre;
- ningún endpoint Mercado Libre se consulta o muta;
- productos sin mapping o ambiguos se preservan y quedan no vendibles;
- decimales como `738.5`, `36.4` y `2.44` atraviesan parser, D1 y proyección sin redondeo;
- snapshot obsoleto o Dux caído no habilita venta;
- doble sync usa lock y no duplica ciclos;
- `429` espera y reintenta de forma limitada;
- backoffice no permite editar stock Dux.

Validar además el login administrativo, D1, R2, privacidad, build sin source maps y APIs first-party existentes.

## 11. Activación futura escalonada

Sólo después de resolver el hard blocker:

1. probar mutaciones en un entorno Dux de prueba, si existe;
2. demostrar pedido con carrito completo y reserva correcta;
3. demostrar consulta posterior;
4. demostrar liberación/cancelación idempotente;
5. demostrar finalización idempotente;
6. probar error Dux → no preferencia;
7. probar reserva Dux → error MP → compensación;
8. probar timeout incierto → consulta antes de reintento;
9. probar WhatsApp aprobado/rechazado/vencido;
10. verificar que Dux refleja disponibilidad y sincroniza Mercado Libre;
11. aplicar y verificar secrets/configuración en production;
12. desplegar el SHA aprobado;
13. activar `DUX_API_ENABLED=true` y reconciliación read-only;
14. habilitar backend y frontend de comercio sólo al final;
15. realizar una compra productiva de bajo importe únicamente con autorización expresa.

No habilitar `COMMERCE_ENABLED` o `VITE_COMMERCE_ENABLED` porque compile.

## 12. R2 y autenticación administrativa

El cambio Dux no altera los bindings existentes:

- `DB`: D1 aislada por entorno;
- `CATALOG_IMAGES`: R2 aislado por entorno;
- sesión administrativa propia y secretos `ADMIN_*`;
- Cloudflare Access como fallback opcional.

Al modificar variables o bindings, distinguir siempre el proyecto Pages del Worker homónimo. No reemplazar una configuración activa con `wrangler.example.jsonc`: contiene marcadores, no IDs reales.

## Estado externo verificado el 2026-09-01

- CI `#416`: `success` sobre `f138820`;
- Pages production: deployment canónico `8781412e-629b-4473-8081-89c6fbc1ffec`, stage exitoso sobre `f138820`;
- runtime: `fail_open=false`, D1 y R2 conservados en sus bindings correctos;
- builder: instalación automática omitida, npm `11.6.0` y `npm run build:pages` exitoso;
- flags finales: Dux API, reconciliación, comercio y Mercado Libre deshabilitados;
- D1 Dux: tres ciclos fallidos conservados como evidencia, sin tenant, snapshot/inventario ni vínculos de pedidos.

Este estado acredita despliegue seguro del diagnóstico y cierre de flags. La aplicación posterior de `0013` acredita cero contadores locales en payloads productivos y guardas remotas activos; no acredita snapshot Dux, mapping real, lifecycle de pedidos ni comercio productivo.

## Estados que deben informarse por separado

| Estado | Evidencia mínima |
| --- | --- |
| Código preparado | diff y pruebas locales |
| CI aprobado | workflow exitoso sobre SHA exacto |
| Pages desplegado | deployment asociado al SHA |
| Migraciones `0012`/`0013` aplicadas | lista remota, esquema, conteos y FK verificados |
| Acceso Dux preparado | acceso directo, token e IDs confirmados sin inferir el plan; lectura Pages pendiente |
| Snapshot Dux | sync real y conteos auditados |
| Lifecycle Dux | reserva, consulta, liberación y finalización demostradas |
| Mercado Pago sandbox | preferencia, firma y estados verificados |
| Comercio productivo | flags, deployment, webhook y prueba autorizada |

No declarar una fila como cumplida usando evidencia de otra.
