# Rediseño visual de administración — 2026-09-28

## Base y alcance

Estado inicial limpio sobre `main`, sincronizado por `fetch` y `pull --ff-only` con
`origin/main`: `4e9160c28704c213855f010eb05dc1c37c9bd7f3`. Se ejecutaron status,
switch main, fetch, pull, status y revisión de los últimos veinte commits antes de
editar. Sin rama, PR, worktree ni stash. Se conserva íntegro el registro de la
[iteración anterior](UX_UI_REVIEW_2026-09-27.md), incluido su primer despliegue fallido.

El encargo rechaza expresamente el resultado visual anterior y pide una aplicación
administrativa coherente, conservando sus mejoras funcionales. El
[contrato de diseño](../design/ADMIN_APPLICATION.md) documenta estructura,
jerarquía, escala y límites. Sólo se modifican interfaz, pruebas y documentación.

## Diagnóstico y comparación visual

Las capturas previas acreditan cabecera pública y navegación administrativa
duplicadas, títulos desproporcionados, demasiado espacio antes de los datos,
acciones de igual peso y tarjetas anidadas. El detalle de pedido quedaba después
del listado; Productos dedicaba gran parte de la primera pantalla a introducción
y controles. En escritorio, el botón principal de Dux ocupaba casi todo el ancho.

Se capturaron los mismos siete estados con datos sintéticos locales: acceso,
Inicio, Pedidos, detalle, Productos, editor y Actualizaciones. Tamaños 360×800,
390×844 y 1440×900; cada estado tiene captura del viewport y de página completa.
La comparación usa ocho productos y tres pedidos de fixtures, sin consultar ni
mutar proveedores reales. Las capturas y scripts temporales quedan fuera de Git,
en `shekinah-admin-redesign-20260928` del directorio temporal del usuario.

La primera pasada posterior produjo 42 capturas. La inspección encontró desborde
del grupo CSV a 360/390 px, entradas al detalle/editor demasiado bajas, la etiqueta
del total pegada al importe y accesos de Pedidos redundantes. Se corrigieron
ancho flexible, foco/desplazamiento inmediato, jerarquía del total y duplicación
visual. La revisión cruzada detectó además un destino de paginación oculto: el
título del listado ahora es visible junto al contador. Se corrigieron los niveles
de encabezados secundarios sin alterar acciones.

La revisión posterior encontró una barra de guardado que tapaba parte del textarea
móvil; ahora permanece en el flujo. El desplazamiento heredaba además 144 px de
espacio reservado para la cabecera pública: se elimina sólo cuando está montada
la administración. El margen propio mantiene el título bajo el menú móvil. Los
grupos de exportaciones y filtros reciben un rol compatible con su nombre accesible.

Altura de página completa con los mismos fixtures y desplegables inicialmente
cerrados; no es una métrica de rendimiento ni un ensayo con usuarios:

| Pantalla | 360 px antes → después | 1440 px antes → después |
| --- | --- | --- |
| Inicio | 3454 → 1162 px | 2268 → 900 px |
| Productos, ocho filas | 4151 → 2400 px | 3040 → 1570 px |
| Actualizaciones | 2619 → 1053 px | 1832 → 900 px |

Inicio ofrece su acción principal dentro de 360×800; Pedidos incluye la primera
fila y Ver detalle en ese viewport. La barra lateral permanece visible en
escritorio, el menú abierto cabe en móvil y lista/editor muestran la selección
relacionada. La descripción se puede editar sin superposición de Guardar cambios.

La evidencia final `after-reviewed` contiene 58 PNG: 29 capturas de viewport y
29 de página completa. Se inspeccionaron las 29 vistas; además de las siete
pantallas originales incluye menú móvil abierto, pedido con pago confirmado y
editor con descripción desplegada. No hubo errores de página durante la captura.
Los títulos móviles del detalle y editor mantienen foco y aparecen entre 64 y
120 px de la parte superior; las dos pruebas adicionales de posición pasan 2/2.

## Secuencia de validación

Se usa Node 24.18.0 de `.node-version`, con npm 11.16.0 compatible. `npm ci` y
`npm run install:browsers` terminaron con salida 0. Se conservaron las dependencias
y el lockfile; los cuatro avisos de instalación preexistentes (dos moderados y
dos altos) no se modificaron en este encargo visual.

Las suites dirigidas aprobaron: AdminPage 20; proveedores/readiness 24;
AdminBackoffice/ProductManager/App 39. La primera ejecución E2E dirigida dio
11/13: las dos nuevas pruebas móviles detectaron el desborde de CSV. Después de
corregirlo, ambas pasaron (2/2). No se quitaron ni suavizaron esas aserciones.

Una repetición dirigida dio 12/13 por un umbral geométrico nuevo de 20 px aplicado
al título del listado, cuya altura real y legible es 18,1875 px. Se corrigió el
umbral a 16 px, manteniendo foco, ancho y ausencia de recorte: la prueba vuelve a
detectar el título oculto de 1 px. Repetición de paginación 1/1 y ESLint dirigido
aprobados. No se cambió la escala tipográfica para satisfacer un número arbitrario.

`npm run verify` terminó con salida 0: lint, TypeScript, 124 suites con 942 pruebas
aprobadas y 14 omitidas preexistentes, verificaciones de catálogo/comercio/pesos,
build, assets, seguridad, automatización y 47/47 E2E (incluido mantenimiento).
Se usó `VITEST_MAX_WORKERS=2` sin cambiar la configuración ni excluir pruebas.
Los últimos ajustes de foco, nombres accesibles y visibilidad durante error/carga
se incluyen en `build:pages` y en la repetición dirigida de interfaz.

La auditoría automatizada con axe-core 4.13.0, instalado sólo en el directorio
temporal, revisó 29 estados bajo reglas WCAG A/AA aplicables: cero infracciones. La pasada
posterior a los roles de grupo tuvo también cero resultados incompletos. Cero
desbordes horizontales en los 29 estados. Contraste calculado de la paleta:
texto principal 12,64:1, secundario al menos 5,70:1, botón principal 5,97:1,
badges al menos 5,75:1 y borde de campo/blanco 3,03:1.

Revisión independiente: 72 reglas públicas de CSS equivalentes antes/después,
incluyendo contexto, orden y declaraciones; 126 funciones con nombre ajenas a JSX
preservadas, salvo textos de encabezado y el formateador presentacional agregado.
Se revisaron los 23 archivos del encargo y 36 enlaces documentales locales, sin
roturas. No se incluyen capturas, binarios, dist, credenciales ni artefactos temporales.

`npm run build:pages` terminó con salida 0 sobre los últimos ajustes: lint,
TypeScript, 124 suites con 942 aprobadas/14 omitidas y controles de publicación.
El bundle mantiene administración separada: JS administrativo 171,17 kB
(44,24 kB gzip), CSS administrativo 25,38 kB (5,10 kB gzip), CSS público
22,97 kB (5,32 kB gzip). No se agregaron dependencias.
`git diff --check` y la revisión del contenido a preparar no detectaron errores.
Git, CI, artefacto, SHA de Pages y dominio se verifican separadamente; este
registro no puede contener el SHA del commit que lo incorpora.

Antes de publicar, la base tiene CI 36372734394 y check Pages exitosos con SHA
exacto, deployment `cd806a77-4cbf-498c-b803-0c23f4074dd9`. El CLI GitHub directo
carecía de sesión; la lectura API funcionó con la credencial Git existente en
memoria. El GET directo de Cloudflare falló con HTTP 401/código 10000; no se
renovaron credenciales ni se acreditan configuración externa/bindings actuales.
El GET estricto del dominio `/` y `/admin` falló antes de HTTP utilizable:
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` en Node y `SEC_E_UNTRUSTED_ROOT` en Schannel.
Se conserva el fallo; no se omitió validación TLS ni se iniciaron sesiones remotas.
CI y check Pages del nuevo commit se cotejan después del push.

## Alcance operativo y límites

Revisado por código: se conservan endpoints, payloads, guards, deduplicación,
autoridad Dux y preservación financiera. Ningún archivo de Functions, migración,
workflow, configuración productiva o dependencia forma parte del cambio.
No se sincronizan proveedores, crean pedidos, reservan existencias ni cobran pagos
para validar el diseño. El fallback y el mantenimiento públicos conservan sus
contratos; la publicación de código no acredita por sí sola una operación comercial.

La evaluación incluye teclado, foco, etiquetas, tamaño de acciones principales,
contraste calculado y lectura visual; no equivale a certificación WCAG completa,
ensayo con usuarios ni prueba manual con lector de pantalla.
