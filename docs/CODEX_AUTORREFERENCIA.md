# Shekinah — Autorreferencia operativa de Codex

```yaml
schema_version: 1
project: shekinah
repository: JerePrograma/shekinah
local_checkout: C:\laburo\shekinah
branch: main
remote: origin/main
last_verified_sha: a543c39c025a952f632f38c6bf97b4ea3501b0d1
last_verified_at: 2026-08-10T20:36:01Z
last_ci_run_id: 31429695666
last_ci_conclusion: success
cloudflare_pages_check: success
commerce_enabled: false
analytics_enabled: false
whatsapp_enabled: false
d1_preview: shekinah-commerce-preview
d1_production: shekinah-commerce
mercado_pago_mode: no_verificado
```

## 1. Identidad del proyecto

- **VERIFICADO:** checkout local `C:\laburo\shekinah`, repositorio remoto `JerePrograma/shekinah`, rama `main` y seguimiento `origin/main`.
- **VERIFICADO:** aplicación React 19, TypeScript estricto y Vite 8 publicada mediante Cloudflare Pages con Pages Functions.
- **VERIFICADO:** Node.js `24.18.0` y npm `11.16.0` en la sesión iniciada el 2026-08-04.
- **VERIFICADO:** el proyecto Pages se llama `shekinah`, su dominio técnico es `shekinah-7dl.pages.dev` y está conectado a `JerePrograma/shekinah`.
- **VERIFICADO (DOMINIO):** el origen público canónico de producción es `https://shekinah.ar`; el custom domain de Pages, su verificación y validación figuran `active`, el apex usa CNAME proxied a `shekinah-7dl.pages.dev` y HTTPS responde 200 con certificado confiable de Google.
- **VERIFICADO (WWW):** HTTPS negocia TLS 1.3 con un pack Universal activo de Google Trust Services WE1 cuyo SAN cubre `shekinah.ar` y `*.shekinah.ar`; la Bulk Redirect responde `301` al apex, preserva path y query y, al seguirla, termina en 200.
- **VERIFICADO (WWW DNS):** el A proxied `192.0.2.1` es un placeholder oficial para entregar tráfico a la regla, no un origen de la aplicación.
- **VERIFICADO (ZONA):** la zona `shekinah.ar` figura `active`, delegada a `angela.ns.cloudflare.com` y `ed.ns.cloudflare.com`; DNSSEC está deshabilitado y no existe DS publicado en `.ar`, estado válido sin cadena de validación rota.
- **VERIFICADO:** existe un Worker independiente también llamado `shekinah`; no comparte la configuración del proyecto Pages.

## 2. Regla de autoridad

La autoridad se resuelve en este orden: Git sincronizado; código y configuración rastreados; pruebas ejecutadas; migraciones y esquema efectivo; configuración externa autenticada; CI y deployment ligados al SHA exacto; documentación vigente; este archivo; contexto histórico.

- **VERIFICADO:** este archivo no reemplaza ninguna de esas fuentes y debe reconciliarse al inicio de cada sesión.
- **BLOQUEADO:** los estados externos no consultables con una sesión autenticada permanecen `no_verificado`; nunca se completan por inferencia.

## 3. Estado Git verificado

- **VERIFICADO:** la base sincronizada anterior al candidato de UX/inventario/imágenes es `a543c39c025a952f632f38c6bf97b4ea3501b0d1`; `HEAD == origin/main` y el worktree estaban limpios al iniciar la tarea.
- **VERIFICADO:** la rama activa es `main`; no se creó una rama, PR, worktree o stash para el candidato.
- **HISTÓRICO VERIFICADO:** la base funcional anterior del ABM fue `f704424f614b917ffd42eb47ab31e5057a7ba5ec` y el cierre operativo de autenticación fue validado sobre `7f93e29ad64f081b2dd1efe7f3c4c4b53e081225`.
- **VERIFICADO:** no se crearon ramas, pull requests, worktrees ni stashes; no se usó force-push ni se reescribió historial.

## 4. Arquitectura vigente

- **REVISADO_POR_CÓDIGO:** la SPA vive en `src/`; la navegación usa History API y las rutas públicas conservan el fallback de Vite/Pages.
- **REVISADO_POR_CÓDIGO:** `functions/api/` expone checkout, webhook, estado público, analítica, privacidad y administración; la lógica compartida vive en `server/`.
- **REVISADO_POR_CÓDIGO:** Cloudflare D1 implementa pedidos, intenciones de checkout, fulfillment, eventos de pago, analítica, retención y auditoría.
- **REVISADO_POR_CÓDIGO:** el catálogo comercial rastreado genera el catálogo de Functions mediante `scripts/generate-commerce-catalog.mjs`.
- **CANDIDATO REVISADO_POR_CÓDIGO:** el inventario opcional y las referencias de imágenes administradas reutilizan el payload JSON de `catalog_product_mutations`; los binarios se diseñaron para R2 mediante el binding `CATALOG_IMAGES`, sin modificar las migraciones `0001` a `0005`.

## 5. Invariantes funcionales

- **VERIFICADO:** el catálogo canónico conserva 510 productos y 16 categorías.
- **REVISADO_POR_CÓDIGO:** el servidor vuelve a leer productos y precios canónicos; el navegador no fija moneda, subtotal, envío ni total.
- **REVISADO_POR_CÓDIGO:** el checkout usa ARS y Mercado Pago Checkout Pro por redirección.
- **REVISADO_POR_CÓDIGO:** comercio, analítica y WhatsApp deben permanecer cerrados hasta completar autorización y configuración externa.
- **CANDIDATO REVISADO_POR_CÓDIGO:** `stockQuantity` es opcional; ausente significa stock no controlado. La disponibilidad efectiva es disponibilidad manual activa y, además, stock no controlado o cantidad mayor que cero.
- **CANDIDATO REVISADO_POR_CÓDIGO:** el stock controlado debe ser un entero entre `0` y `1.000.000`; el carrito limita cada línea a `min(99, stockQuantity)` y el servidor vuelve a validar disponibilidad y cantidad antes del Checkout Pro.
- **LÍMITE DELIBERADO:** el inventario administrativo restringe la compra, pero no reserva ni descuenta stock automáticamente al vender.

## 6. Invariantes de seguridad

- **REVISADO_POR_CÓDIGO:** secretos y credenciales se leen únicamente desde bindings o variables de servidor; no existen variables `VITE_*` para secretos.
- **REVISADO_POR_CÓDIGO:** los endpoints mutables aplican origen same-origin y límites de payload; el webhook verifica firma antes de procesar el cuerpo.
- **REVISADO_POR_CÓDIGO:** las rutas administrativas requieren sesión propia HMAC o, sólo como fallback sin cookie, JWT RS256 de Cloudflare Access; una cookie propia inválida se rechaza sin fallback.
- **VERIFICADO:** `public/_headers` aplica CSP sin `unsafe-inline` ni `unsafe-eval`; el sitio público entregó esas cabeceras el 2026-08-04.

## 7. Catálogo y activos

- **VERIFICADO:** 510 productos, 16 categorías y 484 imágenes en la base inicial.
- **VERIFICADO:** el reporte inicial fue 297 por presentación, 103 por nombre, 110 desconocidos y 1 conflicto; el reporte corregido es 296 por presentación, 103 por nombre, 111 desconocidos, 1 ambiguo explícito y 0 conflictos silenciosos.
- **VERIFICADO:** el conflicto corresponde a `naranja-en-rodajas-deshidratada-x-250-gr`: nombre `Naranja en rodajas deshidratada x 250 gr`, presentación `50 g`, derivación por nombre 250 g y por presentación 50 g.
- **REVISADO_POR_CÓDIGO:** no se modifican nombre, presentación, SKU, precio, slug, referencia ni imagen para resolver el conflicto.
- **CANDIDATO REVISADO_POR_CÓDIGO:** las imágenes legacy continúan siendo los assets versionados y autorizados; una imagen administrativa usa una ruta first-party `/api/catalog-images/<uuid>.<ext>` y nunca habilita el borrado de un asset legacy.
- **CANDIDATO REVISADO_POR_CÓDIGO:** el upload acepta sólo JPEG, PNG o WebP de hasta 4 MiB y valida tipo declarado, extensión derivada y magic bytes en servidor.

## 8. Checkout, fulfillment y envío

- **REVISADO_POR_CÓDIGO:** `calculateShippingQuote` es la regla compartida cliente-servidor.
- **VERIFICADO:** el estado inicial aceptaba silenciosamente 50 g para el producto conflictivo y bloqueaba retiro coordinado cuando el peso era desconocido; ambos comportamientos quedaron corregidos y cubiertos por pruebas focalizadas.
- **REVISADO_POR_CÓDIGO:** Correo Argentino cobra ARS 19.000 hasta 1 kg inclusive y ARS 25.000 entre más de 1 kg y 5 kg inclusive; pesos desconocidos o mayores a 5 kg requieren cotización manual.
- **VERIFICADO:** `validateFulfillment` normaliza NFKC, espacios, teléfono y código postal; rechaza claves adicionales, formas no válidas, controles C0/C1 y controles bidireccionales Unicode.

## 9. Pedidos, D1 e idempotencia

- **REVISADO_POR_CÓDIGO:** `checkoutFingerprint` combina carrito canónico y fulfillment normalizado; `reserveCheckoutIntent` rechaza la misma clave con otra huella.
- **VERIFICADO:** `reserveCheckoutIntent` fija por separado las huellas normalizadas de fulfillment y carrito; `prepareOrder` crea/lee pedido e ítems mediante `D1Database.batch`, y el fulfillment se persiste antes de reclamar la preferencia.
- **REVISADO_POR_CÓDIGO:** la recuperación exige coincidencia de carrito, subtotal, envío, total, peso y huella de fulfillment.
- **VERIFICADO:** `migrations/0003_checkout_intent_cart_fingerprint.sql` agrega la huella del carrito y backfillea desde pedidos existentes sin editar `0001` ni `0002`.
- **VERIFICADO:** `server/migrations.test.ts` aplica `0001` a `0005`, preserva pedidos históricos, consulta `sqlite_schema` y prueba backfill, idempotencia, constraints, cascade, catálogo y rate limiting.

## 10. Mercado Pago y webhooks

- **REVISADO_POR_CÓDIGO:** la preferencia contiene productos, una línea explícita de envío, ARS, `external_reference`, `notification_url`, `back_urls` y `auto_return`.
- **REVISADO_POR_CÓDIGO:** el webhook obtiene el pago autoritativo y valida firma, ID, pedido, monto completo, moneda y transiciones de estado.
- **REVISADO_POR_CÓDIGO:** los estados terminales no se degradan; `refunded` y `charged_back` prevalecen sobre estados anteriores.
- **VERIFICADO:** las respuestas de pago y preferencia validan sus IDs; el GET de pago debe devolver exactamente el recurso solicitado y la recuperación debe devolver el ID encontrado.
- **VERIFICADO:** pruebas sin credenciales reales cubren la línea de envío, ARS, total completo, firma ausente/inválida, evento duplicado, monto/moneda incompatibles y aprobación autoritativa.
- **BLOQUEADO:** credenciales, modo y aplicación real de Mercado Pago no se verificaron ni se activarán sin autorización expresa.

## 11. Administración, sesión propia y Access opcional

- **REVISADO_POR_CÓDIGO:** `/api/admin/*` pasa por `functions/api/admin/_middleware.ts`; sólo login, session y logout quedan excluidos exactamente. `server/admin-auth.ts` valida PBKDF2, cookie HMAC y expiración; `server/access.ts` conserva issuer, audience, expiración, `nbf`, algoritmo RS256 y firma con JWKS como fallback.
- **REVISADO_POR_CÓDIGO:** `/admin` sirve la SPA para mostrar el login; la autoridad reside en cada API protegida. La identidad por contraseña es sintética y el usuario no entra en cookie ni auditoría.
- **REVISADO_POR_CÓDIGO:** listados y detalle toleran pedidos históricos sin fulfillment; el CSV neutraliza prefijos de fórmulas.
- **HISTÓRICO VERIFICADO (2026-08-04):** una petición pública no autenticada a `/admin` respondió 401 con el diseño anterior exclusivo de Access.
- **HISTÓRICO VERIFICADO (2026-08-04):** la sesión autenticada de Cloudflare mostró el onboarding inicial de Zero Trust; no existía organización ni aplicación Access configurada.
- **HISTÓRICO SUPERADO:** aquel diseño exigía protección Access de borde. El requisito actual reemplazó esa autoridad primaria por login propio server-side para que `/admin` pueda mostrar el formulario.
- **VERIFICADO:** el inventario del 2026-08-10 confirmó que Access continúa ausente; el nuevo requisito usa autenticación propia y no debe añadir una política externa que intercepte el login.
- **CANDIDATO REVISADO_POR_CÓDIGO:** `ProductManager` evoluciona hacia listado visual con miniatura, búsqueda, filtros, resumen operativo, editor agrupado, acciones rápidas de stock/disponibilidad, estados asíncronos y advertencia de cambios sin guardar; toda persistencia continúa pasando por las APIs administrativas protegidas.

## 12. Analítica, consentimiento y retención

- **REVISADO_POR_CÓDIGO:** el cliente no envía analítica sin consentimiento y no incluye PII de pedidos.
- **REVISADO_POR_CÓDIGO:** `purgeAnalyticsIfDue` reclama una ejecución mensual y elimina sesiones, eventos y revocaciones anteriores al corte configurado.
- **REVISADO_POR_CÓDIGO:** `ANALYTICS_RETENTION_DAYS` acepta de 1 a 730 días; la política documentada exige 730 en producción.
- **VERIFICADO:** el endpoint público de analítica respondió `ANALYTICS_DISABLED` el 2026-08-04.
- **VERIFICADO:** las pruebas cubren 1/729/730 válidos, 0/-1/731/texto inválidos, corte exacto, reclamo concurrente, cambio de mes y liberación del reclamo tras fallo.

## 13. Variables, flags, bindings y secretos

- **VERIFICADO:** comercio y analítica están deshabilitados explícitamente en preview y producción; el fallback público autorizado permanece independiente.
- **VERIFICADO:** producción y preview tienen `DB`, variables mínimas, `Fail closed` y los cuatro nombres administrativos como `secret_text`.
- **VERIFICADO:** existen `shekinah-commerce` y `shekinah-commerce-preview`; ambas registran `0001` a `0005` sin pendientes, incluida `0004_catalog_admin.sql`.
- **VERIFICADO:** Mercado Pago no tiene secretos cargados en Pages; el modo y la aplicación del proveedor siguen `no_verificado`.
- **VERIFICADO:** Zero Trust y Cloudflare Access están ausentes.
- **REVISADO_POR_CÓDIGO:** `.env*`, `.dev.vars`, el `wrangler.jsonc` real, `dist`, logs y backups están excluidos o prohibidos para publicación.
- **VERIFICADO:** R2 está activo. Production reutiliza el bucket existente `shekinah`; preview usa el bucket aislado creado `shekinah-preview`; Pages expone ambos como `CATALOG_IMAGES` en su entorno correspondiente.
- **VERIFICADO:** ambos buckets conservan clase Standard/default y `publicR2DevEnabled=false`. No existe dominio público `r2.dev`; la lectura comercial se sirve exclusivamente mediante la ruta first-party de Pages.
- **VERIFICADO:** la relectura posterior a configurar R2 confirmó que `DB`, variables, los cuatro nombres administrativos como `secret_text` y `fail_open=false` permanecen preservados en production y preview. No se leyeron ni registraron valores secretos.
- **VERIFICADO POR API:** production usa `PUBLIC_SITE_URL=https://shekinah.ar` y `ALLOWED_SITE_ORIGINS=https://shekinah.ar`; preview conserva ambos valores en `https://shekinah-7dl.pages.dev`.
- **PENDIENTE DEL CANDIDATO:** la infraestructura está configurada, pero el upload todavía requiere commit, CI, deployment del SHA definitivo y smoke autenticado antes de considerarse productivo.

## 14. CI, artefactos y deployment

- **VERIFICADO (BASE):** run CI `31429695666`, conclusión `success`, sobre `a543c39c025a952f632f38c6bf97b4ea3501b0d1`; el artefacto `shekinah-dist-a543c39c025a952f632f38c6bf97b4ea3501b0d1` estaba disponible al iniciar el candidato.
- **VERIFICADO (BASE):** deployment de producción `62f735c6-0611-43a0-b5d9-eedf7d857234`, URL inmutable `https://62f735c6.shekinah-7dl.pages.dev`, canónico y con todos los stages `success` para el mismo SHA.
- **HISTÓRICO VERIFICADO (`7f93e29`):** el smoke real sobre `https://shekinah-7dl.pages.dev` demostró login inválido 401 uniforme, login válido, cookie segura, cookie alterada 401, API `401 → 200 → 401`, alta/consulta/modificación/baja del producto técnico `codex-admin-smoke-msnopefj`, auditoría, logout y flujo Chromium sin credenciales en Web Storage.
- **VERIFICADO:** Pages usa `npm run build:pages`, salida `dist`, rama `main`, Build System v3 y deployments automáticos; previews aceptan todas las ramas no productivas.
- **VERIFICADO LOCAL (CANDIDATO SIN SHA):** `npm run verify` aprobó lint, TypeScript, 39 archivos/179 pruebas Vitest, verificadores, build y 14 pruebas Playwright; `npm run build:pages` también aprobó. Esto no sustituye CI, deployment ni smoke remoto, que deben asociarse al futuro SHA definitivo.

## 15. Validaciones disponibles

- `npm ci`
- `npm run install:browsers`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run verify:shipping-weights`
- `npm run verify`
- `npm run build:pages`
- `git diff --check` y `git diff --cached --check`
- `npx --no-install wrangler pages project list --json`
- `npx --no-install wrangler pages deployment list --project-name shekinah --environment production --json`
- `npx --no-install wrangler d1 list --json`
- `npx --no-install wrangler pages secret list --project-name shekinah`

**HISTÓRICO VERIFICADO (`7f93e29`):** desde `npm ci` aprobaron instalación de Chromium, lint, TypeScript, 36 archivos/154 pruebas Vitest, el gate integral `npm run verify`, 12 pruebas Playwright y `npm run build:pages`. El catálogo conservó 510 productos, 16 categorías y 484 imágenes; no hubo source maps. El bundle principal fue de 498,18 kB minificado y el chunk administrativo de 24,79 kB. No reutilizar estos conteos como evidencia del candidato actual.

## 16. Decisiones tomadas

1. **VERIFICADO:** una contradicción entre dos fuentes explícitas de peso no se resuelve eligiendo una; se clasifica como desconocida para Correo Argentino.
2. **VERIFICADO:** retiro coordinado cuesta ARS 0 y no necesita peso para habilitarse.
3. **VERIFICADO:** el generador genera y el verificador se ejecuta explícitamente desde ambos gates.
4. **VERIFICADO:** las migraciones publicadas no se editaron; la corrección de esquema es la migración aditiva `0003`.
5. **VERIFICADO:** Checkout Pro y analítica permanecen cerrados; sólo se crearon las D1 autorizadas, se aplicaron las migraciones versionadas `0001` a `0005` y se activó el backoffice solicitado.
6. **VERIFICADO:** una reserva idempotente debe fijar carrito y fulfillment; una reserva histórica sin huella de carrito admite un único reclamo y luego queda cerrada a cambios.
7. **VERIFICADO:** `shekinah` identifica tanto un proyecto Pages como un Worker independiente; toda operación debe comprobar el tipo de recurso y la ruta del panel.
8. **VERIFICADO:** rutas de autenticación, privacidad y pagos incluidas en `public/_routes.json` requieren `Fail closed` antes de la operación productiva.

## 17. Hallazgos abiertos

| ID | Severidad | Área | Archivo | Símbolo | Comportamiento actual | Comportamiento esperado | Evidencia | Riesgo | Corrección mínima | Prueba necesaria | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SHK-001 | CRÍTICA | Envío/pagos | `src/commerce/fulfillment.ts` | `deriveUnitWeightGrams` | El conflicto 50 g/250 g usaba 50 g silenciosamente. | Todo conflicto explícito se clasifica desconocido para Correo. | Verificador final y pruebas de catálogo. | Cobro de envío inferior o superior al debido. | Devuelve `null` cuando nombre y presentación discrepan. | Derivación, cantidades y checkout. | VERIFICADO |
| SHK-002 | ALTA | Fulfillment | `src/commerce/fulfillment.ts` | `calculateShippingQuote` | Retiro se evaluaba después del peso y podía quedar bloqueado. | Retiro coordinado disponible por ARS 0 aun con peso desconocido o >5 kg. | Pruebas focalizadas aprobadas. | Impide un checkout válido. | Retiro se resuelve sin exigir peso. | Desconocido, 5.001 g y límites. | VERIFICADO |
| SHK-003 | MEDIA | Automatización | `package.json`, scripts | gates de pesos | El generador importaba lateralmente al verificador; los gates no lo invocaban. | Generación y verificación separadas y explícitas. | `verify:automation` aprobado. | El gate puede omitirse o confundirse. | Import quitado; ambos gates lo invocan. | Verificador y automatización. | VERIFICADO |
| SHK-004 | MEDIA | Validación/PII | `src/commerce/fulfillment.ts` | `containsControl` | Rechazaba C0/C1 pero no controles bidireccionales Unicode. | Rechazar controles bidi en campos de entrega. | Prueba U+202E aprobada. | Texto engañoso en PII y backoffice. | Comprobación `Bidi_Control`. | Caso bidi y formas inválidas. | VERIFICADO |
| SHK-005 | MEDIA | Mercado Pago | `server/mercado-pago.ts` | parseo de IDs | No ataba explícitamente el ID retornado por GET al solicitado y aceptaba IDs laxos. | Rechazar respuesta ambigua o con ID distinto. | Pruebas HTTP simuladas aprobadas. | Asociación incorrecta ante respuesta anómala. | Valida y compara IDs normalizados. | Preferencia, pago y recuperación. | VERIFICADO |
| SHK-006 | MEDIA | D1 | migraciones/pruebas | `0001`, `0002`, `0003` | Faltaba un contrato secuencial para esquema y pedidos históricos. | Demostrar base vacía, histórico, backfill, cascade y constraints. | `server/migrations.test.ts` aprobado. | Regresión de compatibilidad no detectada. | Prueba SQLite con migraciones reales. | Integración local de esquema. | VERIFICADO |
| SHK-007 | MEDIA | Analítica | `server/analytics-retention.test.ts` | retención | Faltaban límites, concurrencia y rollback. | Evidencia ejecutada de corte exacto, configuración y recuperación. | Suite focalizada aprobada. | Operación de privacidad frágil no detectada. | Pruebas ampliadas sin cambiar esquema. | 1/729/730/731, mes y fallo. | VERIFICADO |
| SHK-008 | MEDIA | Documentación | documentos operativos | estado vigente | Algunos textos anteriores negaban fulfillment o retención. | Documentación vigente coherente, preservando registros históricos. | `verify:automation` aprobado. | Operación incorrecta por instrucciones obsoletas. | Documentos vigentes reconciliados. | Automatización y enlaces. | VERIFICADO |
| SHK-009 | BAJA | Rendimiento | `src/App.tsx` | import de admin | Bundle principal superaba levemente 500 kB minificado. | Reducir el bundle sólo con un split pequeño y medible. | Build: 492,62 kB; Playwright 10/10. | Carga inicial algo mayor. | `AdminPage` diferida con fallback accesible. | Build y Playwright. | VERIFICADO |
| SHK-010 | ALTA | Producción | Cloudflare | binding D1 | Production y preview tienen D1 aislada, migraciones y binding `DB`. | Mantener esa separación antes de activar comercio. | API/CLI autenticadas, tracking y esquema remoto. | Pagos no reconciliables si el binding se retira al activar comercio. | Mantener flags cerrados y comprobar binding por SHA. | Smoke externo antes de activar Checkout Pro. | VERIFICADO |
| SHK-011 | MEDIA | Continuidad | `docs/CODEX_AUTORREFERENCIA.md` | archivo requerido | El archivo no existía en la base. | Memoria operativa versionada y reconciliable. | Archivo creado y `verify:automation` aprobado. | Continuación dependiente de contexto externo. | Documento y orden de lectura agregados. | Automatización documental. | VERIFICADO |
| SHK-012 | ALTA | Idempotencia | `server/fulfillment.ts` | `reserveCheckoutIntent` | Una reserva huérfana fijaba sólo fulfillment y podía aceptar otro carrito. | La misma clave fija carrito y fulfillment aun antes de existir pedido. | Reproducción por flujo y pruebas secuencial/concurrente. | Reutilización semántica de clave y pedido inesperado. | Migración `0003`, backfill y reclamo condicional. | Mismo/diferente carrito, normalización y concurrencia. | VERIFICADO |
| SHK-013 | ALTA | Pages/security | configuración externa | `Fail open/closed` | Producción y preview usan `Fail closed`. | Rutas críticas de Functions deben seguir fallando cerradas al agotar cuota. | API autenticada de Pages y smoke posterior requerido por SHA. | Una regresión podría servir activos en vez de ejecutar Functions. | Conservar el setting y revalidarlo tras cambios. | API y smoke posterior. | VERIFICADO |
| SHK-014 | ALTA | Autenticación | backoffice | login y sesión | Existe credencial propia PBKDF2, cookie HMAC, middleware y rate limit D1; Access es opcional. | Login propio utilizable sin secretos en navegador y API fail-closed. | Pruebas unitarias/integración, configuración cifrada y smoke remoto completo sobre el SHA verificado. | Escrituras no autorizadas o bloqueo accidental del login. | Mantener tres exclusiones exactas y no interponer Access obligatorio. | Login, cookie alterada, CRUD y logout. | VERIFICADO |
| SHK-015 | MEDIA | Operación | Cloudflare | identidad de recurso | Pages y un Worker independiente comparten el nombre `shekinah`. | Toda operación distingue `pages/view/shekinah` de `workers/services/view/shekinah`. | Inventario autenticado de Workers & Pages. | Variables o bindings pueden cargarse en el recurso equivocado. | Documentar identificadores no sensibles y validar tipo antes de mutar. | Relectura del panel después de cada cambio. | VERIFICADO |
| SHK-016 | MEDIA | Preview | Pages | despliegues/Access | Previews públicos; cinco PRs Dependabot abiertos tienen build Pages fallido. | Previews restringidos y logs de fallos accesibles para diagnóstico. | Wrangler y checks GitHub; resumen sólo indica `Build failed`. | Cambios no productivos no tienen entorno demostrable. | Configurar Access y revisar logs sin modificar PRs. | Preview autorizado y build verde. | BLOQUEADO |
| SHK-017 | ALTA | Imágenes | Cloudflare R2 | `CATALOG_IMAGES` | El candidato implementa upload sobre R2 y la infraestructura ya está vinculada por entorno. | `shekinah` en production, `shekinah-preview` en preview y lectura sólo first-party. | Inventario y bindings Pages verificados por API; ambos buckets Standard/default con `publicR2DevEnabled=false`. | Un binding correcto no demuestra que el código del candidato esté desplegado ni que el lifecycle funcione en producción. | Mantener aislamiento, `r2.dev` deshabilitado y comprobar el SHA exacto tras publicar. | Upload/reemplazo/delete autenticados sobre el SHA desplegado. | INFRAESTRUCTURA_VERIFICADA / SMOKE_PENDIENTE |

## 18. Riesgos y bloqueos externos

- **VERIFICADO:** la cuenta partía de cero D1; se crearon bases vacías y separadas, se capturaron bookmarks previos y se aplicaron sólo migraciones versionadas `0001` a `0005`.
- **VERIFICADO:** `shekinah-commerce` pertenece a producción y `shekinah-commerce-preview` a preview; ambos usan binding `DB` sin compartir datos.
- **REVISADO:** Access no está habilitado y no es bloqueo para el login propio. Mercado Pago y el webhook sí requieren credenciales y autorización separadas.
- **BLOQUEADO:** no se realizará ningún pago, devolución ni activación productiva sin confirmación inmediata.
- **INFERENCIA:** una intención huérfana puede persistir si una operación falla tras reservarla; sólo contiene huellas, fija carrito y fulfillment y la misma solicitud puede reintentarse. No existe una política de limpieza, pero tampoco almacena PII en claro.
- **VERIFICADO:** Wrangler no está instalado en el proyecto; la sesión autenticada se operó efímeramente con Wrangler `4.120.1`, sin modificar dependencias.
- **VERIFICADO:** producción y preview están en `Fail closed`.
- **VERIFICADO:** los previews son públicos; cinco PRs Dependabot abiertos conservan checks Pages fallidos cuyo resumen sólo indica `Build failed`.
- **RESUELTO:** R2 quedó habilitado; el bucket existente `shekinah` se reutilizó para production, se creó `shekinah-preview` para preview y ambos quedaron vinculados como `CATALOG_IMAGES` en Pages.
- **VERIFICADO:** ambos buckets usan clase Standard/default y mantienen `publicR2DevEnabled=false`; `DB`, variables, nombres de secretos administrativos y `fail_open=false` permanecen preservados.
- **PENDIENTE:** todavía no se creó el commit del candidato, no existe CI o deployment para su SHA definitivo y no se ejecutó el smoke productivo de upload/reemplazo/delete.

## 19. Archivos y símbolos críticos

- `src/commerce/fulfillment.ts`: `validateFulfillment`, `deriveUnitWeightGrams`, `calculateShippingQuote`, `fulfillmentCanonicalValue`.
- `src/commerce/checkout-session.ts`: `checkoutFingerprint`, ventana y persistencia de la clave del navegador.
- `server/fulfillment.ts`: `reserveCheckoutIntent`, `persistOrderFulfillment`, `createPaymentCart`.
- `server/orders.ts`: `cartFingerprint`, `prepareOrder`, reclamo de preferencia, recuperación y actualización por pago.
- `server/mercado-pago.ts`: creación/recuperación de preferencias y consulta autoritativa de pagos.
- `functions/api/checkout/preferences.ts`: orquestación de checkout e idempotencia.
- `functions/api/webhooks/mercadopago.ts`: autenticación y conciliación de webhooks.
- `server/admin-auth.ts`, `server/admin-login-rate-limit.ts`, `server/access.ts` y `functions/api/admin/_middleware.ts`: frontera administrativa.
- `src/catalog/model.ts`, `src/cart/model.ts`, `server/catalog-store.ts` y `server/dynamic-cart.ts`: stock opcional, disponibilidad efectiva y límite cliente-servidor.
- `src/admin/ProductManager.tsx` y las rutas first-party de imágenes: UX de catálogo, upload validado y persistencia de la referencia administrada.
- `server/analytics-retention.ts`: reclamo mensual y purga.
- `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql`: migraciones publicadas preservadas sin cambios.
- `migrations/0003_checkout_intent_cart_fingerprint.sql`: migración aditiva nueva para cerrar la reserva de carrito.
- `migrations/0004_catalog_admin.sql`, `migrations/0005_admin_auth.sql`: mutaciones/tombstones y rate limiting administrativo.
- `scripts/verify-shipping-weights.mjs`: clasificación auditable de pesos.
- Cloudflare Pages correcto: panel bajo `pages/view/shekinah`, dominio técnico `shekinah-7dl.pages.dev` y dominio público canónico `shekinah.ar`.
- Worker distinto: panel bajo `workers/services/view/shekinah`; no configurarlo para comercio.

## 20. Último diff aplicado

- **VERIFICADO:** `4e7f655f327d633f1e19ea6a06038f24fbba8b8e` implementó login, sesión, rate limiting, UI y pruebas; `6fe13718b9b3c5bee3328945eb1492f63ceebf85` y `7f93e29ad64f081b2dd1efe7f3c4c4b53e081225` ajustaron el costo PBKDF2 al presupuesto efectivo de Pages; `5689d230391119a27593bb32c351218c985f53d3` agregó telemetría de error criptográfico sanitizada.
- **VERIFICADO:** `verify:automation`, `npm run verify`, `npm run build:pages` y los controles de diff aprobaron; el SHA `7f93e29ad64f081b2dd1efe7f3c4c4b53e081225` obtuvo CI, artefacto, Pages y smoke administrativo completo verdes.
- **CANDIDATO SIN SHA FINAL:** el worktree posterior a `a543c39c025a952f632f38c6bf97b4ea3501b0d1` incorpora la evolución UX, stock e imágenes. No registrar aquí un commit, CI, deployment o smoke hasta que exista evidencia directa del SHA contenedor.
- **REGLA DE AUTORREFERENCIA:** el commit que contiene una actualización de cierre no puede incluir su propio hash; resolver siempre el SHA contenedor con Git y validar ese commit por separado.

## 21. Próximo paso exacto

Finalizar y validar el candidato; después resolver el nuevo SHA de `origin/main`, comprobar CI y deployment del mismo SHA y repetir el smoke administrativo completo. Para imágenes, releer que `CATALOG_IMAGES` mantenga `shekinah` en production y `shekinah-preview` en preview, confirmar `publicR2DevEnabled=false` y ejecutar upload/reemplazo/delete autenticados sobre ese deployment. Mantener Checkout Pro y analítica cerrados; Access sólo puede agregarse como defensa compatible que no intercepte el login propio.

## 22. Historial de sesiones

### Sesión 2026-08-04T17:45:46Z

- SHA inicial: `ce1c22903ad31c6ae87da4f747594b1d5184693b`.
- SHA final funcional: `b0386c12e353058cba317c6ce6b169ecac9bd609`.
- Objetivo: auditar y endurecer fulfillment, pagos, persistencia, privacidad, Access, analítica, CI y operación.
- Hallazgos: conflicto de peso silencioso, retiro bloqueado, verificador acoplado, brechas de validación/pruebas/documentación y D1 productiva ausente.
- Archivos modificados: 30 rutas revisadas de fulfillment, idempotencia, Mercado Pago, pruebas, gates, documentación y `src/App.tsx`.
- Pruebas: `npm ci`, Chromium, lint, typecheck, 23/23 archivos y 84/84 pruebas Vitest, verificadores, seguridad, build Pages y 10/10 Playwright aprobados; 0 source maps y bundle principal 492,62 kB.
- Commit: `b0386c12e353058cba317c6ce6b169ecac9bd609` (`fix: harden checkout integrity and fulfillment`).
- Push: `origin/main`, fast-forward, `HEAD == origin/main` verificado.
- CI: run `30937716940`, job `92087942820`, `success`; artefacto `8903843189` y digest registrados.
- Deployment: check `92088244210` success, deployment `d43c5e35-da87-413f-ae61-dab150b017c9`; preview y producción pasaron smoke.
- Bloqueos: D1 ausente, Wrangler/credenciales externas no disponibles, Mercado Pago y Access no verificados; producción no activada.
- Próximo paso: inventario y backup D1 autenticados antes de cualquier configuración externa.

### Sesión 2026-08-04T19:02:01Z

- SHA inicial: `884c9de407c079fcf0a834b50008286c7633ff02`.
- SHA final verificado externamente: `d552fbef4cd5763ffc81864feaeb716767fdfeb8`.
- Objetivo: continuar el inventario y la configuración externa segura.
- Hallazgos: proyecto Pages `shekinah`, Worker homónimo independiente, cero D1, cero variables/secretos/bindings, Zero Trust ausente, previews públicos y `Fail open` en ambos entornos.
- Archivos modificados: documentación operativa y autorreferencia.
- Pruebas: inventario Wrangler, GitHub y panel Cloudflare autenticado; `npm ci`, Chromium, lint, typecheck, 23/23 archivos y 84/84 Vitest, pesos, `npm run verify`, 10/10 Playwright y `npm run build:pages` aprobados; 0 source maps.
- Commit: `9ae41ccbc288dada19733558f342636957292e37` (`docs: record authenticated Cloudflare state`) y `d552fbef4cd5763ffc81864feaeb716767fdfeb8` (`docs: record Cloudflare deployment blocker`).
- Push: ambos fast-forward a `origin/main`; igualdad de SHA verificada para `d552fbef4cd5763ffc81864feaeb716767fdfeb8`.
- CI: run `30942296797`, job Verify `92103489580`, `success`; artefacto `8905654182`, digest `sha256:0ea9d9848c19b230af55864e87369e93766a9407fa1d152159eaabbd3c606233`.
- Deployment: el primer intento sobre `9ae41cc` falló; el siguiente sobre `d552fbe` cerró `success` con check `92103913671`, `https://0031660e.shekinah-7dl.pages.dev` y smoke HTTP aprobado.
- Bloqueos: nombre exacto de D1 preview y Team Domain/AUD de Zero Trust; Mercado Pago sin credenciales.
- Próximo paso: `Fail closed`, luego D1 preview/producción y Access con identificadores autorizados, sin activar comercio.
