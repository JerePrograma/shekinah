# Validación de Marketing — 2026-10-22

## Base y alcance

Inicio con árbol limpio en `main`, sincronizado por fast-forward con
`origin/main`: `05805e8f28b1693fdfea2f740adb0cd573a001e9`.
Node `24.18.0`, npm `11.16.0`. No se crearon ramas, worktrees ni stashes.

Se implementaron campañas administrativas, cupones porcentuales, promociones
automáticas y anuncios programables. El contrato y las propuestas posteriores
están en [ECOMMERCE_MARKETING.md](../ECOMMERCE_MARKETING.md).

Dux conserva identidad, nombre base, precio base, unidades, stock y reservas.
El descuento web se calcula y fija antes de preparar la orden. Dux y Mercado
Pago reciben las mismas líneas finales; el precio base y la regla aplicada
permanecen auditables. No se reemplazan los guards anteriores ni se reescriben
pedidos históricos. Se conservan los overrides editoriales y las bajas web.

## Validaciones locales

| Control | Resultado |
| --- | --- |
| Instalación reproducible `npm ci` | Verificado, sin cambios de dependencias ni lockfile |
| Instalación Chromium | Verificado |
| `npm run verify` | Verificado: 131 suites, 1.207 pruebas aprobadas, 14 omitidas existentes; 55/55 E2E |
| `npm run build:pages` final | Verificado: 131 suites, 1.208 pruebas aprobadas, 14 omitidas existentes; build y verificadores aprobados |
| Caso adicional tras verify | Verificado dentro del build final: cotización promocional vencida tras fallo de almacenamiento vuelve a leer base Dux sin duplicar orden/reserva/cupo |
| Cadena completa 0001–0029 sobre SQLite limpio | Verificado: cero violaciones FK, cero campañas, guards creados |
| `git diff --check` | Verificado antes de preparar archivos |
| Revisión monetaria/SQL/HTTP independiente | Revisado por código y pruebas de integración |
| QA visual | Verificado en 1440, 390 y 320 px; capturas locales fuera de Git |

Los escenarios incluyen porcentajes/redondeos, mínimos, topes, SKU exactos,
vigencia, carrera por último cupo, campaña cambiada entre lectura y batch,
cotización adulterada, mejor promoción automática con cupón explícito,
respuesta Dux perdida, schema/guard ausente, conservación de idempotencia,
recuperación de pago, borradores administrativos y alta repetida de campaña.
Un cupón no puede pasar a gestión asistida al precio íntegro si se cierra DIRECT.

### Intentos fallidos conservados

1. Primer verify: lint encontró conversiones genéricas y callbacks async sin
   espera en pruebas nuevas. Se corrigieron y se repitió la validación.
2. Primer E2E de Marketing: dos casos móviles tenían una carrera en el helper
   al abrir el menú antes de resolver sesión; corregido sin reducir aserciones.
3. QA visual encontró el campo de cupón estrecho a 320 px; se corrigió la grilla
   y se agregó una aserción de ancho mínimo de 100 px.
4. Segundo verify: 53/55 E2E, dos escenarios anteriores no simulaban el nuevo
   endpoint de beneficios y recibían HTML de Vite. Se agregó respuesta vacía de
   campañas en esos fixtures; el verify siguiente terminó 55/55.
5. Consulta remota de comprobación con seis términos UNION: Cloudflare rechazó
   la lectura con `7500 too many terms in compound SELECT`. Se sustituyó por
   subconsultas escalares y se verificó correctamente. No era una migración ni
   una operación comercial; no se repitió ninguna mutación por ese error.

## Migraciones remotas

Se verificó el proyecto **Pages** `shekinah`, separado del Worker homónimo.
Las bases Preview y Production tienen UUID diferentes y sólo faltaban 0028/0029.
Se usó Wrangler fijado `4.131.0`, con OAuth existente, sin leer ni imprimir tokens.

| Entorno | D1 | Bookmark anterior a migración |
| --- | --- | --- |
| Preview | `48d8ae41-8910-4f8e-b537-3706c07e2cbf` | `000000b0-00000000-0000510c-f62ec17f9d1fc41a839d2b5608962e2a` |
| Production | `533c7c65-1dbb-4f15-be96-c6088700a8e1` | `00000c43-00000000-0000510c-5568d56e3ca55db070c3f78444db49e5` |

Preview se migró y verificó antes de migrar Production. Ambas registran
`0028_marketing.sql` y `0029_marketing_direct_checkout.sql` en `d1_migrations`.
Se verificaron las dos tablas, dos índices y seis triggers nuevos, y
`PRAGMA foreign_key_check` devolvió cero filas en ambos entornos.

| Entorno | Pedidos antes/después | Pagos antes/después | Líneas antes/después | Items Dux antes/después | Campañas / cupos |
| --- | --- | --- | --- | --- | --- |
| Preview | 14 / 14 | 1 / 1 | 14 / 14 | 749 / 749 | 0 / 0 |
| Production | 12 / 12 | 2 / 2 | 29 / 29 | 905 / 905 | 0 / 0 |

SHA-256 de las migraciones aplicadas:

- 0028: `14785507f549bcb8e55203f41da964630ad90231c09ac40bf0776d36741bcc30`.
- 0029: `1629ded4f09ecfe53a98175d4031a5f4a199bfe029fb011b2170d82a8c696ec9`.

No se crearon campañas reales, órdenes, reservas Dux, preferencias ni pagos.
No se modificaron flags, mantenimiento, secretos o datos comerciales existentes.

## Archivos de la iteración

Documentación: `README.md`, `docs/CONTINUATION.md`, `docs/CURRENT_STATE.md`,
`docs/ECOMMERCE_MARKETING.md` y este informe.

Servidor y Functions:

- `functions/api/admin/marketing.ts`
- `functions/api/marketing.ts`, `functions/api/marketing.test.ts`
- `functions/api/orders/request.ts`, `functions/api/orders/request.test.ts`
- `migrations/0028_marketing.sql`, `migrations/0029_marketing_direct_checkout.sql`
- `server/marketing.ts`, `server/marketing.test.ts`, `server/marketing-checkout-schema.ts`
- `server/direct-checkout.ts`, `server/direct-checkout.test.ts`, `server/direct-checkout-progress.ts`
- `server/web-order-requests.ts`, `server/web-order-requests.test.ts`
- `server/assisted-payment.ts`, `server/assisted-checkout-admin-state.ts`
- `server/assisted-checkout.ts`, `server/assisted-checkout.test.ts`

Interfaz y recorridos:

- `src/App.tsx`, `src/pages/HomePage.tsx`, `src/pages/AdminPage.tsx`
- `src/pages/CartPage.tsx`, `src/pages/CartPage.test.tsx`
- `src/admin/AdminShell.tsx`, `src/admin/admin.css`
- `src/admin/AdminBackoffice.tsx`, `src/admin/AdminBackoffice.test.tsx`
- `src/admin/MarketingPanel.tsx`, `src/admin/MarketingPanel.test.tsx`
- `src/admin/AssistedCheckoutAdminPanel.tsx`, `src/admin/AssistedCheckoutAdminPanel.test.tsx`
- `src/commerce/CartBenefits.tsx`, `src/commerce/CartBenefits.test.tsx`, `src/commerce.css`
- `src/commerce/marketing-contracts.ts`
- `src/commerce/WebOrderRequestSection.tsx`, `src/commerce/WebOrderRequestSection.test.tsx`
- `src/commerce/web-order-contracts.ts`, `src/commerce/web-order-contracts.test.ts`
- `src/commerce/web-request-api.ts`, `src/commerce/web-request-api.test.ts`
- `src/marketing/api.ts`, `src/marketing/Announcements.tsx`, `src/marketing/Announcements.test.tsx`, `src/marketing.css`
- `tests/e2e/marketing.spec.ts`, `tests/e2e/commerce.spec.ts`

## Publicación y límites

El hash del commit que contiene este informe no puede incluirse en sí mismo.
El cierre de la conversación acredita por separado el commit creado, push,
SHA final de `origin/main`, CI, artefacto, deployment Pages y smoke del mismo SHA.
No se afirma publicación sólo por haber aplicado migraciones o compilado.

Antes de activar una campaña real falta acreditar externamente un pedido Dux
con precio unitario promocional y su correlación con Checkout Pro. Las pruebas
sintéticas no lo sustituyen; no se hizo una compra real. El límite cuenta pedidos
iniciados, sin liberación automática de cupo ni identificación de cliente único.

Limitación heredada revisada por código: `handleAdminRequest` registra auditoría
después de la mutación; un fallo de auditoría no revierte una campaña ya guardada.
El alta idempotente y la actualización del listado permiten recuperar el resultado
sin duplicarla. No se alteró ese mecanismo compartido en esta iteración.

Se conservan las incidencias externas previas de cadencia Dux y datos logísticos
incompletos. El catálogo compilado histórico usado por verificadores no sustituye
el inventario Dux vigente. No se versionan capturas, `dist`, credenciales ni archivos
temporales. No se utilizó force-push ni ninguna operación destructiva de Git.
