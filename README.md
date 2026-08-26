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
- paginación del listado, validación defensiva, timeout, serialización mínima de una solicitud cada cinco segundos y tratamiento acotado de `429`/errores transitorios;
- snapshot y mapeo exacto en D1 mediante `migrations/0012_dux_authoritative_inventory.sql`;
- reconciliación programable por `/api/internal/dux/reconcile`, desactivada hasta contar con acceso y configuración verificados;
- diagnóstico Dux en el backoffice, con el inventario observado como sólo lectura.

D1 guarda una observación, el vínculo y auditoría; nunca se convierte en autoridad de stock. Un producto sin vínculo único queda preservado editorialmente, pero no puede venderse con stock desconocido.

La salida comercial permanece cerrada:

```text
DUX_API_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
```

Hay dos bloqueos externos deliberados:

1. la cuenta aportada muestra **Plan ESTÁNDAR** y la documentación Dux exige PRO o FULL para usar la API; se necesita upgrade y token;
2. la API pública revisada no documenta un ciclo seguro para cancelar/liberar/finalizar o vencer una reserva creada por pedido. Además, `GET /v2/items` no publica unidad, pesabilidad, divisibilidad ni una regla de decimales suficiente para habilitar venta.

Por esas razones el backend bloquea Checkout Pro y WhatsApp antes de crear una preferencia, abrir el canal o mutar inventario. No se crean pedidos Dux reales mientras soporte Dux no confirme oficialmente el lifecycle completo. Un build correcto no habilita el comercio.

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

Los defaults continúan cerrados. El token Dux y los secretos de Mercado Pago se cargan sólo como secretos cifrados de Cloudflare Pages y nunca con prefijo `VITE_`.

Variables Dux server-side previstas:

```text
DUX_API_ENABLED=false
DUX_COMPANY_ID=<obtenido de GET /v2/empresas>
DUX_BRANCH_ID=<obtenido de GET /v2/sucursales>
DUX_DEPOSIT_ID=<obtenido de GET /v2/depositos>
DUX_SNAPSHOT_MAX_AGE_SECONDS=900
```

Secretos Dux:

```text
DUX_API_TOKEN
DUX_SCHEDULER_SECRET
```

El ID de vendedor Mercado Libre `445638367` y el ID de usuario Dux `3851` aportados por el cliente no se reutilizan como empresa, sucursal, depósito o personal. Esos identificadores deben resolverse mediante los endpoints oficiales y validarse contra la cuenta autorizada.

Consultar `docs/FULL_STACK_COMMERCE.md`, `docs/COMMERCE_DEPLOYMENT.md` y `docs/COMMERCE_OPERATIONS.md` antes de configurar un entorno. Tener código en `main`, CI verde o un deployment Pages no demuestra que Dux, la migración ni los secretos estén operativos.

## Producción

Cloudflare Pages debe conservar:

- repositorio: `JerePrograma/shekinah`;
- rama: `main`;
- comando: `npm run build:pages`;
- salida: `dist`;
- Node.js: `24.18.0`;
- dominio público canónico: `https://shekinah.ar`.

La CSP mantiene `connect-src 'self'`: el frontend usa APIs first-party y las conexiones con Dux y Mercado Pago ocurren exclusivamente desde Pages Functions. La integración directa de inventario Mercado Libre queda retirada y sus tablas históricas se conservan sin participar del flujo productivo.
