# Accesibilidad

## Objetivo

La interfaz prioriza lectura clara, navegación predecible y funcionamiento por teclado en escritorio y móvil.

## Controles implementados

- enlace `Saltar al contenido` como primer destino de teclado;
- regiones semánticas de encabezado, navegación, contenido principal y pie;
- un único `h1` por vista;
- jerarquía de encabezados;
- `aria-current="page"` en la ruta activa;
- foco visible de alto contraste;
- traslado de foco al contenido principal después de una navegación cliente real;
- textos alternativos para el logo informativo;
- imágenes decorativas con alternativa vacía;
- estado del catálogo anunciado mediante regiones de estado;
- etiquetas asociadas a búsqueda y filtros;
- soporte de `prefers-reduced-motion`;
- diseño sin desbordamiento horizontal en el ancho móvil probado de 390 px.

## Navegación por teclado

En la carga inicial, Tab enfoca el enlace de salto. Los enlaces internos conservan destinos HTML reales. Atrás y adelante del navegador actualizan la vista y sus metadatos.

## Pruebas

Vitest y React Testing Library verifican estructura, rutas, estados y contenido. Playwright comprueba navegación directa, navegación cliente, foco, ruta activa, 404 y ausencia de desbordamiento.

## Limitaciones

La accesibilidad automatizada no sustituye pruebas manuales con tecnologías de asistencia. Antes de incorporar contenido comercial nuevo deben revisarse longitud, lenguaje, jerarquía y contraste real de cualquier elemento añadido.
