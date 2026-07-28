# Sistema visual del BLOQUE 3

## Alcance

Este documento describe la estructura visual candidata de Shekinah para el BLOQUE 3. El diseño utiliza únicamente código nuevo, tipografía del sistema y el logo autorizado ya publicado.

No se incorporan productos, precios, categorías comerciales reales, datos de contacto, recetas, blog, carrito, pagos, imágenes adicionales, iconos externos ni fuentes remotas.

## Fuente visual autorizada

Recurso: `public/assets/logo-shekinah.png`.

Propiedades verificadas durante el BLOQUE 2:

- PNG;
- 383 × 383 px;
- 105443 bytes;
- SHA-256 `cee7db1812dc39fb9e2a816e8c29bd4922b97752fc4aceae68eabf3985a37747`.

## Paleta

Los colores principales se obtuvieron mediante cuantización del logo autorizado:

- verde oscuro: `#13380c`;
- verde vegetal: `#5b873d`;
- salvia: `#b6cab1`;
- blanco: `#ffffff`.

Colores derivados para interfaz:

- verde de acción: `#3f6f2a`;
- fondo salvia claro: `#eef4ec`;
- borde: `#c9d8c4`.

El verde de acción es deliberadamente más oscuro que el verde vegetal observado para conservar contraste suficiente con texto blanco.

## Contraste calculado

Relaciones aproximadas:

- `#13380c` sobre `#ffffff`: 13.14:1;
- `#13380c` sobre `#eef4ec`: 11.75:1;
- `#ffffff` sobre `#3f6f2a`: 5.97:1;
- `#3f6f2a` sobre `#eef4ec`: 5.34:1;
- `#13380c` sobre `#b6cab1`: 7.55:1.

Las combinaciones de texto normal utilizadas superan el umbral AA de 4.5:1.

## Tipografía

Se utiliza una pila de fuentes del sistema:

```css
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

No se realizan solicitudes de fuentes externas. La escala tipográfica utiliza `clamp()` para responder de forma gradual entre móvil y escritorio.

## Estructura

La página candidata contiene:

1. enlace de salto al contenido;
2. encabezado fijo con identidad y navegación interna;
3. presentación principal con un único `h1`;
4. llamada al catálogo;
5. sección de enfoque con tres principios de interfaz;
6. estado vacío del catálogo;
7. pie con enlaces internos y año dinámico.

La navegación utiliza anclas de la misma página. No se incorpora React Router en este bloque.

## Comportamiento responsive

- escritorio: presentación en dos columnas;
- anchos intermedios: contenido apilado;
- móvil: navegación en tres columnas, acciones de ancho completo y tarjetas apiladas;
- ancho mínimo objetivo comprobable: 390 px sin desplazamiento horizontal.

## Accesibilidad

- un único `h1`;
- jerarquía de encabezados consecutiva;
- regiones `header`, `nav`, `main`, `section` y `footer`;
- enlace de salto visible al recibir foco;
- foco de 3 px con separación externa;
- destino principal con `tabIndex={-1}`;
- estado vacío con `role="status"`;
- logo principal con texto alternativo;
- repetición decorativa del logo con `alt=""`;
- soporte de `prefers-reduced-motion`;
- enlaces internos únicamente.

## Contenido comercial

El estado vacío informa que los productos se incorporarán solamente cuando nombres, presentaciones, categorías y precios estén confirmados. No se crea ningún producto ficticio ni se muestra contacto inexistente.
