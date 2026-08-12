# Estado actual

Fecha de revisión: 2026-08-12.

SHA funcional publicado, validado y usado para la activación de Backoffice V2 y analítica manual:

`bcb6ec0956fa46bba95b2bb5aa8b645657202da8`

Este documento separa código, validación, publicación y configuración externa. La analítica está activa y verificada; Checkout Pro continúa expresamente deshabilitado.

## Producto

Shekinah conserva:

- 510 productos;
- 16 categorías;
- precios en ARS;
- activos locales autorizados.

El candidato incorpora:

- carrito persistente;
- fallback manual temporal mediante Link de Pago de Mercado Pago sin monto predefinido;
- pedido pendiente de WhatsApp persistido antes de abrir el canal, con reserva derivada e idempotencia server-side;
- Mercado Pago Checkout Pro por redirección preparado pero todavía deshabilitado;
- pedidos y consulta pública de estado para Checkout Pro;
- webhook de Mercado Pago para Checkout Pro;
- Cloudflare Pages Functions;
- migraciones aditivas de Cloudflare D1 para comercio, fulfillment, catálogo, retención y rate limiting administrativo;
- autenticación administrativa propia con PBKDF2, cookie firmada, login/logout y fallback opcional de Cloudflare Access;
- ABM de productos basado en catálogo canónico más mutaciones y tombstones D1;
- gestión administrativa visual con búsqueda, filtros, miniaturas, estados, editor agrupado y acciones rápidas;
- inventario opcional compatible con productos legacy y disponibilidad efectiva coherente en catálogo, carrito y servidor;
- upload administrativo first-party para JPEG/PNG/WebP mediante R2 configurado y presente en el deployment; el smoke autenticado de imágenes no se repitió en esta activación por no disponer de la credencial en claro;
- analítica first-party con consentimiento;
- evento `manual_payment_click` sin PII, importe ni carrito, separado de `whatsapp_open` y de los estados financieros;
- Backoffice V2 con Resumen, Productos, Pedidos, Analítica y Auditoría, tendencia diaria, detalle bajo demanda y aprobación/rechazo de pedidos WhatsApp pendientes;
- exportaciones administrativas;
- eliminación de sesión analítica.
- feedback contextual y accesible al agregar, ajustar y eliminar productos del carrito, con límites de stock visibles y prevención de borrados ambiguos;
- estados recuperables del retorno de pago y comunicación explícita de verificación, procesamiento y resultado;
- protección de cambios administrativos sin guardar en navegación cliente, historial y cierre de sesión, además de estados `dirty`, `saving`, `uploading`, `deleting`, éxito y error;
- confirmaciones destructivas específicas, gestión de foco y soporte de `Escape` en carrito y backoffice;
- carga administrativa diferenciada de los estados vacíos y disponibilidad manual separada del stock.

## Configuración pública autorizada

Autorización explícita recibida el 2026-08-10:

```text
PUBLIC_SITE_URL=https://shekinah.ar
VITE_WHATSAPP_NUMBER=5492236216559
VITE_MERCADO_PAGO_PAYMENT_LINK=https://link.mercadopago.com.ar/shekinahmoreno
```

El origen canónico de producción es `https://shekinah.ar`. Preview conserva `https://shekinah-7dl.pages.dev`; la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path/query y termina en el apex 200.

El canal manual usa esos datos públicos sin secretos. El Link de Pago continúa sin monto predefinido y separado de Checkout Pro. Antes de abrir WhatsApp, el flujo publicado llama a una Pages Function que recalcula carrito y total, persiste un pedido `channel='whatsapp'` en estado `pending`, sus items y, cuando corresponde, fulfillment determinístico, y reserva el stock disponible. Esto no genera una preferencia ni confirma automáticamente un pago.

No se requiere VPS para este fallback. La arquitectura automatizada tampoco depende de un VPS: su backend previsto son Cloudflare Pages Functions y D1.

## Estado operativo

La presencia del código no implica activación del Checkout Pro automatizado.

Checkout Pro y analítica continúan separados del backoffice. Al cierre de configuración del 2026-08-12:

- Checkout Pro automatizado deshabilitado;
- analítica first-party habilitada en production y preview, siempre opt-in;
- fallback manual de Link de Pago autorizado en el código;
- WhatsApp manual autorizado en el código;
- D1, binding y migraciones `0001` a `0007` están configurados de forma aislada en production y preview;
- la creación de pedidos WhatsApp y las acciones administrativas de aprobar/rechazar están publicadas sobre el SHA funcional `c19d88dc03f9d98c0c615256bda374769bd2b7a7`, con CI y deployment Pages verificados. El smoke público no destructivo alcanzó la creación y comprobó el rechazo controlado sin persistencia; no se ejecutó un alta positiva ni una resolución administrativa autenticada sobre stock real;
- webhook no considerado productivo.

`migrations/0006_analytics_manual_payment_click.sql` está aplicada remotamente en ambas D1. El backoffice queda fuera de la captura mediante defensas en cliente y servidor. Los smokes reales demostraron cero eventos sin consentimiento y tras rechazo, captura consentida de producto/carrito/clic manual/WhatsApp, ausencia de llamadas a preferencias, exclusión de `/admin` y borrado tras revocación. Los datos sintéticos se retiraron después de verificar el contrato y ambas bases terminaron con cero sesiones, eventos y revocaciones de smoke.

El modelo actual mantiene `stockQuantity` opcional: ausencia significa stock no controlado; presencia exige un entero entre `0` y `1.000.000`. `0007` implementa Strategy A para WhatsApp: reservado es la suma de items de pedidos pendientes y disponible es físico menos reservado. La aprobación protegida por D1 resta físicamente una sola vez; el rechazo libera por derivación. No existe expiración automática: un pedido abandonado conserva su reserva hasta que el administrador lo apruebe o rechace.

Las imágenes administrativas del candidato se limitan a JPEG, PNG y WebP de hasta 4 MiB, con magic bytes validados en servidor. La referencia persistida es first-party y los objetos pertenecen a R2; reemplazo y eliminación sólo limpian objetos administrados no referenciados, nunca assets legacy.

## Estado externo verificado

Consulta y configuración autenticadas actualizadas el 2026-08-12, sin registrar IDs de cuenta, correos ni valores secretos:

- el proyecto de Cloudflare Pages se llama exactamente `shekinah`; su dominio técnico es `shekinah-7dl.pages.dev` y el dominio público canónico autorizado es `shekinah.ar`;
- la zona DNS `shekinah.ar` figura `active` en Cloudflare, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`; DNSSEC está deshabilitado y no existe DS en el padre, un estado inicial válido que no provoca `SERVFAIL`;
- el custom domain `shekinah.ar`, su verificación y validación figuran `active`; el apex usa un CNAME proxied a `shekinah-7dl.pages.dev` y responde HTTPS 200 con certificado confiable emitido por Google;
- la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path y query y termina en 200; su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico y no representa un origen;
- el pack Universal está `active`, usa Google Trust Services WE1 y cubre `shekinah.ar` y `*.shekinah.ar`; el handshake de `www` negocia TLS 1.3;
- la rama de producción es `main`, el build es `npm run build:pages`, la salida es `dist` y los deployments automáticos están habilitados; el deployment Pages del SHA funcional `c19d88dc03f9d98c0c615256bda374769bd2b7a7` terminó en `success`;
- producción usa `shekinah-commerce` y preview `shekinah-commerce-preview`, ambas creadas vacías y vinculadas como `DB`;
- `d1_migrations` registra `0001` a `0007` en ambos entornos. Para `0007` se verificaron las tres columnas nuevas de `orders`, los dos índices, los triggers de reserva/transición y cero violaciones en `PRAGMA foreign_key_check`; el smoke sintético rechazado no creó pedidos;
- los cuatro nombres `ADMIN_*` requeridos existen como secretos cifrados separados en production y preview;
- `ANALYTICS_HMAC_SECRET` existe como `secret_text` con valores criptográficamente aleatorios independientes en production y preview; sus valores no se imprimieron ni persistieron;
- `ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENABLED=true` y `ANALYTICS_RETENTION_DAYS=730` están verificados en ambos entornos; `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` permanecen cerrados;
- `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS` están verificados por API con `https://shekinah.ar` en production y `https://shekinah-7dl.pages.dev` en preview; flags y retención permanecen configurados como variables no secretas;
- Zero Trust/Access continúa ausente y se conserva sólo como fallback interno opcional;
- producción y preview usan `Fail closed`;
- existe además un Worker independiente llamado `shekinah`, sin bindings ni variables, que no es el proyecto Pages conectado a `JerePrograma/shekinah`.
- R2 está activo: production reutiliza el bucket existente `shekinah`, preview usa el bucket aislado creado `shekinah-preview` y Pages vincula ambos como `CATALOG_IMAGES` en su entorno correspondiente;
- ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`; no existe lectura pública directa por `r2.dev`, sólo la ruta first-party de Pages;
- la relectura posterior a configurar R2 confirmó que `DB`, variables, los cuatro nombres `ADMIN_*` y `fail_open=false` permanecen sin cambios en production y preview.

La evidencia histórica de Backoffice V2 y analítica para el SHA `bcb6ec0956fa46bba95b2bb5aa8b645657202da8` corresponde al workflow `CI`, run `31452548845`, job `Verify`, conclusión `success`. Preview quedó desplegado en `https://ad63cf05.shekinah-7dl.pages.dev` y producción en `https://786bc7fe.shekinah-7dl.pages.dev`, ambos con environment, SHA completo y stage `success` verificados por API; `https://shekinah.ar` respondió 200 sobre el deployment canónico.

La evidencia local del flujo WhatsApp quedó verificada: `npm run verify` aprobó lint, TypeScript, 46 archivos/237 pruebas Vitest, verificadores, build y 24 pruebas Playwright; `npm run build:pages` también aprobó. CI, migraciones, deployment y smoke remoto no destructivo se comprobaron después de la validación funcional.

El código conserva comportamiento fail-closed ante variables ausentes. Pages habilita analítica explícitamente y mantiene comercio cerrado. Los defaults públicos de WhatsApp y Link de Pago autorizados el 2026-08-10 son independientes de esos flags y no habilitan Checkout Pro.

## Arquitectura

- frontend: React, TypeScript estricto y Vite;
- servidor: Cloudflare Pages Functions;
- persistencia automatizada: Cloudflare D1;
- almacenamiento configurado y desplegado para imágenes administradas: Cloudflare R2 mediante `CATALOG_IMAGES`, con `shekinah` en production y `shekinah-preview` en preview; smoke autenticado de imágenes no repetido en esta activación;
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
