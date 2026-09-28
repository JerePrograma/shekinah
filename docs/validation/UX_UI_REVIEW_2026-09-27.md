# Relevamiento y mejora integral UX/UI — 2026-09-27

## Alcance y base

Auditoría de la SPA pública y todas las secciones vigentes del administrador,
con implementación sobre `main`. Base real y remota:
`38d5963e060ef00f2f4dadc9b61717866f216872`. Estado inicial limpio; se ejecutaron
status, switch, fetch, pull fast-forward, segundo status y log antes de editar.
Se leyeron los contratos de AGENTS, las actualizaciones comerciales/editoriales,
el diseño histórico y las validaciones recientes. Los cierres históricos no se
interpretan como instrucciones para revertir la compra directa vigente.

Node `24.18.0`, npm `11.19.1`. Se conservan dependencias y lockfile, History API,
CSS propio, backend, migraciones, flags y configuración productiva. Los fixtures
existentes se interceptan exclusivamente en localhost. No se crean pedidos,
reservas, pagos ni modificaciones editoriales productivas para inspeccionar UX.
La búsqueda de issues abiertos sólo encontró registros técnicos históricos;
no se usaron sus payloads como requisitos ni fuente de catálogo.

## Mapa de experiencias revisadas

| Experiencia real | Objetivo, decisiones y salida | Error y recuperación revisados |
| --- | --- | --- |
| `/` | Presentación autorizada → catálogo o búsqueda → ficha/carrito | Carga inicial, catálogo vacío y error de red diferenciados |
| `/catalogo` | Buscar por nombre/código/categoría → filtrar → páginas de 24 → ficha/agregar | Sin resultados, limpiar, carga fallida/reintento y retorno con filtros/página conservados |
| `/tienda/categoria/:slug` | Recorrer una categoría Dux → ficha o catálogo general | Categoría inexistente tras respuesta válida; red fallida no prueba inexistencia |
| `/:slug` | Imagen/nombre/precio/disponibilidad/stock/fecha/descripción → agregar o volver | Ficha 404, detalle fallido/reintento, ausencia de imagen/precio; sin fallback manual |
| Agregar/carrito | Feedback contextual → editar cantidades/quitar/vaciar → datos | Límite real, cantidad inválida, confirmación segura, Escape, foco, sincronización entre pestañas |
| `/carrito`, retiro | Nombre/celular → validar → preparación/reserva → total confirmado → Checkout Pro | Datos conservados en memoria, errores próximos y foco; no iniciar alta con cantidades inválidas |
| `/carrito`, correo | Domicilio adicional → cotización asistida de envío | Peso/cobertura desconocidos no se presentan como envío gratuito ni total definitivo |
| Compra guardada | Recuperar identidad existente → consultar/continuar pago explícitamente | Carga perceptible, resultado incierto y polling acotado; no duplicar reserva ni preferencia |
| `/pago/exito`, `/pago/pendiente`, `/pago/error` | Consultar servidor → pago aprobado/pendiente/no completado/reintegro/revisión | Error/reintento, sondeo agotado, SHK confirmado también fuera del éxito; URL no acredita pago |
| WhatsApp | Coordinación opcional por enlace autorizado | No enviar automáticamente ni confundir interacción con pedido/pago; consentimiento propio preservado |
| `/privacidad`, consentimiento | Entender datos/retención → aceptar/rechazar/revocar → feedback | Aviso no tapa controles; no medir sin consentimiento; declaración coherente con formulario |
| 404 y mantenimiento | Entender ausencia/indisponibilidad → salida disponible | 404 sólo tras resolución válida; mantenimiento conserva su alcance y excepción administrativa |
| `/admin`, sesión | Login → ubicación → sección → logout | Error de credenciales, carga/retry, sesión perdida, borradores y operaciones activas preservados |
| Resumen | Período → pedidos/pagos/pendientes → interacciones → diagnóstico | Métricas reales y parciales; no convertir sesiones/WhatsApp en facturación |
| Productos | Buscar/filtrar/ordenar global → 50 por página → editar imagen/descripción → guardar | Borradores, error/upload, baja cancelable, republicación y retorno de foco; Dux sigue sólo lectura |
| Pedidos | Solicitudes web/atención/listado → detalle → acción disponible | Contexto de confirmación por pedido, consulta fallida/retry, conciliación y confirmaciones asistidas |
| Dux y editorial ML | Estado → diagnóstico/sync autorizado → controles/revisión editorial | Retry de lectura; errores/ausencias/progreso; credenciales y asociaciones reales no inventadas |
| Visitas y Actividad | Período → tablas/métricas/CSV para operación | Datos parciales/vacíos, lectura protegida; panel ML legacy no importado no cuenta como pantalla vigente |

## Hallazgos y decisiones implementadas

| Severidad práctica | Evidencia anterior | Cambio mínimo y validación |
| --- | --- | --- |
| Alta | `WebOrderRequestSection` deshabilitaba el CTA con datos inválidos; `showErrors` sólo se activaba por flujos anteriores. | Validación previa al alta web; errores visibles, nombre accesible estable y foco. Ninguna llamada antes de corregir. |
| Alta | Cantidad escrita inválida conservaba cantidad anterior del estado comercial y permitía continuar. | Validar el borrador visible y disponibilidad antes del alta; bloquear WhatsApp con explicación. Tests con cero, exceso y corrección. |
| Alta | `AdminPage` conservaba `confirmingReject`, error y éxito al seleccionar otro pedido. | Limpiar contexto al cambiar pedido y bloquear cambio durante acción activa. Tests con dos pedidos y respuesta diferida. |
| Alta | Red fallida devolvía vacío/null; podía mostrar “sin productos” o 404 sin comprobar existencia. | Estado de carga/error explícito, retry deduplicado; timeout de 15 s para GET catálogo/ficha. Sólo 404 válido devuelve ausencia de ficha. |
| Alta | Aviso analítico fijo de 316,75 px ocultaba completamente un botón enfocado en 360×640/390×640. | Aviso en flujo normal; decisión opcional preservada y prueba de foco/teclado sin superposición. |
| Media | Volver de una ficha borraba búsqueda, categoría y página. Chromium confirmó búsqueda vacía tras Back. | Contexto en memoria durante la navegación, sin persistir ni enviar búsquedas; limpiar siempre disponible y con foco. |
| Media | Navegación móvil dejaba Carrito en segunda fila; encabezado 179,84 px. | Tres opciones en una fila, ancho completo: 131,22 px, libera 48,62 px sin ocultar navegación. |
| Media | Foco en `main` no aseguraba comenzar la nueva ruta arriba; foco administrativo no seguía sección. | Llevar nueva ruta al inicio sin animación y enfocar título de sección administrativa. Mantener History API y protección de salida. |
| Media | Detalle de pedido y diagnóstico Dux fallidos exigían salir/reentrar. | Retry explícito de GET; no dispara sincronización ni mutación. |
| Media | IDs/preferencia/registro técnico precedían acciones del pedido; pagos vacíos aludían erróneamente a período. | Resumen operativo y acciones primero, datos técnicos en `details`; vacío específico del pedido. |
| Media | Solicitudes y pendientes administrativos heredaban el gran espaciado de las secciones públicas. | Agrupación compacta antes del listado, conservando todos sus controles y estados. Capturas móvil/escritorio y comprobación de overflow. |
| Media | Confirmación asistida no enfocaba Cancelar ni respondía a Escape. | Foco seguro, Escape y retorno al disparador en preparación/liberación/finalización. Son confirmaciones inline, no modales con captura de Tab. |
| Media | El número comercial sólo se mostraba en aprobación normal; recuperación inicial sin mensaje propio. | SHK en los demás estados autoritativos y “Buscando una compra guardada…”. No mostrar WEB ni tokens. |
| Media | Privacidad negaba pedir nombre/teléfono pese al formulario. | Texto veraz sobre nombre/celular/domicilio, recuperación y pagos; retención/consentimiento sin cambios. |

Las decisiones de error y foco se contrastaron con
[WCAG 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html),
[4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) y
[2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
La jerarquía operativa, el menú compacto y la memoria de filtros son decisiones
de producto justificadas por tareas, no requisitos textuales de WCAG.
Se prefieren `details`, controles HTML y tipos de input nativos. No se copia un
sistema visual ni se incorpora una dependencia para estos comportamientos.

## Conservación y decisiones descartadas

- Productos administrativos conserva filtro/orden global antes de 50 filas,
  editor y borrador, confirmaciones, baja reversible y recuperación del foco.
  La segunda pasada refuerza etiquetas visibles y errores comprensibles sin
  modificar estos algoritmos ni los campos editables.
- La compra conserva retiro sin aprobación administrativa, consulta/reserva Dux,
  total server-side, continuación automática sólo del intento iniciado, recuperación
  explícita, tiempos/sondeo e idempotencia. Los pagos siguen requiriendo evidencia
  financiera y la limpieza del carrito sigue condicionada al intento coincidente.
- No se oculta stock/fecha pública ni se infieren unidades. No se incorporan controles
  para editar precio, inventario, identidad o categorías Dux.
- Se descartó un rediseño visual del dashboard, galería, tarjetas o paleta sin
  evidencia de tarea fallida. El resumen sí se reordenó por tareas comerciales;
  la base visual, reduced motion, lazy admin e imágenes se conservan.
- Se descartó timeout genérico de mutaciones comerciales: su resultado incierto
  requiere el protocolo existente, no un retry ciego. El nuevo plazo afecta sólo GET
  de catálogo y ficha. No se prometen tiempos del proveedor.
- No se abre mantenimiento ni se reactivan catálogo manual, Link de Pago o ML legacy.
  No se reescribe documentación histórica ni migraciones aplicadas.

## Segunda pasada: administrador sin conocimientos técnicos

La aclaración del encargo se incorporó sobre el mismo checkout de `main`, conservando todas
las correcciones anteriores. Se revisaron deliberadamente los textos visibles de
sesión, Resumen, Productos/editor/imágenes, Pedidos, solicitudes/pendientes,
preparación asistida, Dux, Mercado Libre, visitas y actividad. Se buscaron API,
D1, Cloudflare, webhook, OAuth, token, snapshot, reconciliación, scheduler, payload,
mapping, schema, runtime, provider, HTTP y sus códigos. Los identificadores en
código y contratos no se renombran; se corrige su exposición en la interfaz.

| Antes | Uso normal después | Información conservada aparte |
| --- | --- | --- |
| Backoffice, Analítica, Auditoría | Administración, Visitas, Actividad; Productos y Pedidos preceden a Dux y Mercado Libre | Identidad de sesión y registros para soporte cuando son necesarios |
| Métricas y configuración técnica al mismo nivel | Pendientes y acciones del negocio primero; Estado de la tienda con cifras disponibles, sin sumar grupos que se superponen | Configuración, endpoints, códigos y comprobaciones detrás de Información para soporte |
| Conciliar con Mercado Pago | Verificar pago, explicando que consulta y actualiza el estado correspondiente | Referencias de pago y diagnóstico del error |
| Papelera sin etiqueta visible | Dar de baja junto a Editar; Publicado/Dado de baja antes del precio | Descripción y stock conservan sus desplegables |
| Error recibido sin filtrar al guardar | Qué no pudo confirmarse, borrador conservado y siguiente paso; un error desconocido no expone la respuesta interna | Los registros del servidor se conservan; no se inventa una nueva consola |
| Almacenamiento administrativo pendiente | La carga de imágenes no está habilitada; se puede editar la descripción y pedir ayuda para fotos | No se ofrecen controles de infraestructura |
| Snapshot/sync/estados internos de Dux y ML | Actualizar productos desde Dux, actualizar contenido y comprobar la publicación, con progreso comprensible | Estados crudos, identificadores y revisión editorial histórica plegados |

El diagnóstico antiguo de unidades/reservas de Dux no determina por sí solo la
disponibilidad de la compra directa actual. Esos indicadores pasan a soporte y se
eliminan las afirmaciones indiscriminadas de compra bloqueada. El detalle de stock
explica su antigüedad y que precio/disponibilidad deben confirmarse antes de pagar;
no habilita ninguna compra ni cambia los controles del servidor.

Una compra que requiere revisión ya no se presenta como una espera automática.
La preparación asistida permite volver a consultar después de un fallo sin repetir
la operación; un fallo de lectura conserva la evidencia existente, y una nueva
consulta de precios exige volver a confirmar la reserva antes de preparar el pago.
En el resumen, los pendientes preceden al filtro de fechas; su acceso a Pedidos
limpia un filtro de estado anterior. El foco de Pedidos queda antes de solicitudes,
incidencias y listado, sin omitir los primeros paneles. En móvil, las seis secciones
son visibles y el listado de pedidos se apila con etiquetas por dato.

La evaluación de cinco segundos se usa como revisión heurística de jerarquía,
no como ensayo realizado con comerciantes: buscar/editar/publicar son acciones
visibles, pedidos separa pago de estado comercial, y los errores indican el próximo
paso. La comprobación con usuarios reales sigue no disponible. Se contrastan las
instrucciones y sugerencias de corrección con
[WCAG 3.3.2](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)
y [3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html).

## Evidencia de validación

Baseline verificado: instalación limpia y Chromium; 123 archivos Vitest,
901 aprobadas y 14 omisiones históricas; Playwright 38/38. Suites dirigidas previas:
público 36, checkout 65 y administración 17 aprobadas. Fixtures y servidores locales,
sin proveedores reales. La invocación inicial mediante `npm.ps1` interpretó argumentos
de workers como configuración npm; se usó `npm.cmd`/CLI directo posteriormente.

La primera iteración pública falló por expectativas del encabezado de carga, dos
regiones status simultáneas y un mock que reutilizaba un Response consumido. Se
corrigieron UI y fixtures; 40/40 posteriores. Lint detectó un matcher `any` en la
prueba nueva, corregido. Checkout tuvo dos fallos de prueba que ayudaron a separar
errores del label y esperar la recuperación; 68/68 posteriores. Administración
ajustó fixtures de red para no consumir el error en GET catálogo; 34/34 posteriores.
Privacidad/analítica 7/7 y consentimiento E2E 2/2. No se ocultan intentos fallidos.

Antes de la aclaración pasó una ejecución completa de `npm run verify`: 124
archivos, 917 pruebas aprobadas, 14 omitidas y 44 E2E. La repetición siguiente
detectó un matcher `any` en la nueva prueba de dos líneas de carrito; se corrigió
sin modificar el comportamiento y pasó ESLint dirigido. En la segunda pasada,
la primera prueba de soporte confundió contenido plegado con ausente del DOM:
se corrigió a verificar que no es visible hasta abrir `details`. Las suites de
productos, estado de tienda, stock y ficha pasaron 35/35 después del ajuste.
La corrida posterior de productos y estado de tienda pasó 28/28, incluyendo la
limpieza de errores al cambiar de editor y un código desconocido `toString` que no
debe interpretarse como un mensaje propio. Dux/ML pasó 28/28 en cuatro suites y
ESLint de seis archivos. Los tres paneles de pedidos pasaron de 19/19 a 26/26;
ESLint detectó `String(input)` en una prueba nueva, se corrigió discriminando
`string`, `URL` y `Request`, y la segunda ejecución pasó.

La primera E2E de la segunda pasada administrativa falló en cinco selectores
ambiguos por el nuevo botón Ver pedidos y en un fixture sin categoría. Se
corrigieron selectores exactos y fixture, sin rebajar expectativas: 11/11 posteriores,
incluida la inspección del texto visible normal a 360 px. Los últimos ajustes de
foco, filtro y orden del resumen se vuelven a validar en la corrida global final.
La repetición global detectó tres opciones `exact` de Playwright trasladadas a
Testing Library, cuyo tipo no las admite. Se quitaron; la coincidencia por nombre
string sigue siendo exacta. No se modificó la interfaz para resolver ese fallo.
La corrida siguiente terminó con 939 aprobadas, 14 omitidas y un fallo en la prueba
existente de actualización diferida durante una baja paginada: el clic a la segunda
página podía adelantarse al efecto de la carga inicial. Se sincronizó el montaje
asíncrono con `act`, sin cambiar paginación, tiempos máximos ni aserciones. La suite
ya pasaba aislada; se repite también dentro de la validación completa.
ESLint exigió además un `await` explícito dentro del callback asíncrono de `act`;
se incorporó la espera de microtarea antes de repetir el contrato completo.

Revisión visual local y automatizada, sin afirmar que todos los flujos se probaron
en todos los anchos:

- Catálogo/navegación: 320, 360, 390, 768, 1366 y 1440 px; ficha móvil a 390 px.
- Privacidad/consentimiento: 360, 390, 768, 1366 y 1440 px; comprobación adicional
  a 320 px. El aviso dejó de tapar el control enfocado a 360×640 y 390×640.
- Carrito/compra: recorrido nuevo a 360 px, además de los recorridos móvil/escritorio
  existentes, datos inválidos, cantidades, red lenta, errores y retorno financiero.
- Pedidos: 360, 390, 768, 1366 y 1440 px; productos/editor también a 1024 px.

Se revisan overflow, teclado, Escape, foco, errores de ejecución, formulario y
movimiento reducido. Capturas temporales fuera de Git. El catálogo público conserva
24 tarjetas y 461 nodos DOM en la muestra, antes y después, con búsqueda conservada
al volver. La prueba local adicional con 878 productos administrativos ficticios
mostró 18 páginas, máximo de 50 fichas montadas, 28 en la última, búsqueda global
del SKU 877 desde página 18 y reset a página 1; la primera medición tuvo 2.073
nodos y la final 1.976. La comprobación final tuvo 0 px de overflow a 360 px,
0 mutaciones y 0 errores de página. No es una medición de campo ni SLA.
Los controles principales móviles superan 24×24 CSS px, mínimo AA de
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), con sus excepciones normativas.

La revisión cruzada final también corrigió el foco al pasar de la resolución de
catálogo a producto/categoría/404 sin cambiar URL y el aviso obsoleto al eliminar
una línea inválida. La prueba de dos líneas confirma que sólo se envía el producto
restante; CartPage 18/18. El plazo GET de 15 s está revisado por código y por la
presencia de AbortSignal; las fallas/reintentos se ejecutaron con fixtures 503,
sin simular una conexión colgada durante todo el plazo.

La inspección final del administrador usó capturas normales de viewport, sin
`fullPage`, a 360×800 y 1440×900: Resumen, Pedidos y detalle tuvieron 0 px de
overflow, 0 errores de consola/React y 0 mutaciones. El título de Pedidos precede
a solicitudes y pendientes y recibe foco. En 360×800, Para revisar y su cantidad
aparecen en la primera pantalla; el CTA requiere un desplazamiento corto de
aproximadamente 85 px. No se confunde esa observación con un ensayo de usuarios.

### Cierre local

| Control ejecutado | Resultado |
| --- | --- |
| `npm ci` | Verificado: 201 paquetes; dependencias y lockfile sin modificaciones. Avisos detallados abajo. |
| `npm run install:browsers` | Verificado: Chromium disponible. |
| `npm run lint` | Verificado dentro de `verify`. |
| `npm run typecheck` | Verificado dentro de `verify`. |
| `npm run test` | Verificado dentro de `verify`: 124 suites, 940 aprobadas y 14 omitidas preexistentes. |
| `npm run test:e2e` | Verificado dentro de `verify`: 45/45 en Chromium y Chromium mantenimiento. |
| `npm run verify` | Verificado, salida 0: incluye además catálogo, comercio, pesos, build, assets, seguridad y automatización. |
| `npm run build:pages` | Verificado, salida 0: repite lint, TypeScript, 940 pruebas aprobadas/14 omitidas y controles de publicación. |
| `git diff --check` | Verificado; sin errores de whitespace. |
| Enlaces documentales locales | Verificado: 16 enlaces, ninguno roto. |
| Revisión del diff y artefactos | Revisado por código: 55 archivos del encargo, sin cambios de dependencias, backend, migraciones, binarios ni capturas. |

La ejecución global final usó `VITEST_MAX_WORKERS=2`, sin cambiar configuración
del repositorio ni reducir tests. Los avisos `NO_COLOR`/`FORCE_COLOR` de las
herramientas y `vite:prepare-out-dir` no son errores React ni métricas de campo.
El bundle de producción conserva administración separada: entrada 303,59 kB
(92,23 kB gzip), administración 163,70 kB (42,29 kB gzip), CSS 42,19 kB
(8,31 kB gzip). No se incorporan dependencias.

SHA final, CI, artefacto y deployment se cotejan después del push y se informan
separadamente en el cierre: este documento no puede contener su propio SHA.

### Seguimiento de publicación — 2026-09-28

El primer commit publicado, `56072a62762ce9b632e23f011681ea156c42e492`, pasó
[CI 36371332244](https://github.com/JerePrograma/shekinah/actions/runs/36371332244),
incluyendo el procedimiento Dux con mocks y la sintaxis del script D1. Generó
el artefacto `shekinah-dist-56072a62762ce9b632e23f011681ea156c42e492`.
Sin embargo, el deployment Pages `3e217521-0fc3-4261-b5c5-ba6a6e5499c6` falló:
939 pruebas aprobadas, 14 omitidas y una carrera en el test de conservación del
borrador tras un guardado fallido. La alerta ya estaba en el DOM, pero el efecto
que comunica `busy: false` todavía no había notificado al consumidor.

Se espera ahora la última llamada exacta del callback mediante `waitFor`, sin
cambiar su aserción, los tiempos máximos ni el código del producto. También se
comprueba que Guardar cambios esté habilitado antes del reintento. La prueba
dirigida volvió a pasar: ProductManager 23/23. También volvieron a aprobar
`npm run verify` (940 aprobadas, 14 omitidas, 45/45 E2E) y `npm run build:pages`
(940 aprobadas, 14 omitidas y todos sus controles), ambos con salida 0.
Los resultados remotos de la corrección se informan por SHA.

El smoke público con Chromium y validación TLS estricta no estuvo disponible:
`ERR_CERT_AUTHORITY_INVALID` antes de una respuesta HTTP utilizable. No acredita
ni un problema general del dominio ni la versión servida. Un segundo intento
sin esa validación se interrumpió sin resultados utilizables; el script temporal
quedó restaurado a TLS estricto. No hubo login ni operaciones comerciales.
La consulta HTTPS directa al dominio, también con validación de certificado,
falló al establecer la conexión SSL; tampoco aporta evidencia de contenido.

## Límites reales

No disponible: revisión manual con lector de pantalla, pruebas con usuarios reales
y métricas de campo. La automatización no certifica WCAG completa. No se declara
aprobación de Core Web Vitals: los umbrales de
[web.dev](https://web.dev/articles/vitals) corresponden al percentil 75 de campo,
no a estos recorridos locales. Las latencias Dux, scheduler, autorización editorial
ML y cierre operativo de reservas mantienen las incidencias y contratos registrados
en CURRENT_STATE. No se cambian secretos, bindings, D1 ni configuración externa.
Sondeo acotado no implica que toda petición tenga tiempo máximo: la recuperación
inicial y varias consultas administrativas conservan los plazos de red existentes.
No se añadió un timeout con reintento automático a operaciones que pueden afectar
pedidos, pagos o reservas.

La instalación informó cuatro avisos preexistentes de dependencias (dos moderados
y dos altos), confirmados mediante `npm audit --json`. No se aplicó `audit fix` ni
se cambiaron versiones o lockfile en este encargo de interfaz. No se presenta el
árbol de dependencias como libre de avisos.
