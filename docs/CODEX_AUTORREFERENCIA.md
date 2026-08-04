# Shekinah — Autorreferencia operativa de Codex

```yaml
schema_version: 1
project: shekinah
repository: JerePrograma/shekinah
local_checkout: C:\laburo\shekinah
branch: main
remote: origin/main
last_verified_sha: ce1c22903ad31c6ae87da4f747594b1d5184693b
last_verified_at: 2026-08-04T18:11:46Z
last_ci_run_id: 30914349947
last_ci_conclusion: success
cloudflare_pages_check: success
commerce_enabled: false
analytics_enabled: false
whatsapp_enabled: no_verificado
d1_preview: no_verificado
d1_production: ausente
mercado_pago_mode: no_verificado
```

## 1. Identidad del proyecto

- **VERIFICADO:** checkout local `C:\laburo\shekinah`, repositorio remoto `JerePrograma/shekinah`, rama `main` y seguimiento `origin/main`.
- **VERIFICADO:** aplicación React 19, TypeScript estricto y Vite 8 publicada mediante Cloudflare Pages con Pages Functions.
- **VERIFICADO:** Node.js `24.18.0` y npm `11.16.0` en la sesión iniciada el 2026-08-04.

## 2. Regla de autoridad

La autoridad se resuelve en este orden: Git sincronizado; código y configuración rastreados; pruebas ejecutadas; migraciones y esquema efectivo; configuración externa autenticada; CI y deployment ligados al SHA exacto; documentación vigente; este archivo; contexto histórico.

- **VERIFICADO:** este archivo no reemplaza ninguna de esas fuentes y debe reconciliarse al inicio de cada sesión.
- **BLOQUEADO:** los estados externos no consultables con una sesión autenticada permanecen `no_verificado`; nunca se completan por inferencia.

## 3. Estado Git verificado

- **VERIFICADO:** `HEAD` y `origin/main` son `ce1c22903ad31c6ae87da4f747594b1d5184693b` después de `fetch` y `pull --ff-only`.
- **VERIFICADO:** la rama activa es `main`; el worktree inicial estaba limpio, sin staged, untracked ni unmerged.
- **VERIFICADO:** el commit de referencia `ce1c22903ad31c6ae87da4f747594b1d5184693b` coincide con la base real.
- **VERIFICADO:** no se crearon ramas, pull requests, worktrees ni stashes; no se usó force-push ni se reescribió historial.

## 4. Arquitectura vigente

- **REVISADO_POR_CÓDIGO:** la SPA vive en `src/`; la navegación usa History API y las rutas públicas conservan el fallback de Vite/Pages.
- **REVISADO_POR_CÓDIGO:** `functions/api/` expone checkout, webhook, estado público, analítica, privacidad y administración; la lógica compartida vive en `server/`.
- **REVISADO_POR_CÓDIGO:** Cloudflare D1 implementa pedidos, intenciones de checkout, fulfillment, eventos de pago, analítica, retención y auditoría.
- **REVISADO_POR_CÓDIGO:** el catálogo comercial rastreado genera el catálogo de Functions mediante `scripts/generate-commerce-catalog.mjs`.

## 5. Invariantes funcionales

- **VERIFICADO:** el catálogo canónico conserva 510 productos y 16 categorías.
- **REVISADO_POR_CÓDIGO:** el servidor vuelve a leer productos y precios canónicos; el navegador no fija moneda, subtotal, envío ni total.
- **REVISADO_POR_CÓDIGO:** el checkout usa ARS y Mercado Pago Checkout Pro por redirección.
- **REVISADO_POR_CÓDIGO:** comercio, analítica y WhatsApp deben permanecer cerrados hasta completar autorización y configuración externa.

## 6. Invariantes de seguridad

- **REVISADO_POR_CÓDIGO:** secretos y credenciales se leen únicamente desde bindings o variables de servidor; no existen variables `VITE_*` para secretos.
- **REVISADO_POR_CÓDIGO:** los endpoints mutables aplican origen same-origin y límites de payload; el webhook verifica firma antes de procesar el cuerpo.
- **REVISADO_POR_CÓDIGO:** las rutas administrativas requieren JWT de Cloudflare Access y validación interna RS256.
- **VERIFICADO:** `public/_headers` aplica CSP sin `unsafe-inline` ni `unsafe-eval`; el sitio público entregó esas cabeceras el 2026-08-04.

## 7. Catálogo y activos

- **VERIFICADO:** 510 productos, 16 categorías y 484 imágenes en la base inicial.
- **VERIFICADO:** el reporte inicial fue 297 por presentación, 103 por nombre, 110 desconocidos y 1 conflicto; el reporte corregido es 296 por presentación, 103 por nombre, 111 desconocidos, 1 ambiguo explícito y 0 conflictos silenciosos.
- **VERIFICADO:** el conflicto corresponde a `naranja-en-rodajas-deshidratada-x-250-gr`: nombre `Naranja en rodajas deshidratada x 250 gr`, presentación `50 g`, derivación por nombre 250 g y por presentación 50 g.
- **REVISADO_POR_CÓDIGO:** no se modifican nombre, presentación, SKU, precio, slug, referencia ni imagen para resolver el conflicto.

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
- **VERIFICADO:** `server/migrations.test.ts` aplica `0001`, `0002` y `0003`, preserva pedidos históricos, consulta `sqlite_schema` y prueba backfill, idempotencia, constraints y cascade.

## 10. Mercado Pago y webhooks

- **REVISADO_POR_CÓDIGO:** la preferencia contiene productos, una línea explícita de envío, ARS, `external_reference`, `notification_url`, `back_urls` y `auto_return`.
- **REVISADO_POR_CÓDIGO:** el webhook obtiene el pago autoritativo y valida firma, ID, pedido, monto completo, moneda y transiciones de estado.
- **REVISADO_POR_CÓDIGO:** los estados terminales no se degradan; `refunded` y `charged_back` prevalecen sobre estados anteriores.
- **VERIFICADO:** las respuestas de pago y preferencia validan sus IDs; el GET de pago debe devolver exactamente el recurso solicitado y la recuperación debe devolver el ID encontrado.
- **VERIFICADO:** pruebas sin credenciales reales cubren la línea de envío, ARS, total completo, firma ausente/inválida, evento duplicado, monto/moneda incompatibles y aprobación autoritativa.
- **BLOQUEADO:** credenciales, modo y aplicación real de Mercado Pago no se verificaron ni se activarán sin autorización expresa.

## 11. Administración y Cloudflare Access

- **REVISADO_POR_CÓDIGO:** `/api/admin/*` pasa por `functions/api/admin/_middleware.ts`; `server/access.ts` valida issuer, audience, expiración, `nbf`, algoritmo RS256 y firma con JWKS.
- **REVISADO_POR_CÓDIGO:** listados y detalle toleran pedidos históricos sin fulfillment; el CSV neutraliza prefijos de fórmulas.
- **VERIFICADO:** una petición pública no autenticada a `/admin` respondió 401 el 2026-08-04.
- **BLOQUEADO:** la aplicación y política externas de Cloudflare Access no se comprobaron con una sesión autenticada.

## 12. Analítica, consentimiento y retención

- **REVISADO_POR_CÓDIGO:** el cliente no envía analítica sin consentimiento y no incluye PII de pedidos.
- **REVISADO_POR_CÓDIGO:** `purgeAnalyticsIfDue` reclama una ejecución mensual y elimina sesiones, eventos y revocaciones anteriores al corte configurado.
- **REVISADO_POR_CÓDIGO:** `ANALYTICS_RETENTION_DAYS` acepta de 1 a 730 días; la política documentada exige 730 en producción.
- **VERIFICADO:** el endpoint público de analítica respondió `ANALYTICS_DISABLED` el 2026-08-04.
- **VERIFICADO:** las pruebas cubren 1/729/730 válidos, 0/-1/731/texto inválidos, corte exacto, reclamo concurrente, cambio de mes y liberación del reclamo tras fallo.

## 13. Variables, flags, bindings y secretos

- **VERIFICADO:** el comercio y la analítica públicos están deshabilitados.
- **VERIFICADO:** el webhook respondió `DATABASE_UNAVAILABLE`; el binding D1 de producción no está disponible en el deployment público consultado.
- **NO_VERIFICADO:** WhatsApp, D1 preview, Mercado Pago y los valores externos de Cloudflare Access.
- **REVISADO_POR_CÓDIGO:** `.env*`, `.dev.vars`, el `wrangler.jsonc` real, `dist`, logs y backups están excluidos o prohibidos para publicación.

## 14. CI, artefactos y deployment

- **VERIFICADO:** run de CI inicial `30914349947`, job Verify `92008572787`, conclusión `success`, sobre `ce1c22903ad31c6ae87da4f747594b1d5184693b`.
- **VERIFICADO:** artefacto inicial `8894433999`, `shekinah-dist-ce1c22903ad31c6ae87da4f747594b1d5184693b`, digest `sha256:89a42e537b9c8d66fd314235fcbcae9636c7933e48b28e222ca64f60a684e8d7`.
- **VERIFICADO:** check inicial Cloudflare Pages `success`; deployment `d23fa0ab-b90e-472b-853c-f81050809aa1` y URL de preview `https://d23fa0ab.shekinah-7dl.pages.dev`.
- **VERIFICADO:** `https://shekinah-7dl.pages.dev/` respondió HTTP 200 el 2026-08-04.

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

**VERIFICADO:** desde `npm ci` aprobaron instalación de Chromium, lint, TypeScript, 23 archivos/84 pruebas Vitest, el gate integral `npm run verify`, 10 pruebas Playwright y `npm run build:pages`. El catálogo conserva 510 productos, 16 categorías y 484 imágenes; no hay source maps. El bundle principal bajó de 501,73 kB a 492,62 kB minificado y ya no emite la advertencia.

## 16. Decisiones tomadas

1. **VERIFICADO:** una contradicción entre dos fuentes explícitas de peso no se resuelve eligiendo una; se clasifica como desconocida para Correo Argentino.
2. **VERIFICADO:** retiro coordinado cuesta ARS 0 y no necesita peso para habilitarse.
3. **VERIFICADO:** el generador genera y el verificador se ejecuta explícitamente desde ambos gates.
4. **VERIFICADO:** las migraciones publicadas no se editaron; la corrección de esquema es la migración aditiva `0003`.
5. **VERIFICADO:** producción permanece cerrada; no se ejecutan cargos, migraciones remotas ni activaciones.
6. **VERIFICADO:** una reserva idempotente debe fijar carrito y fulfillment; una reserva histórica sin huella de carrito admite un único reclamo y luego queda cerrada a cambios.

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
| SHK-010 | ALTA | Producción | Cloudflare | binding D1 | El webhook público no dispone de DB. | D1, migraciones y bindings verificados antes de activar comercio. | Respuesta pública `DATABASE_UNAVAILABLE`. | Pagos no reconciliables si se activara comercio. | Mantener flags cerrados; configurar sólo con acceso y backup. | Smoke externo autenticado. | BLOQUEADO |
| SHK-011 | MEDIA | Continuidad | `docs/CODEX_AUTORREFERENCIA.md` | archivo requerido | El archivo no existía en la base. | Memoria operativa versionada y reconciliable. | Archivo creado y `verify:automation` aprobado. | Continuación dependiente de contexto externo. | Documento y orden de lectura agregados. | Automatización documental. | VERIFICADO |
| SHK-012 | ALTA | Idempotencia | `server/fulfillment.ts` | `reserveCheckoutIntent` | Una reserva huérfana fijaba sólo fulfillment y podía aceptar otro carrito. | La misma clave fija carrito y fulfillment aun antes de existir pedido. | Reproducción por flujo y pruebas secuencial/concurrente. | Reutilización semántica de clave y pedido inesperado. | Migración `0003`, backfill y reclamo condicional. | Mismo/diferente carrito, normalización y concurrencia. | VERIFICADO |

## 18. Riesgos y bloqueos externos

- **BLOQUEADO:** D1 de producción no está enlazada al deployment público consultado; no aplicar migraciones remotas sin inventario y backup verificable.
- **BLOQUEADO:** D1 preview, Access, aplicación de Mercado Pago, webhook del proveedor y WhatsApp requieren configuración autenticada o datos autorizados.
- **BLOQUEADO:** no se realizará ningún pago, devolución ni activación productiva sin confirmación inmediata.
- **INFERENCIA:** una intención huérfana puede persistir si una operación falla tras reservarla; sólo contiene huellas, fija carrito y fulfillment y la misma solicitud puede reintentarse. No existe una política de limpieza, pero tampoco almacena PII en claro.
- **BLOQUEADO:** Wrangler no está instalado globalmente ni en `node_modules`; la compatibilidad D1 se ejecuta con el adaptador SQLite del repositorio, no contra D1 local de Wrangler.

## 19. Archivos y símbolos críticos

- `src/commerce/fulfillment.ts`: `validateFulfillment`, `deriveUnitWeightGrams`, `calculateShippingQuote`, `fulfillmentCanonicalValue`.
- `src/commerce/checkout-session.ts`: `checkoutFingerprint`, ventana y persistencia de la clave del navegador.
- `server/fulfillment.ts`: `reserveCheckoutIntent`, `persistOrderFulfillment`, `createPaymentCart`.
- `server/orders.ts`: `cartFingerprint`, `prepareOrder`, reclamo de preferencia, recuperación y actualización por pago.
- `server/mercado-pago.ts`: creación/recuperación de preferencias y consulta autoritativa de pagos.
- `functions/api/checkout/preferences.ts`: orquestación de checkout e idempotencia.
- `functions/api/webhooks/mercadopago.ts`: autenticación y conciliación de webhooks.
- `server/access.ts` y `functions/api/admin/_middleware.ts`: frontera administrativa.
- `server/analytics-retention.ts`: reclamo mensual y purga.
- `migrations/0001_commerce.sql`, `migrations/0002_fulfillment_and_retention.sql`: migraciones publicadas preservadas sin cambios.
- `migrations/0003_checkout_intent_cart_fingerprint.sql`: migración aditiva nueva para cerrar la reserva de carrito.
- `scripts/verify-shipping-weights.mjs`: clasificación auditable de pesos.

## 20. Último diff aplicado

- **VERIFICADO:** 30 rutas forman el cambio revisado: lógica de fulfillment/idempotencia/Mercado Pago, migración `0003`, pruebas, gates, documentación operativa, autorreferencia y carga diferida de `/admin`.
- Base del diff: `ce1c22903ad31c6ae87da4f747594b1d5184693b`.

## 21. Próximo paso exacto

Preparar únicamente las 30 rutas revisadas, comprobar el diff staged, crear el commit de implementación y publicar en `origin/main`; después verificar CI, artefacto y Pages sobre ese SHA.

## 22. Historial de sesiones

### Sesión 2026-08-04T17:45:46Z

- SHA inicial: `ce1c22903ad31c6ae87da4f747594b1d5184693b`.
- SHA final: pendiente.
- Objetivo: auditar y endurecer fulfillment, pagos, persistencia, privacidad, Access, analítica, CI y operación.
- Hallazgos: conflicto de peso silencioso, retiro bloqueado, verificador acoplado, brechas de validación/pruebas/documentación y D1 productiva ausente.
- Archivos modificados: 30 rutas revisadas de fulfillment, idempotencia, Mercado Pago, pruebas, gates, documentación y `src/App.tsx`.
- Pruebas: `npm ci`, Chromium, lint, typecheck, 23/23 archivos y 84/84 pruebas Vitest, verificadores, seguridad, build Pages y 10/10 Playwright aprobados; 0 source maps y bundle principal 492,62 kB.
- Commit: pendiente.
- Push: pendiente.
- CI: baseline `30914349947` success; falta el SHA final.
- Deployment: baseline público HTTP 200; falta el SHA final y D1 productiva está ausente.
- Bloqueos: configuración externa autenticada y activación productiva.
- Próximo paso: commit de implementación, push y evidencia remota sobre el SHA exacto.
