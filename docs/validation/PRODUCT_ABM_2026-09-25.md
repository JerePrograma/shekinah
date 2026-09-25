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

## Primera publicación y habilitación D1

Commit funcional: `aec95f8ae0c7668886cd4b9f704eeb68b9d0de4f`, publicado con
`git push origin main`; SHA remoto confirmado por `git ls-remote`.

- **CI verificado:** [ejecución 552 / 36162880321](https://github.com/JerePrograma/shekinah/actions/runs/36162880321),
  evento push/main, conclusión success; job Verify `108163487032` y todos sus
  pasos success, finalizado a las 16:50:12 UTC.
- **Artefacto verificado:** `shekinah-dist-aec95f8ae0c7668886cd4b9f704eeb68b9d0de4f`,
  ID `10876543079`, 52.275.688 bytes, digest
  `sha256:8151054dd613571e931adb9d869356159fe13643a6664e4b951819b11469839f`.
- **Pages verificado:** deployment production `9a882777-7a53-441a-8f56-1394ff928f9e`,
  success sobre el mismo SHA, comprobado a las 16:49:40 UTC.
- **D1 verificado:** bookmarks previos conservados localmente; sólo 0025 pendiente.
  Aplicación por Wrangler primero Preview (5 comandos / 1,95 ms), comprobación de
  esquema/FK/historia y luego Production (5 comandos / 2,19 ms), ambas salida 0.
- **Esquema verificado:** ambas bases con 0001–0025 contiguas, tabla nueva y tres
  triggers presentes; `foreign_key_check` sin resultados. Tabla web vacía.
- **Historia verificada:** Preview 14 pedidos / 1 pago, Production 18 / 0;
  cero mutaciones manuales y cero decisiones web en ambas. Las lecturas posteriores
  tienen `rows_written=0`.
- **Configuración verificada:** mismos bindings DB/R2 y flags comerciales/editoriales.
  No se cambia mantenimiento, no se activa Checkout Pro ni se reintroduce Link de Pago.
- **HTTP técnico verificado:** URL inmutable HTTPS de Pages devuelve 200 en `/`,
  `/admin` y `/api/catalog`; 401 `ACCESS_TOKEN_MISSING` al intentar leer productos
  administrativos sin sesión. Catálogo observado: 878 productos con estado de publicación.
- **HTTPS canónico desde CLI no disponible:** Node y Windows HTTP rechazaron la
  cadena (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`); Node con almacén de confianza del
  sistema tampoco resolvió el problema. Es consistente con la intermediación local
  registrada en [el rollout previo](COMMERCE_D1_ROLLOUT_2026-09-13.md).
  No se deshabilitó TLS ni se agregó una CA. Chrome sí abrió el administrador con
  sesión vigente sin intersticial, pero el control de la pestaña sufrió timeouts al
  abrir la lista; esa observación no se cuenta como smoke completo.

## Comprobación de escala y ajuste

La prueba adicional local con 863 productos sintéticos (1,92 MB) descartó un bucle
de lecturas o renderizado: carga de lista 1,49 s, búsqueda 164 ms, un único GET,
cero escrituras y consola limpia. Encontró una pausa de 7,04 s al abrir el editor
manteniendo 35.466 nodos; se incorpora paginación de 50 filas después del filtro y
orden global. El editor conserva su estado al cambiar de página. La búsqueda sigue
abarcando todos los productos y las bajas siguen después de todos los publicados.

Los tiempos sintéticos no acreditan rendimiento de red o datos productivos.
La repetición local con 878 productos y paginación montó sólo 50 filas / 2.225 nodos:
lista 292 ms, búsqueda 48 ms, restaurar resultados 110 ms, editor 158 ms y escritura
104 ms. Consola sin errores/advertencias, cero mutaciones API y sin tareas largas
durante cinco segundos de reposo. La comparación orienta el ajuste y no es un SLA.

Pruebas del ajuste: 21/21 unitarias administrativas y 2/2 Playwright dirigidas.
Cubren búsqueda más allá de la primera página, bajas al final del orden global,
límites de navegación, estado del editor al cambiar página y actualización diferida
mientras la confirmación está abierta. La revisión independiente acreditó filtro/orden
previo a paginar y foco recuperable cuando una fila cambia de página.

`npm run verify` repetido sobre el ajuste: **verificado**, salida 0; 123 archivos,
901 pruebas aprobadas / 14 omitidas preexistentes y Playwright 38/38. Lint,
TypeScript, catálogo, pesos, build, activos, seguridad y automatización aprobados.
`npm run build:pages` repetido sobre el ajuste: **verificado**, salida 0;
901 aprobadas / 14 omitidas y artefacto final generado. Controles de diff y de
archivos preparados nuevamente con salida 0; dependencias sin cambios.

La evidencia del SHA final, CI y Pages después del ajuste se informa en el cierre
de entrega; la primera publicación precedente se conserva como secuencia histórica.
