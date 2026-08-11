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
- Mercado Pago Checkout Pro preparado para activación;
- fallback manual temporal de Link de Pago más WhatsApp;
- autenticación administrativa propia y Cloudflare Access opcional;
- backoffice visual de catálogo con stock opcional e imágenes administradas preparadas para R2;
- Backoffice V2 separado en Resumen, Productos, Pedidos, Analítica y Auditoría;
- detalle de pedidos integrado de sólo lectura;
- analítica first-party opcional con `manual_payment_click` para el fallback manual.

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
- autenticación administrativa propia configurada y probada;
- pruebas de humo aprobadas.

### Autorización manual vigente

El 2026-08-10 quedaron expresamente autorizados como datos públicos actuales:

```text
Sitio canónico de producción: https://shekinah.ar/
WhatsApp: +549 2236 21-6559
Link de Pago: https://link.mercadopago.com.ar/shekinahmoreno
```

El código puede usar el WhatsApp normalizado `5492236216559` y el Link de Pago como fallback manual mientras `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false`. La activación de analítica fue autorizada de forma separada para esta entrega y sólo puede ejecutarse después de validar el código, aplicar `0006`, crear secretos independientes, desplegar el SHA exacto y aprobar smoke en preview antes de producción. Esta autorización no habilita Checkout Pro ni webhooks.

El fallback manual no requiere VPS. El backend futuro continúa siendo Pages Functions y D1.

## Identidad externa verificada

- Proyecto Pages: `shekinah`.
- Dominio canónico de producción: `shekinah.ar`.
- Dominio técnico de Pages y origen de preview: `shekinah-7dl.pages.dev`.
- `www.shekinah.ar`: Bulk Redirect HTTPS `301` al apex verificada, con path y query preservados y destino final 200.
- Repositorio conectado: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Existe un Worker independiente también llamado `shekinah`; no usar sus settings para configurar Pages.

La zona DNS `shekinah.ar` figura `active` en Cloudflare y usa `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`. DNSSEC está deshabilitado sin DS publicado en `.ar`, estado coherente y sin riesgo de validación rota. El custom domain del apex, su verificación y validación están `active`; el CNAME proxied apunta al dominio técnico de Pages y el apex responde HTTPS 200 con TLS confiable emitido por Google. La Bulk Redirect HTTPS de `www` responde `301`, preserva path/query y termina en el apex 200; el A proxied `192.0.2.1` es sólo el placeholder oficial para que la regla reciba tráfico, nunca un origen. El pack Universal está activo, usa Google Trust Services WE1, cubre el apex y `*.shekinah.ar`, y el handshake negocia TLS 1.3.

El inventario y la configuración autenticados del 2026-08-10 confirmaron dos D1 aisladas (`shekinah-commerce` y `shekinah-commerce-preview`), binding `DB`, migraciones remotas `0001` a `0005`, cuatro secretos administrativos cifrados por entorno y `Fail closed` en production/preview. El candidato agrega `0006`, todavía pendiente en ambas bases al cierre de este estado. `ANALYTICS_ENABLED=false`, `VITE_ANALYTICS_ENABLED` ausente y `ANALYTICS_HMAC_SECRET` ausente en ambos entornos; retención `730`. Zero Trust/Access continúa sin configurar porque es un fallback opcional; existe además un Worker homónimo que permanece intacto.

La base verificada antes del candidato actual es `198138390162368e38d40f58e53756b932510b9b`, con CI `31449104996` y deployment inmutable `https://e8a4b3e3.shekinah-7dl.pages.dev` exitosos. El candidato posterior agrega Backoffice V2, detalle de pedido, agregaciones analíticas y el evento manual; no posee todavía SHA final, CI, deployment ni smoke remoto documentados.

R2 está activo y verificado por API. Production reutiliza el bucket existente `shekinah`; preview usa el bucket aislado creado `shekinah-preview`; Pages expone ambos como `CATALOG_IMAGES` en su entorno correspondiente. Los buckets conservan clase Standard/default y `publicR2DevEnabled=false`, por lo que la lectura pública queda exclusivamente bajo la ruta first-party de Pages. La relectura confirmó que `DB`, variables, nombres de secretos administrativos y `fail_open=false` permanecen preservados. Esto no sustituye el commit, CI, deployment ni smoke remoto todavía pendientes del candidato.

## Próximos pasos

1. resolver siempre el SHA vigente de `main` y `origin/main` antes de continuar;
2. comprobar CI y deployment de Pages para ese mismo SHA;
3. confirmar que `DB`, `Fail closed`, migraciones y nombres cifrados `ADMIN_*` siguen presentes en ambos entornos;
4. ejecutar el smoke administrativo: API 401, login, alta, consulta, modificación, baja, logout y nuevo 401;
5. no crear una política externa de Access sobre todo `/admin*` o `/api/admin/*`, porque bloquearía el login propio; configurarlo sólo si se diseña como defensa adicional compatible;
6. mantener Checkout Pro cerrado; activar analítica sólo mediante la secuencia autorizada preview → producción, sin tocar credenciales, modo ni webhook de Mercado Pago;
7. al activar Checkout Pro productivo, decidir explícitamente si el fallback manual se retira o permanece.
8. antes del smoke de imágenes, releer que `CATALOG_IMAGES` apunte a `shekinah` en production y a `shekinah-preview` en preview, que `publicR2DevEnabled=false` continúe vigente y que el binding pertenezca a Pages, nunca al Worker homónimo;
9. validar stock legacy sin control, stock cero, límite `min(99, stock)`, revalidación server-side y ausencia deliberada de reservas/decremento.
10. preservar los valores verificados por API de `PUBLIC_SITE_URL` y `ALLOWED_SITE_ORIGINS`: `https://shekinah.ar` en production y `https://shekinah-7dl.pages.dev` en preview.
11. comprobar que `manual_payment_click` se persiste sólo tras un clic manual válido y nunca alimenta pedidos, pagos ni revenue.

## Prohibiciones

- no inventar secretos, IDs, dominios, números ni políticas de retención;
- no guardar credenciales en Git;
- no agregar parámetros no documentados al Link de Pago para simular un monto precargado;
- no tratar el fallback manual como pago verificado automáticamente;
- no activar Checkout Pro productivo sin comprobaciones;
- no confundir build aprobado con deployment aprobado;
- no confundir deployment con configuración productiva completa.
