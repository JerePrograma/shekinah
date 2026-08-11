# Estado actual

Fecha de revisión: 2026-08-10.

Base sincronizada y verificada antes del candidato de UX, inventario e imágenes:

`a543c39c025a952f632f38c6bf97b4ea3501b0d1`

Este documento describe el candidato de código integrado en el checkout. Su publicación, despliegue, configuración externa y activación productiva requieren evidencias separadas.

## Producto

Shekinah conserva:

- 510 productos;
- 16 categorías;
- precios en ARS;
- activos locales autorizados.

El candidato incorpora:

- carrito persistente;
- fallback manual temporal mediante Link de Pago de Mercado Pago sin monto predefinido;
- WhatsApp manual con número público expresamente autorizado;
- Mercado Pago Checkout Pro por redirección preparado pero todavía deshabilitado;
- pedidos y consulta pública de estado para Checkout Pro;
- webhook de Mercado Pago para Checkout Pro;
- Cloudflare Pages Functions;
- migraciones aditivas de Cloudflare D1 para comercio, fulfillment, catálogo, retención y rate limiting administrativo;
- autenticación administrativa propia con PBKDF2, cookie firmada, login/logout y fallback opcional de Cloudflare Access;
- ABM de productos basado en catálogo canónico más mutaciones y tombstones D1;
- gestión administrativa visual con búsqueda, filtros, miniaturas, estados, editor agrupado y acciones rápidas;
- inventario opcional compatible con productos legacy y disponibilidad efectiva coherente en catálogo, carrito y servidor;
- upload administrativo first-party preparado para JPEG/PNG/WebP mediante R2 ya configurado, pendiente de deployment y smoke del candidato;
- analítica first-party con consentimiento;
- exportaciones administrativas;
- eliminación de sesión analítica.

## Configuración pública autorizada

Autorización explícita recibida el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

El origen canónico de producción es `https://shekinah.ar`. Preview conserva `https://shekinah-7dl.pages.dev`; la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path/query y termina en el apex 200.

El fallback manual usa esos datos públicos sin secretos. Cuando `VITE_COMMERCE_ENABLED` no vale `true`, el carrito puede copiar el total calculado y abrir el Link de Pago; el comprador ingresa el monto en Mercado Pago y debe enviar el carrito por WhatsApp para que el comercio pueda asociar el pago y coordinar la entrega. Este flujo no crea pedidos en D1, no genera una preferencia de Checkout Pro y no confirma automáticamente pagos.

No se requiere VPS para este fallback. La arquitectura automatizada tampoco depende de un VPS: su backend previsto son Cloudflare Pages Functions y D1.

## Estado operativo

La presencia del código no implica activación del Checkout Pro automatizado.

Checkout Pro y analítica continúan separados del backoffice. Al cierre de configuración del 2026-08-10:

- Checkout Pro automatizado deshabilitado;
- analítica deshabilitada;
- fallback manual de Link de Pago autorizado en el código;
- WhatsApp manual autorizado en el código;
- D1, binding, migraciones y secretos administrativos están configurados de forma aislada en production y preview;
- la administración quedó operativa tras verificar por separado CI, deployment, login, logout y smoke ABM sobre `7f93e29ad64f081b2dd1efe7f3c4c4b53e081225`; el catálogo es editable y pedidos/analítica permanecen de sólo lectura;
- webhook no considerado productivo.

El candidato posterior a `a543c39c025a952f632f38c6bf97b4ea3501b0d1` usa `stockQuantity` opcional: ausencia significa stock no controlado; presencia exige un entero entre `0` y `1.000.000`. La disponibilidad efectiva es disponibilidad manual activa y, además, stock no controlado o mayor que cero. El carrito aplica `min(99, stockQuantity)` y el servidor revalida antes del Checkout Pro. No existe reserva ni decremento automático por venta.

Las imágenes administrativas del candidato se limitan a JPEG, PNG y WebP de hasta 4 MiB, con magic bytes validados en servidor. La referencia persistida es first-party y los objetos pertenecen a R2; reemplazo y eliminación sólo limpian objetos administrados no referenciados, nunca assets legacy.

## Estado externo verificado

Consulta y configuración autenticadas realizadas el 2026-08-10, sin registrar IDs de cuenta, correos ni valores secretos:

- el proyecto de Cloudflare Pages se llama exactamente `shekinah`; su dominio técnico es `shekinah-7dl.pages.dev` y el dominio público canónico autorizado es `shekinah.ar`;
- la zona DNS `shekinah.ar` figura `active` en Cloudflare, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`; DNSSEC está deshabilitado y no existe DS en el padre, un estado inicial válido que no provoca `SERVFAIL`;
- el custom domain `shekinah.ar`, su verificación y validación figuran `active`; el apex usa un CNAME proxied a `shekinah-7dl.pages.dev` y responde HTTPS 200 con certificado confiable emitido por Google;
- la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path y query y termina en 200; su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico y no representa un origen;
- el pack Universal está `active`, usa Google Trust Services WE1 y cubre `shekinah.ar` y `*.shekinah.ar`; el handshake de `www` negocia TLS 1.3;
- la rama de producción es `main`, el build es `npm run build:pages`, la salida es `dist` y los deployments automáticos están habilitados;
- producción usa `shekinah-commerce` y preview `shekinah-commerce-preview`, ambas creadas vacías y vinculadas como `DB`;
- `d1_migrations` registra `0001` a `0005` en ambos entornos; `0004_catalog_admin.sql` y `0005_admin_auth.sql` están aplicadas;
- los cuatro nombres `ADMIN_*` requeridos existen como secretos cifrados separados en production y preview;
- `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS` están verificados por API con `https://shekinah.ar` en production y `https://shekinah-7dl.pages.dev` en preview; los flags cerrados y la retención permanecen configurados como variables no secretas;
- Zero Trust/Access continúa ausente y se conserva sólo como fallback interno opcional;
- producción y preview usan `Fail closed`;
- existe además un Worker independiente llamado `shekinah`, sin bindings ni variables, que no es el proyecto Pages conectado a `JerePrograma/shekinah`.
- R2 está activo: production reutiliza el bucket existente `shekinah`, preview usa el bucket aislado creado `shekinah-preview` y Pages vincula ambos como `CATALOG_IMAGES` en su entorno correspondiente;
- ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`; no existe lectura pública directa por `r2.dev`, sólo la ruta first-party de Pages;
- la relectura posterior a configurar R2 confirmó que `DB`, variables, los cuatro nombres `ADMIN_*` y `fail_open=false` permanecen sin cambios en production y preview.

La última evidencia externa anterior al candidato corresponde al SHA `a543c39c025a952f632f38c6bf97b4ea3501b0d1`: CI `31429695666` y deployment Pages `62f735c6-0611-43a0-b5d9-eedf7d857234`, ambos `success`. No existe todavía CI, deployment ni smoke remoto del candidato actual.

El candidato sin SHA final sí tiene evidencia local: `npm run verify` aprobó lint, TypeScript, 39 archivos/179 pruebas Vitest, verificadores, build y 14 pruebas Playwright; `npm run build:pages` también aprobó. Esta evidencia local no habilita el upload productivo ni reemplaza CI, deployment y smoke del SHA definitivo.

Los flags server-side permanecen cerrados por el comportamiento fail-closed del código ante variables ausentes. Los defaults públicos de WhatsApp y Link de Pago autorizados el 2026-08-10 son independientes de esos flags y no habilitan Checkout Pro.

## Arquitectura

- frontend: React, TypeScript estricto y Vite;
- servidor: Cloudflare Pages Functions;
- persistencia automatizada: Cloudflare D1;
- almacenamiento configurado para imágenes administradas: Cloudflare R2 mediante `CATALOG_IMAGES`, con `shekinah` en production y `shekinah-preview` en preview; deployment y smoke del candidato pendientes;
- pagos automatizados: Mercado Pago Checkout Pro;
- fallback temporal: Link de Pago manual más WhatsApp;
- administración: credencial propia y sesión firmada; Cloudflare Access opcional como fallback interno;
- analítica: first-party basada en consentimiento.

Consultar:

- `docs/FULL_STACK_COMMERCE.md`;
- `docs/COMMERCE_OPERATIONS.md`;
- `docs/COMMERCE_DEPLOYMENT.md`;
- `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

## Calidad

Entorno canónico:

- Node.js `24.18.0`;
- npm `>=11.0.0`;
- TypeScript estricto;
- ESLint;
- Vitest;
- Playwright;
- verificadores de catálogo, seguridad y automatización.

## Separación de estados

Toda continuidad debe distinguir:

1. código integrado;
2. validación local;
3. commit y push;
4. GitHub Actions;
5. deployment de Pages;
6. D1 y migraciones;
7. secretos y bindings;
8. activación de Checkout Pro productivo;
9. fallback manual público;
10. pruebas de humo.

Ninguna etapa demuestra automáticamente la siguiente.
