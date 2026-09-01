# Shekinah

Aplicación comercial de hierbas, especias, alimentos y productos naturales construida con React, TypeScript estricto, Vite, Cloudflare Pages Functions y Cloudflare D1.

## Autoridades del sistema

La arquitectura objetivo separa responsabilidades sin superponer inventarios:

- **Dux Software** es la única autoridad de identidad externa de inventario, stock físico, depósito, unidad y semántica de cantidad, y debe administrar los pedidos o reservas que afecten existencias.
- **Shekinah** conserva el catálogo editorial —slug, imágenes, descripción, categorías, SEO y texto comercial—, el carrito, la orden local y la coordinación entre proveedores.
- **Mercado Pago** procesa Checkout Pro y aporta el estado financiero autoritativo mediante su API y webhook firmado.
- **Mercado Libre** recibe la sincronización de stock desde Dux. Shekinah no consulta ni modifica Mercado Libre para decidir o reservar inventario.

No se usa Excel para importar stock o construir el mapeo. Tampoco se deducen gramos, kilos, divisibilidad ni presentación a partir de nombres como `50GR`, `100GR` o `1KG`. Las cantidades Dux se conservan como números finitos tal como llegan: no se redondean, truncan ni reinterpretan.

## Estado seguro actual

El repositorio contiene una integración **read-only** con la API oficial Dux v2:

- cliente server-side con `Authorization: Bearer <token>`;
- base `https://erp.duxsoftware.com.ar/WSERP/rest/services`;
- lecturas `GET /v2/empresas`, `GET /v2/sucursales`, `GET /v2/depositos` y `GET /v2/items`;
- paginación del listado con total estable y conteo final exacto, validación defensiva, timeout, serialización mínima de una solicitud cada cinco segundos y tratamiento acotado de `429`/errores transitorios;
- plazo monotónico de siete minutos para la fase de lecturas Dux, máximo de 45 intentos HTTP y corte previo a cualquier payload D1 fuera del límite seguro; el mapping y la publicación D1 posteriores conservan límites propios;
- transporte con `redirect: 'manual'`: nunca sigue una redirección y rechaza cualquier `300`–`399` antes de leer el cuerpo o `Location`;
- snapshot y mapping D1 mediante `0012`, con delta aislado, presupuesto diario conservador de escritura y publicación atómica por generaciones en la migración aditiva `0014_dux_atomic_inventory_snapshots.sql`;
- reconciliación programable por `/api/internal/dux/reconcile`, desactivada hasta completar y auditar un sync administrativo `initial`; unidad/lifecycle siguen siendo bloqueos independientes del comercio;
- diagnóstico Dux en el backoffice, con el inventario observado como sólo lectura.

D1 guarda una observación, el vínculo y auditoría; nunca se convierte en autoridad de stock. Un producto sin vínculo único queda preservado editorialmente, pero no puede venderse con stock desconocido.

El 2026-09-01 el token se verificó directamente contra la API oficial sin persistirlo ni imprimirlo. Los endpoints devolvieron una única empresa (`12862`), una única sucursal (`1`), un depósito habilitado (`25566`) y 743 items; 27 cantidades disponibles eran fraccionarias y 8 no positivas. Esta lectura acredita acceso efectivo, no el nombre comercial del plan contratado.

Las migraciones `0010` a `0013` quedaron aplicadas y verificadas en preview y producción. `0013_remove_local_catalog_stock.sql` eliminó los contadores locales de los documentos editoriales, retiró los triggers que reservaban/consumían ese stock y exige una versión exacta de snapshot Dux en toda línea comercial nueva. En producción limpió 6 documentos sin alterar los 15 pedidos, 30 líneas ni 21 mutaciones editoriales.

Tres reconciliaciones productivas anteriores terminaron `DUX_UNAVAILABLE` antes de procesar items. El diagnóstico desplegado en `f138820` clasificó el fallo como `fetch_exception` sobre `/v2/empresas`, sin estado HTTP del proveedor y después de tres intentos. No existe snapshot Dux productivo ni filas de tenant, inventario o vínculos de pedidos.

Un diagnóstico aislado posterior comprobó que `redirect: 'error'` provocaba esa excepción de Cloudflare antes de exponer headers, mientras `redirect: 'manual'` permitía clasificar la respuesta. El candidato actual adopta el modo manual, rechaza todo `3xx` sin seguirlo, valida la paginación completa y conserva telemetría sanitizada. Cada corrida sigue verificando el universo completo, pero `0014` aísla y publica sólo filas nuevas, modificadas o recién ausentes; una corrida idéntica renueva la frescura global sin reescribir `dux_inventory_items`. Estos cambios están validados localmente, pero al momento de este commit aún falta publicar el SHA, aplicar `0014` y ejecutar el primer sync productivo controlado; el estado remoto continúa sin snapshot y fail-closed.

La salida comercial permanece cerrada:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

Permanecen bloqueos deliberados:

1. la corrección del transporte de Pages todavía debe desplegarse y demostrarse mediante un sync productivo controlado;
2. la API pública revisada no documenta un ciclo seguro para cancelar/liberar/finalizar o vencer una reserva creada por pedido y `GET /v2/items` no publica unidad, pesabilidad, divisibilidad ni una regla de decimales suficiente para habilitar venta;
3. el mapping aún no pudo validarse contra un snapshot real: respeta vínculo persistido, código externo, SKU/variante y barcode exacto; sólo en el bootstrap inicial admite una clave de nombre conservadora con tokens completos de presentación, vetos de contradicción y ambigüedad cerrada. No aplica fuzzy matching, sinónimos, singularización ni aritmética de packs.

La canonicalización de presentación se usa exclusivamente para comparar identidad durante ese bootstrap. Nunca infiere unidad comercial, pesabilidad, divisibilidad, paso comprable, peso de envío ni transforma las cantidades de stock recibidas de Dux.

Por esas razones el backend bloquea Checkout Pro y WhatsApp antes de crear una preferencia, abrir el canal o mutar inventario. No se crearon pedidos, pagos ni reservas Dux. Un build correcto no habilita el comercio.

## Funcionalidad

- catálogo editorial, búsqueda, filtros, paginación y fichas individuales;
- carrito persistente y sincronizado entre pestañas;
- datos de entrega sin PII en `localStorage`;
- retiro, entrega coordinada y cálculo autoritativo de Correo Argentino donde el catálogo dispone de metadatos válidos;
- Mercado Pago Checkout Pro preparado por redirección y webhook, actualmente cerrado por la dependencia Dux;
- pedidos y backoffice sobre D1;
- gestión de imágenes administrativas first-party mediante R2;
- analítica first-party consentida;
- política de privacidad, accesibilidad y vista 404.

El navegador nunca decide precios, stock, unidad, peso, envío, moneda ni totales. Dux se consulta exclusivamente desde Pages Functions; el token no llega al bundle.

## Rutas públicas

- `/`: inicio;
- `/catalogo`: catálogo;
- `/carrito`: carrito y datos de entrega;
- `/privacidad`: política y controles de analítica;
- `/pago/exito`, `/pago/pendiente`, `/pago/error`: retornos que consultan el estado persistido y nunca prueban por sí solos un pago;
- `/<slug>/`: ficha de producto;
- `/tienda/categoria/<slug>/`: categoría;
- cualquier otra dirección, incluida `/enfoque`: vista 404.

`/admin` no aparece en la navegación y exige una sesión validada por el servidor. El backoffice mantiene el ABM editorial y presenta el estado Dux sin permitir editar el stock de un producto gobernado por Dux.

## Desarrollo

Requisitos:

- Node.js `24.18.0`;
- npm `>=11.0.0`.

```bash
npm ci
npm run install:browsers
npm run dev
```

No se ejecutan llamadas a Dux durante el build. Los tests usan contratos y dobles controlados.

## Validación

```bash
npm run verify
npm run build:pages
git diff --check
git diff --cached --check
```

`npm run verify` ejecuta ESLint, TypeScript, Vitest, verificadores del repositorio, build y Playwright.

## Configuración segura

Los defaults y la configuración efectiva final continúan cerrados. El token Dux y los secretos de Mercado Pago se cargan sólo como secretos cifrados de Cloudflare Pages y nunca con prefijo `VITE_`. El valor del token no se guarda en Git, D1, logs, respuestas ni bundles.

Variables Dux server-side previstas:

```text
DUX_API_ENABLED=false
DUX_COMPANY_ID=12862
DUX_BRANCH_ID=1
DUX_DEPOSIT_ID=25566
DUX_SNAPSHOT_MAX_AGE_SECONDS=900
```

Secretos Dux:

```text
DUX_API_TOKEN
DUX_SCHEDULER_SECRET
```

El ID de vendedor Mercado Libre `445638367` y el ID de usuario Dux `3851` aportados por el cliente no se reutilizan como empresa, sucursal, depósito o personal. Esos identificadores deben resolverse mediante los endpoints oficiales y validarse contra la cuenta autorizada.

Consultar `docs/FULL_STACK_COMMERCE.md`, `docs/COMMERCE_DEPLOYMENT.md` y `docs/COMMERCE_OPERATIONS.md` antes de configurar un entorno. Tener código en `main`, CI verde, migraciones aplicadas o un deployment Pages no demuestra que exista un snapshot Dux operativo.

## Producción

Cloudflare Pages debe conservar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- Node.js: `24.18.0`;
- npm: `11.6.0`, con instalación automática de dependencias desactivada mediante `SKIP_DEPENDENCY_INSTALL` y el comando de instalación fijado explícitamente;
- dominio público canónico: `https://shekinah.ar`.

El cierre del 2026-09-01 partió de `d723f250ec3ef84abfa78bf66675248271106326`. La instrumentación funcional `f138820` aprobó CI `#416`; el deployment productivo canónico `8781412e-629b-4473-8081-89c6fbc1ffec` completó el build con npm `11.6.0`. El commit funcional `39ab007` elimina la autoridad local de stock y acompaña la migración `0013` ya aplicada. El estado remoto previo a este candidato es `2bbd62f547b9b0de84f8794a6dcf679ef07a7df8`: `0014` todavía no está aplicada, no existe snapshot productivo y los flags Dux, comercio, Mercado Libre directo y scheduler siguen en `false`.

La CSP mantiene `connect-src 'self'`: el frontend usa APIs first-party y las conexiones con Dux y Mercado Pago ocurren exclusivamente desde Pages Functions. La integración directa de inventario Mercado Libre queda retirada y sus tablas históricas se conservan sin participar del flujo productivo.
