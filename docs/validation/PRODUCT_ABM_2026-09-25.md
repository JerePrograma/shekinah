# Validación de gestión simplificada de productos — 2026-09-25

## Base

Trabajo directo en `main`, árbol inicial limpio, sincronizado con `origin/main`.
SHA base: `9e1d49038e4f5c710c9d425cbcf6989ee99ac4a1`.
No se crearon ramas, worktrees, stashes ni PR. No se utilizó force-push.

El [contrato funcional](../PRODUCT_ABM.md) describe la edición web y la baja reversible.
Se reemplaza el editor manual inalcanzable por el editor de contenido Dux; se conserva
la firma de interacción con el backoffice y la protección de navegación/sesión.

## Preflight externo de sólo lectura

Lectura autenticada del 25 de septiembre a las 16:23:59 UTC:

- Pages production base `9617b1c1-b7da-4aa1-970e-56a80be56c7e`, status success,
  commit igual al SHA base.
- Ambas D1 con 0001–0024 contiguas y sin tabla de edición web todavía.
- Preview: 14 pedidos, 1 pago, 0 mutaciones manuales.
- Production: 18 pedidos, 0 pagos, 0 mutaciones manuales.
- Bindings DB y CATALOG_IMAGES aislados por entorno y flags comerciales conservados.
- Consultas con `rows_written=0`; no se ejecutó sincronización, pedido, reserva ni pago.

Recibos locales ignorados: `.wrangler/abm-20260925/`.

## Controles locales

Node.js 24.18.0, npm 11.16.0, conforme a `.node-version` y `package.json`.

- `npm ci`: verificado; 201 paquetes, cuatro avisos de auditoría preexistentes
  (dos moderados y dos altos). Dependencias y lockfile sin cambios.
- `npm run install:browsers`: verificado.
- Pruebas iniciales: fallaron fixtures con precio centinela ARS 1, opciones `exact`
  ajenas a Testing Library y nombre accesible del textarea que incluía la ayuda.
  Se corrigieron fixtures, tipos de prueba y asociación de label/descripción.
- Primer lint: fallido por JSON `any` y stringificación de Request en tests nuevos;
  corregidos mediante tipos/narrowing explícitos.
- Regresión UI dirigida: verificado, 18/18; incluido refresco público diferido y foco
  al finalizar la baja, seis órdenes, errores, repetición de clic, guardado y borrador.
- Playwright administrativo dirigido: verificado, 9/9. Flujo edición/baja/reactivación,
  teclado, navegación y cierre de sesión; 390, 768, 1024 y 1440 px sin overflow con editor.
- Revisión visual: verificada sobre capturas locales de 390 y 1440 px; controles y
  editor legibles. Las capturas son fixtures técnicos y no se incorporan a Git.
- Revisión independiente: detectó foco prematuro durante refresh y pedido local
  pendiente si ocurría una baja antes del primer POST. Correcciones y regresiones
  incorporadas sin relajar recuperación de reservas ya intentadas.
- Suite general: verificado, 123 archivos; 898 pruebas aprobadas y 14 omitidas
  por sus condiciones preexistentes. Sin nuevas omisiones.
- `npm run verify`: verificado, salida 0; lint, TypeScript, catálogo, pesos,
  build, activos, seguridad, automatización y Playwright completo 37/37.
- Primer `build:pages`: falló lint sobre una expresión regular del helper local
  ignorado de consulta CI, creado después de `verify`; corregido ese helper sin
  cambiar código distribuido. Se repite el comando completo para acreditar cierre.
- `npm run build:pages`: verificado en la repetición completa, salida 0;
  898 aprobadas / 14 omitidas y artefacto de producción generado.
- `git diff --check` y `git diff --cached --check`: verificados. El primer control
  con archivos nuevos preparados encontró una línea vacía al EOF de una prueba;
  corregida antes del commit y controles repetidos con salida 0.
- Dependencias/lockfile y alcance: verificado, sin cambios de dependencias,
  sin binarios, dist ni capturas en el cambio. Enlaces nuevos: 11/11 válidos.
- Secretos y datos personales: revisado por código y escaneo de patrones; no se
  incorporan credenciales ni datos personales reales nuevos.
- PowerShell: verificado el parser de `apply-commerce-d1.ps1` y los 27/27 casos
  simulados de `finalize-dux-catalog.tests.ps1`; no ejecutan activación remota.

## Archivos del cambio

- `README.md`
- `docs/AUTHORIZED_ASSETS.md`
- `docs/CODEX_AUTORREFERENCIA.md`
- `docs/CONTINUATION.md`
- `docs/CURRENT_STATE.md`
- `docs/PRODUCT_ABM.md`
- `docs/validation/PRODUCT_ABM_2026-09-25.md`
- `functions/api/admin/products.test.ts`
- `functions/api/admin/products/[id].ts`
- `functions/api/admin/products/[id]/image.test.ts`
- `functions/api/admin/products/[id]/image.ts`
- `migrations/0025_dux_product_web_settings.sql`
- `server/assisted-checkout.test.ts`
- `server/assisted-checkout.ts`
- `server/catalog-store.ts`
- `server/direct-checkout.test.ts`
- `server/direct-checkout.ts`
- `server/dux-product-admin.ts`
- `server/dux-product-web-settings.test.ts`
- `server/dux-product-web-settings.ts`
- `server/dux-public-catalog.ts`
- `server/web-order-requests.ts`
- `server/web-request-rate-limit.ts`
- `src/admin/ProductEditor.tsx`
- `src/admin/ProductList.tsx`
- `src/admin/ProductManager.test.tsx`
- `src/admin/ProductManager.tsx`
- `src/admin/product-management-types.ts`
- `src/catalog/model.ts`
- `src/commerce.css`
- `tests/e2e/admin.spec.ts`

La validación completa, CI, artefacto, migración y deployment se registran al cerrar.
No se considera habilitación remota por la sola aprobación de pruebas simuladas.
