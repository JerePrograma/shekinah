# Compra clara y recuperación del carrito — 2026-09-30

## Encargo y base

El titular pidió simplificar el recorrido para personas sin conocimientos técnicos,
incluidas personas mayores. La captura aportada mezclaba un error de recuperación,
datos de entrega incompletos y dos botones competidores: continuar al pago y
consultar una compra anterior.

Base limpia: `ef523efac35a13318b82e9fbcb47a313f16b3d1d`, en `main` y
`origin/main`, después de status, switch, fetch, pull fast-forward, segundo status
y revisión del historial. No se crean ramas, worktrees, PR ni stashes.

## Diagnóstico y comportamiento

`WebOrderRequestSection` convertía todos los errores en el mismo mensaje.
Si IndexedDB conservaba la identidad de una prueba eliminada, la recuperación
devolvía `404 WEB_REQUEST_NOT_FOUND` y se mostraban simultáneamente alta y consulta.
Un fallo de conexión también dejaba ofrecer el alta aunque el intento pudiera
haberse registrado. El servidor ya preservaba la identidad y rechazaba una
reutilización incompatible; el problema estaba en la guía pública.

- Un `404` estructurado propio permite volver al formulario. Se conserva la
  misma identidad en IndexedDB y el envío requiere un gesto explícito. No se
  borra la clave ni se ignora la protección entre pestañas. Un 404 HTML, otro
  código, un 503 o un fallo de red nunca se interpretan como pedido inexistente.
- Una respuesta perdida ofrece sólo «Volver a intentar» para recuperar. Si la
  lectura confirma que no existe, se puede reenviar deliberadamente con la misma
  clave. No hay creación automática ni rotación de identidad ante incertidumbre.
- Un enlace inexistente explica cómo volver al carrito, sin crear pedidos.
- Sin datos completos: «Completar mis datos» enfoca el primer campo incorrecto.
  Con retiro y datos válidos: «Continuar al pago». Correo usa «Consultar costo de
  envío» y conserva el total pendiente de confirmación.
- «Tus datos» explica su uso en una frase. «¿Cómo querés recibir tu compra?»
  reemplaza «Modalidad». Nombre y celular permanecen obligatorios; dirección se
  solicita sólo para Correo. Un pedido recuperado no vuelve a pedir sus datos.
- Los errores de nombre/celular indican cómo corregirlos. No cambian validación,
  normalización, longitudes admitidas ni datos persistidos.
- El resumen muestra el total estimado cuando se puede calcular y lo identifica
  como tal. Al confirmar el servidor, muestra una sola vez el total definitivo.
  No altera importes ni atribuye un costo cero a un envío desconocido.
- Una sola acción principal según el estado. Los errores de apertura de Mercado
  Pago mantienen el botón de esa misma compra; revisión de reserva ofrece ayuda
  por WhatsApp y una consulta secundaria de estado. El enlace no envía mensajes
  automáticamente, no contiene datos del formulario, referencias ni secretos y
  no reemplaza el circuito de reserva/pago. No se promete contacto automático.
- Menos textos y marcos repetidos. Texto de controles y errores de 16 px y altura
  mínima de 48 px en campos y acciones del carrito. Foco, teclado, regiones de
  estado y movimiento reducido conservados. No se cambian estilos administrativos.

Las decisiones de instrucciones correctivas y tamaño de interacción se contrastan
con [WCAG 3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html)
y [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
La elección de 48 px es una decisión de diseño; no se presenta como el umbral
normativo de ese criterio. No se realizó una evaluación con usuarios mayores ni
lector de pantalla y no se afirma una certificación total de accesibilidad.

## Conservación

Se mantienen contratos de servidor, stock/reserva Dux, total autoritativo,
idempotencia, tiempos y límites de consulta, Mercado Pago y evidencia financiera.
La recuperación de una compra lista nunca abre el proveedor sin un gesto nuevo.
Un pago pendiente conserva la advertencia de no volver a pagar incluso después
de agotar las lecturas automáticas. Se preservan guards, esquema, bindings,
secretos, flags, mantenimiento y checkout legacy retirado. No hay dependencias
nuevas ni cambios al lockfile.

La operación es de código y presentación: no crea ni elimina solicitudes, pedidos,
reservas o pagos productivos, ni modifica datos de D1 o de proveedores. La limpieza
puntual anterior no se repite. El HTTP 400/524 de sincronización Dux y el cierre
general de reservas nunca confirmadas siguen fuera de este cambio de interfaz.

## Validación

- Node `24.18.0` y npm `11.16.0`: verificados.
- `npm ci` y `npm run install:browsers`: verificados. Se conservan cinco alertas
  de dependencias existentes (dos moderadas, tres altas); no se ejecutó audit fix.
- Suite dirigida inicial: cuatro archivos y 84 pruebas aprobadas.
- Primer lint: falló por la sintaxis de tipo `import()` en el mock de Vitest.
  Se reemplazó por el import tipado de `vi.mock`, sin cambiar código comercial.
- Segundo lint y typecheck: verificados después de corregir el mock.
- Primera suite de navegador dirigida: 17 pruebas aprobadas. Se revisaron las
  capturas móviles del formulario/resumen, reserva en revisión y error de conexión.
- Primer `npm run verify`: falló en `AdminBackoffice.test.tsx:146`, al buscar
  sin espera «Ver pedidos» mientras el informe aún cargaba (980 aprobadas,
  una fallida y 14 omitidas). La prueba administrativa aislada pasó sus cuatro
  casos. El botón depende de la respuesta asíncrona del informe; se sustituyó
  sólo esa búsqueda por `await findByRole`, sin alterar la aplicación administrativa.
  El fallo y su causa se conservan como parte del registro.
- Las pruebas de navegador usan respuestas controladas y datos sintéticos.
  Comprueban la referencia eliminada con IndexedDB real, conservación de clave,
  recuperación de red, una acción principal, ausencia de creación implícita,
  navegación por teclado, campos legibles y anchos 320/390/768/1440.
- Segundo `npm run verify`: verificado, salida 0. Pasaron 125 archivos de pruebas
  con 981 casos aprobados y 14 omitidos; también los 49 recorridos de navegador,
  lint, TypeScript, catálogo, pesos, build, activos, seguridad y automatización.
  La advertencia de pago pendiente se conserva aun después de agotar las consultas.
- Revisión visual: verificada en capturas de Chromium con datos sintéticos.
  La comprobación de teclado verifica además que el campo enfocado no quede
  oculto por la cabecera fija. No se usaron pedidos ni pagos productivos.
- Enlaces relativos de los tres documentos: 40 revisados, ninguno roto.
- `npm run build:pages`: verificado, salida 0; repite los 125 archivos, 981 casos
  aprobados y 14 omitidos, y termina build, activos, seguridad y automatización.
- Diff completo revisado, sin cambios de dependencias, binarios, artefactos,
  secretos ni datos personales productivos añadidos. `git diff --check`: verificado.
  Se preparan únicamente las 14 rutas enumeradas abajo y se comprueba además
  `git diff --cached --check` antes del commit.

## Archivos del cambio

- `src/pages/CartPage.tsx` y `src/commerce/WebOrderRequestSection.tsx`:
  recorrido, mensajes, jerarquía de acciones, foco y recuperación.
- `src/commerce/web-request-api.ts` y `src/commerce/fulfillment.ts`:
  identificación de errores propios y mensajes correctivos.
- `src/commerce.css` y `src/commerce/web-order-requests.css`: legibilidad y controles.
- `src/pages/CartPage.test.tsx`, `src/commerce/WebOrderRequestSection.test.tsx`,
  `src/commerce/web-request-api.test.ts` y `tests/e2e/commerce.spec.ts`: regresiones.
- `src/admin/AdminBackoffice.test.tsx`: espera del botón cargado de forma asíncrona.
- `docs/CURRENT_STATE.md`, `docs/CONTINUATION.md` y este registro: estado y evidencia.

## Publicación

El SHA del commit, push, ejecución CI con jobs/artefacto y deployment Pages del
mismo SHA se acreditan por separado después de publicar, en el informe de cierre.
Un push por sí solo no acredita producción. No se ejecutan compras reales como
prueba de humo de esta presentación.
