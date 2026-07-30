# Accesibilidad

## Objetivo

La interfaz prioriza lectura clara, navegación predecible y funcionamiento completo por teclado en escritorio y móvil.

## Controles implementados

- enlace `Saltar al contenido` como primer destino de teclado;
- regiones semánticas de encabezado, navegación, contenido principal y pie;
- un único `h1` por vista y jerarquía de encabezados;
- `aria-current="page"` en navegación y `aria-current="page"` en la página actual del paginador;
- foco visible de alto contraste;
- traslado de foco al contenido principal después de una navegación cliente;
- labels explícitos para búsqueda y categoría;
- contador y cambios del catálogo anunciados mediante `aria-live`;
- paginación anterior/siguiente con estados deshabilitados reales;
- enlaces de tarjetas con nombres accesibles y sin dependencia exclusiva de color o imagen;
- textos alternativos históricos para imágenes comerciales;
- `loading="lazy"` y `decoding="async"` en imágenes del catálogo;
- superficie CSS con el texto `Imagen no disponible` para el único producto sin imagen;
- advertencias comercial y sanitaria visibles, no modales;
- soporte de `prefers-reduced-motion`;
- diseño sin desbordamiento horizontal a 320, 390, 768 y 1440 px.

## Catálogo y fichas

Al cambiar búsqueda o categoría se vuelve a la primera página y se anuncia el total filtrado. Los controles conservan el foco y no requieren puntero. Las fichas omiten campos ausentes en lugar de presentar sustitutos engañosos.

La imagen no es necesaria para conocer nombre, categoría, precio o destino del producto. Las galerías usan una lista semántica y las variantes, cuando existan, se presentan con encabezados y datos textuales.

## Navegación por teclado

En la carga inicial, Tab enfoca el enlace de salto. Los enlaces internos conservan `href` reales. Atrás y adelante del navegador actualizan vista, metadatos y foco. Los botones del paginador son nativos y anuncian su estado deshabilitado.

## Pruebas

Vitest y React Testing Library verifican estructura, estados, resultados, producto sin imagen y cambios de filtro. Las pruebas de rutas recorren los 510 productos y las 16 categorías.

Playwright ejecuta el build compilado y comprueba navegación directa y cliente, búsqueda, filtro, paginación, fichas, 404, teclado, foco y ausencia de desbordamiento en 320, 390, 768 y 1440 px.

## Límite de la evidencia

La automatización no sustituye una revisión manual con lector de pantalla y usuarios reales. Cualquier cambio posterior de contenido, color, estructura o interacción requiere repetir esa revisión.
