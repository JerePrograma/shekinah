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

La configuración autenticada del 2026-08-11 confirma dos D1 aisladas (`shekinah-commerce` y `shekinah-commerce-preview`), binding `DB`, migraciones remotas `0001` a `0006`, secretos administrativos y analíticos cifrados por entorno y `Fail closed` en production/preview. `ANALYTICS_ENABLED=true`, `VITE_ANALYTICS_ENABLED=true` y retención `730` están activos en ambos; los HMAC son independientes. `COMMERCE_ENABLED=false` y `VITE_COMMERCE_ENABLED=false` mantienen Checkout Pro cerrado. Zero Trust/Access continúa sin configurar porque es un fallback opcional; el Worker homónimo permaneció intacto.

El SHA funcional activado es `bcb6ec0956fa46bba95b2bb5aa8b645657202da8`: CI `31452548845` concluyó `success`; preview `https://ad63cf05.shekinah-7dl.pages.dev` y producción `https://786bc7fe.shekinah-7dl.pages.dev` informaron el mismo SHA y stage `success`. Los smokes reales cubrieron ausencia, rechazo, aceptación, producto, carrito, clic manual, WhatsApp, exclusión de admin y revocación. La autenticación administrativa real no se repitió porque no se dispuso de la credencial en claro; login fail-closed y Backoffice V2 están cubiertos por E2E.

R2 está activo y verificado por API. Production reutiliza `shekinah`; preview usa `shekinah-preview`; Pages expone ambos como `CATALOG_IMAGES`. Los buckets conservan clase Standard/default y `publicR2DevEnabled=false`. La relectura posterior a los deployments confirmó que `DB`, R2, variables, nombres de secretos y `fail_open=false` permanecen preservados. Un upload directo con un Wrangler local que contiene `pages_build_output_dir` puede reemplazar la configuración del dashboard: excluirlo temporalmente de un deploy manual o mantenerlo totalmente sincronizado, y verificar siempre el nombre real de la D1/R2 después del deployment.

## Próximos pasos

1. resolver siempre el SHA vigente de `main` y `origin/main` antes de continuar;
2. comprobar CI y deployment de Pages para ese mismo SHA;
3. confirmar que `DB`, `Fail closed`, migraciones y nombres cifrados `ADMIN_*` siguen presentes en ambos entornos;
4. ejecutar el smoke administrativo: API 401, login, alta, consulta, modificación, baja, logout y nuevo 401;
5. no crear una política externa de Access sobre todo `/admin*` o `/api/admin/*`, porque bloquearía el login propio; configurarlo sólo si se diseña como defensa adicional compatible;
6. mantener Checkout Pro cerrado y la analítica opt-in activa; cualquier rotación o cambio debe repetirse preview → producción sin tocar credenciales, modo ni webhook de Mercado Pago;
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
