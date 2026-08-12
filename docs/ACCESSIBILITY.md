# Accesibilidad

## Objetivo

La interfaz prioriza lectura clara, navegación predecible y funcionamiento completo por teclado en escritorio y móvil.

## Controles implementados

- enlace `Saltar al contenido` como primer destino de teclado;
- regiones semánticas de encabezado, navegación, contenido principal y pie;
- un único `h1` por vista y jerarquía de encabezados;
- `aria-current="page"` en navegación y paginación;
- foco visible de alto contraste;
- traslado de foco al contenido principal después de una navegación cliente;
- labels explícitos para búsqueda y categoría;
- contador del catálogo anunciado mediante `aria-live`;
- paginación anterior y siguiente con estados deshabilitados nativos, anuncio de página y foco en el primer resultado nuevo;
- enlaces de tarjetas con nombres accesibles;
- textos alternativos para imágenes comerciales;
- `loading="lazy"` y `decoding="async"` en imágenes;
- texto `Imagen no disponible` para el producto sin imagen;
- soporte de `prefers-reduced-motion`;
- diseño sin desbordamiento horizontal a 320, 390, 768 y 1440 px.

## Backoffice de catálogo candidato

La evolución administrativa conserva HTML semántico y agrega:

- búsqueda y filtros con labels explícitos;
- estados de disponibilidad y stock expresados con texto, no sólo color;
- miniaturas con alternativa útil o estado textual de imagen ausente;
- mensajes de carga, guardado, upload, éxito y error mediante regiones vivas apropiadas, con reintento cuando falla la carga inicial;
- errores próximos al campo y asociados al control;
- botones con nombre accesible y diferenciación textual de acciones destructivas;
- foco del primer control inválido, incluso para categorías y opciones avanzadas cerradas;
- confirmaciones específicas con foco inicial en la acción segura, cierre con `Escape` y retorno al disparador;
- foco visible, navegación completa por teclado y advertencia sólo cuando existen cambios sin guardar;
- protección ante salida por navegación cliente, historial, cierre de sesión o descarga mientras existen cambios o una operación remota activa;
- reordenamiento responsive del listado/editor sin overflow global en 390, 768, 1024 y 1440 px.

El selector de archivo mantiene un control nativo utilizable por teclado. La zona visual de selección no sustituye el input y comunica explícitamente que la vista previa es local y se subirá al guardar. La CSP permite `blob:` exclusivamente en `img-src` para esa preview revocable; scripts, estilos, conexiones y persistencia mantienen sus restricciones anteriores.

## Catálogo y fichas

Al cambiar la búsqueda o la categoría se vuelve a la primera página y se anuncian el total filtrado y la página actual. Al paginar, el foco pasa al primer producto nuevo; un resultado vacío ofrece limpiar los criterios. Los controles no requieren puntero. Las fichas omiten los campos ausentes.

Agregar al carrito combina respuesta en el propio botón, cantidad contextual persistente, límite real deshabilitado, actualización perceptible del contador y una región viva que reemplaza su contenido para poder repetir anuncios idénticos. El carrito usa controles explícitos para aumentar, reducir y eliminar; una cantidad inválida nunca se interpreta como eliminación. Al quitar una línea, el foco se conserva en el siguiente resultado útil o en el estado vacío.

Vaciar el carrito requiere una confirmación específica que comienza en la acción segura, acepta `Escape` y devuelve el foco. El checkout expone su estado ocupado y explica la redirección. El retorno de pago anuncia verificación, polling, resultado o error autoritativo y permite reintentar cuando termina el sondeo o falla la consulta.

La imagen no es necesaria para conocer nombre, categoría, presentación o precio. Las galerías usan contenido semántico y las presentaciones, cuando existen, se muestran con encabezados y datos textuales.

## Navegación por teclado

En la carga inicial, Tab enfoca el enlace de salto. Los enlaces internos conservan `href` reales. Atrás y adelante del navegador actualizan vista, metadatos y foco; si el editor administrativo tiene cambios, la salida se confirma y una cancelación restaura la entrada actual. Los botones del paginador anuncian su estado deshabilitado.

## Pruebas

Vitest y React Testing Library verifican estructura, estados, resultados, navegación, producto sin imagen y cambios de filtro. Las pruebas de rutas recorren los 510 productos y las 16 categorías.

Playwright ejecuta el build compilado y comprueba navegación, búsqueda, filtro, paginación, fichas, carrito, retorno de pago, administración, privacidad, 404, teclado, foco y ausencia de desbordamiento en 320, 390, 768 y 1440 px. También ejecuta un flujo público con `prefers-reduced-motion: reduce`.

## Límite

La automatización no sustituye una revisión manual con lector de pantalla y usuarios reales. Los cambios de contenido, color, estructura o interacción requieren repetir esa revisión. Esta sección describe el contrato del candidato; no registra por sí sola una revisión visual, Playwright, CI o smoke remoto nuevos.
