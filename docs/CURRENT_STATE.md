# Estado actual

Fecha de revisión: 2026-08-24.

## Actualización Mercado Libre y retiro del importe manual

El código vigente incorpora la arquitectura descrita en `docs/MERCADO_LIBRE_CATALOG_AND_STOCK.md`: OAuth con tokens rotativos cifrados, seller esperado, paginación y lotes, variaciones, mapeo exacto por SKU, espejo D1, umbral de 300 segundos, notificaciones como disparadores, reservas upstream con `x-version`, compensación idempotente y backoffice de diagnóstico.

El flujo público de Link de Pago, copia del total e ingreso manual de importe fue retirado. El carrito conserva **Pagar con Mercado Pago** como única acción de pago; cuando los flags están cerrados se muestra deshabilitada, sin enlace alternativo. `manual_payment_click` permanece sólo como dato analítico histórico.

La producción continúa cerrada mediante:

```text
MERCADO_LIBRE_CATALOG_ENABLED=false
VITE_MERCADO_LIBRE_CATALOG_ENABLED=false
COMMERCE_ENABLED=false
VITE_COMMERCE_ENABLED=false
```

No se afirma que Mercado Libre esté conectado ni que el catálogo real esté sincronizado: el seller, IDs, cantidades y modalidades sólo podrán documentarse después de completar la vinculación/OAuth humana. Tampoco se afirma rotación final de Mercado Pago: el panel exige verificación alternativa después de alcanzar el límite de intentos. Ningún producto se habilita por defecto y no se ejecutó un pago monetario real.

Las secciones posteriores preservan evidencia operativa e histórica previa. Cuando mencionan el fallback manual como activo describen un deployment anterior y quedan reemplazadas por esta actualización para el estado funcional nuevo.

SHA funcional publicado y validado para conciliación autoritativa de Mercado Pago:

`0f93d620faad6e93f76a364e9dc6794ac5c5f119`

Este documento separa código, validación, publicación y configuración externa. La analítica y WhatsApp están activos; el fallback de importe manual fue retirado y Checkout Pro continúa expresamente deshabilitado hasta completar la integración nueva.

## Producto

Shekinah conserva:

- 510 productos;
- 16 categorías;
- precios en ARS;
- activos locales autorizados.

La aplicación incorpora:

- carrito persistente;
- Checkout Pro directo sin importe manual, cerrado por flags;
- pedido pendiente de WhatsApp persistido antes de abrir el canal, con datos mínimos obligatorios, reserva derivada e idempotencia server-side sin PII en Web Storage;
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
- Backoffice V2 con Resumen, Productos, Pedidos, Analítica y Auditoría, tendencia diaria, detalle bajo demanda, aprobación/rechazo de pedidos WhatsApp pendientes y conciliación autoritativa de Checkout Pro;
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
```

El origen canónico de producción es `https://shekinah.ar`. Preview conserva `https://shekinah-7dl.pages.dev`; la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path/query y termina en el apex 200.

WhatsApp usa el dato público autorizado sin secretos. Antes de abrirlo, el flujo llama a una Pages Function que recalcula carrito y total, persiste un pedido `channel='whatsapp'` en estado `pending`, sus items y, cuando corresponde, fulfillment determinístico, y reserva el stock disponible. Esto no genera una preferencia ni confirma automáticamente un pago.

No se requiere VPS para este fallback. La arquitectura automatizada tampoco depende de un VPS: su backend previsto son Cloudflare Pages Functions y D1.

## Estado operativo

La presencia del código no implica activación del Checkout Pro automatizado.

Checkout Pro y analítica continúan separados del backoffice. Al cierre funcional del 2026-08-22:

- Checkout Pro automatizado deshabilitado;
- analítica first-party habilitada en production y preview, siempre opt-in;
- Link de Pago manual retirado del código público;
- WhatsApp manual autorizado en el código;
- D1, binding y migraciones `0001` a `0008` están configurados de forma aislada en production y preview;
- el SHA funcional `58ff324133cf665baacf946f54e960cd3d519398` tiene CI `32584798635` y check de Cloudflare Pages en `success`; producción lo publicó en `https://6483757c.shekinah-7dl.pages.dev`;
- el smoke público no destructivo comprobó sitio 200, checkout integrado 503 `COMMERCE_DISABLED`, pedido WhatsApp inválido 400 `PRODUCT_NOT_FOUND` y cero pedidos persistidos con sus claves sintéticas;
- la aplicación real de Mercado Pago conserva las URLs de Webhook esperadas y prueba/producción quedaron suscriptas únicamente a `Pagos`, el tópico procesado por la Function;
- el Access Token y Client Secret expuestos fueron renovados; el nuevo token productivo quedó cifrado sólo en Pages production, el token sandbox de preview permaneció intacto y la clave firmada vigente quedó reconciliada cifrada en ambos entornos;
- la calidad figura `0/100` y no existe todavía evidencia de un pago productivo válido, por lo que los flags públicos permanecen cerrados.

La conciliación autoritativa se publicó en el SHA `0f93d620faad6e93f76a364e9dc6794ac5c5f119`: CI `32605619627`, job `97110114994`, y deployment productivo `53f7208f-3fa4-4127-9106-90c1f8632c62` concluyeron correctamente. El smoke comprobó apex e URL inmutable 200, checkout 503 `COMMERCE_DISABLED`, webhook inválido 401 y conciliación anónima 401. Preview se restauró con D1/R2 aislados y volvió a reproducir la preferencia sandbox existente con 200 e identidad idempotente. El pago simulado continúa pendiente porque Mercado Pago exige reautenticación humana por QR o código; no se afirma pago, webhook firmado ni consumo remoto.

`migrations/0006_analytics_manual_payment_click.sql` está aplicada remotamente en ambas D1. El backoffice queda fuera de la captura mediante defensas en cliente y servidor. Los smokes reales demostraron cero eventos sin consentimiento y tras rechazo, captura consentida de producto/carrito/clic manual/WhatsApp, ausencia de llamadas a preferencias, exclusión de `/admin` y borrado tras revocación. Los datos sintéticos se retiraron después de verificar el contrato y ambas bases terminaron con cero sesiones, eventos y revocaciones de smoke.

El modelo actual mantiene `stockQuantity` opcional: ausencia significa stock no controlado; presencia exige un entero entre `0` y `1.000.000`. `0008` comparte disponibilidad entre WhatsApp pendiente y Checkout Pro con preferencia vigente o pago pendiente autoritativo. Checkout Pro reserva durante 30 minutos, un pago pendiente prolonga la reserva y `approved` o `refunded` consume el físico exactamente una vez; un reembolso no repone mercadería automáticamente. Los pedidos WhatsApp nuevos reservan durante 24 horas, aprobación consume y rechazo o vencimiento libera de forma idempotente; la UI exige consentimiento explícito y sólo pide domicilio para Correo Argentino.

La revisión autenticada de Cloudflare del 2026-08-23 confirmó el deployment base `bc18e32f-2d8d-4008-b185-5e6ac3c7e874` para `9bc6625`, D1 `0001` a `0008` sin pendientes, secretos requeridos presentes como cifrados en production y preview, y separación de flags/bindings. El smoke base verificó apex 200, `www` 301, URL inmutable 200, webhook GET 405/`Allow: POST` y preferencias 503 `COMMERCE_DISABLED`. La auditoría productiva combinada dio 513 productos efectivos: 512 vendibles, 6 con stock numérico, 507 sin control numérico, 1 agotado, 0 inválidos/negativos y 0 deshabilitados.

La reautenticación del titular de Mercado Pago se completó mediante QR sin compartir códigos. El panel confirmó Webhooks de prueba y producción en sus URLs correctas, sólo con el tópico **Pagos** y clave de firma presente en ambos modos. La evaluación vigente continúa en 0/100 y muestra una fecha inválida de 1900, por lo que no aporta evidencia de una prueba productiva real. El panel tampoco expone una fecha útil de rotación. Además, durante la inspección el DOM reveló una credencial sandbox; se la considera comprometida y no debe reutilizarse. Checkout Pro permanece cerrado hasta rotar credenciales, sincronizar el secreto de cada entorno y completar las pruebas de pago exigidas.

El webhook y la conciliación administrativa verifican además el modo `live_mode`, la identidad notificadora frente al `collector_id` consultado y `metadata.order_id` frente a la orden interna. La acción del backoffice busca por `external_reference`, vuelve a consultar cada pago y reutiliza la misma persistencia idempotente; no permite asignar estados manualmente. El detalle administrativo hace visibles la reserva, su vencimiento, el consumo y si cada item estaba o no bajo control numérico.

Las imágenes administrativas del candidato se limitan a JPEG, PNG y WebP de hasta 4 MiB, con magic bytes validados en servidor. La referencia persistida es first-party y los objetos pertenecen a R2; reemplazo y eliminación sólo limpian objetos administrados no referenciados, nunca assets legacy.

## Estado externo verificado

Consulta y configuración autenticadas actualizadas el 2026-08-22, sin registrar valores secretos:

- el proyecto de Cloudflare Pages se llama exactamente `shekinah`; su dominio técnico es `shekinah-7dl.pages.dev` y el dominio público canónico autorizado es `shekinah.ar`;
- la zona DNS `shekinah.ar` figura `active` en Cloudflare, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`; DNSSEC está deshabilitado y no existe DS en el padre, un estado inicial válido que no provoca `SERVFAIL`;
- el custom domain `shekinah.ar`, su verificación y validación figuran `active`; el apex usa un CNAME proxied a `shekinah-7dl.pages.dev` y responde HTTPS 200 con certificado confiable emitido por Google;
- la Bulk Redirect HTTPS de `www.shekinah.ar` responde `301` al apex, preserva path y query y termina en 200; su A proxied `192.0.2.1` es el placeholder oficial para que la regla reciba tráfico y no representa un origen;
- el pack Universal está `active`, usa Google Trust Services WE1 y cubre `shekinah.ar` y `*.shekinah.ar`; el handshake de `www` negocia TLS 1.3;
- la rama de producción es `main`, el build es `npm run build:pages`, la salida es `dist` y los deployments automáticos están habilitados; el check Pages del SHA funcional `58ff324133cf665baacf946f54e960cd3d519398` terminó en `success` y el deployment `6483757c-5d46-4559-a6b4-d22caab70d16` quedó activo;
- producción usa `shekinah-commerce` y preview `shekinah-commerce-preview`, aisladas y vinculadas como `DB`;
- `d1_migrations` registra `0001` a `0008` en ambos entornos. Para `0008` se verificaron cuatro columnas nuevas de `orders`, `order_items.stock_controlled`, los once triggers agregados o reemplazados, conteos preservados y cero violaciones en `PRAGMA foreign_key_check`;
- preview rechazó remotamente una segunda reserva sintética de la última unidad con `STOCK_RESERVATION_INSUFFICIENT`; luego se eliminaron producto, pedidos e items técnicos y se confirmaron los conteos originales;
- los cuatro nombres `ADMIN_*` requeridos existen como secretos cifrados separados en production y preview;
- `ANALYTICS_HMAC_SECRET` existe como `secret_text` con valores criptográficamente aleatorios independientes en production y preview; sus valores no se imprimieron ni persistieron;
- `ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENABLED=true` y `ANALYTICS_RETENTION_DAYS=730` están verificados en ambos entornos; producción conserva `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`;
- preview usa `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS` en `https://mp-sandbox.shekinah-7dl.pages.dev`, `COMMERCE_ENABLED=true`, `VITE_COMMERCE_ENABLED=false` y modo `sandbox`; producción usa `https://shekinah.ar`, ambos flags en `false` y modo `production`;
- producción contiene `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `ORDER_TOKEN_SECRET` como valores cifrados; el primero fue reemplazado con el token productivo renovado y el segundo fue reconciliado en production y preview con la clave vigente de Mercado Pago, sin imprimir valores;
- Zero Trust/Access continúa ausente y se conserva sólo como fallback interno opcional;
- producción y preview usan `Fail closed`;
- existe además un Worker independiente llamado `shekinah`, sin bindings ni variables, que no es el proyecto Pages conectado a `JerePrograma/shekinah`.
- R2 está activo: production reutiliza el bucket existente `shekinah`, preview usa el bucket aislado creado `shekinah-preview` y Pages vincula ambos como `CATALOG_IMAGES` en su entorno correspondiente;
- ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`; no existe lectura pública directa por `r2.dev`, sólo la ruta first-party de Pages;
- la relectura posterior a configurar R2 confirmó que `DB`, variables, los cuatro nombres `ADMIN_*` y `fail_open=false` permanecen sin cambios en production y preview.

La evidencia histórica de Backoffice V2 y analítica para el SHA `bcb6ec0956fa46bba95b2bb5aa8b645657202da8` corresponde al workflow `CI`, run `31452548845`, job `Verify`, conclusión `success`. Preview quedó desplegado en `https://ad63cf05.shekinah-7dl.pages.dev` y producción en `https://786bc7fe.shekinah-7dl.pages.dev`, ambos con environment, SHA completo y stage `success` verificados por API; `https://shekinah.ar` respondió 200 sobre el deployment canónico.

La evidencia local del cierre 2026-08-22 quedó verificada: `npm run verify` aprobó lint, TypeScript, 46 archivos/251 pruebas Vitest, verificadores, build y 24 pruebas Playwright; `npm run build:pages` también aprobó. CI, migraciones, deployment y smoke remoto no destructivo se comprobaron después de la validación funcional.

El código conserva comportamiento fail-closed ante variables ausentes. Pages habilita analítica explícitamente, mantiene comercio cerrado y conserva únicamente el default público autorizado de WhatsApp.

## Arquitectura

- frontend: React, TypeScript estricto y Vite;
- servidor: Cloudflare Pages Functions;
- persistencia automatizada: Cloudflare D1;
- almacenamiento configurado y desplegado para imágenes administradas: Cloudflare R2 mediante `CATALOG_IMAGES`, con `shekinah` en production y `shekinah-preview` en preview; smoke autenticado de imágenes no repetido en esta activación;
- pagos automatizados: Mercado Pago Checkout Pro;
- canal asistido: pedido WhatsApp reservado, sin Link de Pago;
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
9. estado público de Checkout Pro y WhatsApp;
10. pruebas de humo.

Ninguna etapa demuestra automáticamente la siguiente.
