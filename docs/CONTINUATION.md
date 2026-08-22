# Continuación

## Fuente de verdad

Trabajar exclusivamente sobre el estado real de `main` y `origin/main`.

Antes de modificar:

```bash
git status
git switch main
git fetch origin
git pull --ff-only origin main
```

## Estado funcional esperado

El repositorio contiene una evolución full-stack basada en:

- React, TypeScript estricto y Vite;
- Cloudflare Pages Functions;
- Cloudflare D1;
- Mercado Pago Checkout Pro con reserva de stock D1 ligada a preferencia y pago, preparado pero no activado públicamente;
- Link de Pago manual y pedido pendiente de WhatsApp con datos obligatorios y reserva de stock en D1;
- autenticación administrativa propia y Cloudflare Access opcional;
- backoffice visual de catálogo con stock opcional e imágenes administradas preparadas para R2;
- Backoffice V2 separado en Resumen, Productos, Pedidos, Analítica y Auditoría;
- detalle de pedidos, resolución administrativa limitada a aprobar/rechazar pendientes de WhatsApp y conciliación de Checkout Pro exclusivamente contra Mercado Pago;
- analítica first-party opcional con `manual_payment_click` para el fallback manual.
- feedback de interacción contextual y accesible en catálogo, carrito, retorno de pago y ABM administrativo;
- protección de cambios sin guardar y operaciones administrativas activas frente a navegación o cierre de sesión.

Consultar primero:

1. `AGENTS.md`;
2. `docs/CODEX_AUTORREFERENCIA.md`;
3. `docs/CURRENT_STATE.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/FULL_STACK_COMMERCE.md`;
6. `docs/FULFILLMENT_AND_RETENTION.md`;
7. `docs/COMMERCE_OPERATIONS.md`;
8. `docs/COMMERCE_DEPLOYMENT.md`;
9. `docs/COMMERCE_INCIDENTS_AND_ROLLBACK.md`.

## Regla de activación

No habilitar Checkout Pro, analítica ni nuevas capacidades externas por el solo hecho de que el código compile.

La activación de Checkout Pro requiere evidencia separada de:

- D1 creado y vinculado;
- migraciones aplicadas;
- secretos cargados sin exposición;
- credenciales de Mercado Pago válidas;
- webhook con URL definitiva;
- suscripción exclusiva al tópico de pagos que procesa el endpoint;
- pago controlado de un comprador distinto de la cuenta vendedora, con webhook firmado, referencia, importe, moneda, estado D1 y stock conciliados;
- autenticación administrativa propia configurada y probada;
- pruebas de humo aprobadas.

### Autorización manual vigente

El 2026-08-10 quedaron expresamente autorizados como datos públicos actuales:

```text
Sitio canónico de producción: https://shekinah.ar/
WhatsApp: +549 2236 21-6559
Link de Pago: https://link.mercadopago.com.ar/shekinahmoreno
```

El código puede usar el WhatsApp normalizado `5492236216559` y el Link de Pago como fallback manual mientras `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`. La analítica se activó de forma separada siguiendo la secuencia validación → `0006` → secretos independientes → deployment del SHA exacto → smoke preview → production. Esta autorización y activación no habilitan Checkout Pro ni webhooks.

El canal manual no requiere VPS. El flujo publicado registra el pedido y reserva stock mediante Pages Functions y D1 antes de abrir WhatsApp; el Link de Pago continúa separado y no confirma el cobro.

## Identidad externa verificada

- Proyecto Pages: `shekinah`.
- Dominio canónico de producción: `shekinah.ar`.
- Dominio técnico de Pages y origen de preview: `shekinah-7dl.pages.dev`.
- `www.shekinah.ar`: Bulk Redirect HTTPS `301` al apex verificada, con path y query preservados y destino final 200.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Existe un Worker independiente también llamado `shekinah`; no usar sus settings para configurar Pages.

La zona DNS `shekinah.ar` figura `active` en Cloudflare y usa `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`. DNSSEC está deshabilitado sin DS publicado en `.ar`, estado coherente y sin riesgo de validación rota. El custom domain del apex, su verificación y validación están `active`; el CNAME proxied apunta al dominio técnico de Pages y el apex responde HTTPS 200 con TLS confiable emitido por Google. La Bulk Redirect HTTPS de `www` responde `301`, preserva path/query y termina en el apex 200; el A proxied `192.0.2.1` es sólo el placeholder oficial para que la regla reciba tráfico, nunca un origen. El pack Universal está activo, usa Google Trust Services WE1, cubre el apex y `*.shekinah.ar`, y el handshake negocia TLS 1.3.

La configuración autenticada confirma dos D1 aisladas (`shekinah-commerce` y `shekinah-commerce-preview`), binding `DB`, migraciones remotas `0001` a `0008`, secretos cifrados y `Fail closed` en production/preview. `ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENABLED=true` y retención `730` están activos en ambos; producción mantiene `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`. Preview usa el origen sandbox autorizado, backend habilitado, botón público oculto y modo `sandbox`. El Worker homónimo permaneció intacto.

`migrations/0007_whatsapp_order_reservations.sql` fue aplicada el 2026-08-12 primero en preview y luego en producción mediante el import autenticado de D1 usando el SQL versionado exacto. En ambos entornos se verificaron `d1_migrations`, columnas, índices, triggers, conteos y `PRAGMA foreign_key_check`; no había pedidos previos y la aplicación no creó ninguno.

`migrations/0008_checkout_pro_stock_and_whatsapp_identity.sql` fue aplicada el 2026-08-22 primero en preview y luego en producción, con bookmarks de Time Travel previos. Wrangler `/query` rechazó inicialmente los triggers con `7500 incomplete input` y se comprobó rollback total; la aplicación definitiva usó el import oficial de D1 con el SQL versionado más la fila exacta de `d1_migrations`. Ambos entornos registran cuatro columnas de pedido, una columna de item, once triggers nuevos o reemplazados, conteos preservados y cero violaciones FK. Preview probó la carrera por la última unidad y limpió todo dato sintético.

El SHA funcional de conciliación autoritativa es `0f93d620faad6e93f76a364e9dc6794ac5c5f119`: CI `32605619627`, job `97110114994`, y deployment productivo `53f7208f-3fa4-4127-9106-90c1f8632c62` terminaron correctamente. Producción conserva Checkout Pro cerrado; el smoke devolvió 200 en apex e URL inmutable, 503 `COMMERCE_DISABLED` para preferencias, 401 para firma inválida y 401 para conciliación sin sesión. Preview quedó nuevamente aislado en su D1 y R2, con backend sandbox activo y botón público oculto. Falta la reautenticación humana de Mercado Pago para completar un pago de prueba y observar el webhook firmado.

El SHA funcional de stock unificado es `58ff324133cf665baacf946f54e960cd3d519398`: CI `32584798635`, job `97059454902` y check Cloudflare Pages concluyeron `success`; producción publicó `https://6483757c.shekinah-7dl.pages.dev`. El smoke público devolvió 503 `COMMERCE_DISABLED` para Checkout Pro, 400 `PRODUCT_NOT_FOUND` para un pedido sintético y cero filas D1.

La aplicación real de Mercado Pago y sus URLs de Webhook fueron inspeccionadas. El 2026-08-22 se renovaron el Access Token y Client Secret expuestos; el token productivo nuevo se reemplazó directamente como secreto cifrado de Pages production, sin tocar el token sandbox de preview. Prueba y producción quedaron suscriptas sólo a `Pagos`, y la misma clave de firma vigente fue reconciliada como secreto cifrado en ambos entornos. No se imprimieron ni persistieron valores. La calidad permanece `0/100` y no hay todavía un pago productivo válido, por lo que Checkout Pro continúa oculto.

El SHA funcional de reservas WhatsApp es `c19d88dc03f9d98c0c615256bda374769bd2b7a7`: CI `31627455350` concluyó `success`, Pages publicó producción con stage `success` y el origen canónico respondió 200. Un POST sintético con producto inexistente alcanzó la Function publicada, devolvió 400 `PRODUCT_NOT_FOUND` y dejó cero filas con su clave de idempotencia. No se creó un pedido positivo en producción para evitar reservar stock real.

La activación histórica de Backoffice V2 y analítica corresponde al SHA `bcb6ec0956fa46bba95b2bb5aa8b645657202da8`: CI `31452548845` concluyó `success`; preview `https://ad63cf05.shekinah-7dl.pages.dev` y producción `https://786bc7fe.shekinah-7dl.pages.dev` informaron el mismo SHA y stage `success`. Los smokes reales cubrieron ausencia, rechazo, aceptación, producto, carrito, clic manual, WhatsApp, exclusión de admin y revocación. La autenticación administrativa real no se repitió porque no se dispuso de la credencial en claro; login fail-closed y Backoffice V2 están cubiertos por E2E.

R2 está activo y verificado por API. Production reutiliza `shekinah`; preview usa `shekinah-preview`; Pages expone ambos como `CATALOG_IMAGES`. Los buckets conservan clase Standard/default y `publicR2DevEnabled=false`. La relectura posterior a los deployments confirmó que `DB`, R2, variables, nombres de secretos y `fail_open=false` permanecen preservados. Un upload directo con un Wrangler local que contiene `pages_build_output_dir` puede reemplazar la configuración del dashboard: excluirlo temporalmente de un deploy manual o mantenerlo totalmente sincronizado, y verificar siempre el nombre real de la D1/R2 después del deployment.

## Próximos pasos

1. resolver siempre el SHA vigente de `main` y `origin/main` antes de continuar;
2. comprobar CI y deployment de Pages para ese mismo SHA;
3. confirmar que `DB`, `Fail closed`, migraciones y nombres cifrados requeridos siguen presentes en ambos entornos;
4. ejecutar el smoke administrativo: API 401, login, alta, consulta, modificación, baja, logout y nuevo 401;
5. no crear una política externa de Access sobre todo `/admin*` o `/api/admin/*`, porque bloquearía el login propio; configurarlo sólo si se diseña como defensa adicional compatible;
6. ejecutar primero un pago sandbox y luego un pago productivo controlado con comprador distinto del vendedor; comprobar proveedor, webhook, pedido, pago, stock y calidad antes de cambiar flags;
7. al activar Checkout Pro productivo, decidir explícitamente si el fallback manual se retira o permanece;
8. antes del smoke de imágenes, releer que `CATALOG_IMAGES` apunte a `shekinah` en production y a `shekinah-preview` en preview, que `publicR2DevEnabled=false` continúe vigente y que el binding pertenezca a Pages, nunca al Worker homónimo;
9. validar stock legacy sin control, stock cero, stock físico/reservado/disponible, reserva concurrente de la última unidad y consumo exactamente una vez por ambos canales;
10. preservar `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS`: `https://shekinah.ar` en production y `https://mp-sandbox.shekinah-7dl.pages.dev` en preview;
11. comprobar que `manual_payment_click` se persiste sólo tras un clic manual válido y nunca alimenta pedidos, pagos ni revenue;
12. operar los pedidos WhatsApp pendientes sin TTL: revisar y aprobar o rechazar explícitamente los abandonados para no mantener reservas indefinidas.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no agregar parámetros no documentados al Link de Pago para simular un monto precargado;
- no tratar el fallback manual como pago verificado automáticamente;
- no activar Checkout Pro productivo sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.
