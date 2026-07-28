# Plan del BLOQUE 3

## Título

Diseño visual y estructura principal.

## Estado

Candidata v1 preparada. Validación ejecutable y revisión visual pendientes.

## Base remota inspeccionada

- rama: `main`;
- SHA funcional y documental inspeccionado: `2d8d8883a8285edd94da0f41569a00cb26b4b7db`;
- BLOQUE 2: completado y verificado.

## Alcance autorizado

- extraer y documentar una paleta aproximada del logo autorizado;
- crear estilos CSS propios;
- construir enlace de salto al contenido;
- construir encabezado, identidad y navegación principal;
- construir layout responsive;
- construir presentación de inicio;
- incluir una llamada al catálogo;
- representar un estado vacío del catálogo sin productos ficticios;
- construir pie de página con año dinámico y enlaces internos reales;
- verificar foco, teclado, contraste y composición móvil/escritorio.

## Exclusiones

Este bloque no incorpora:

- productos;
- precios concretos;
- categorías comerciales reales;
- datos de contacto;
- recetas;
- blog;
- carrito;
- pagos;
- backend;
- rutas con React Router;
- imágenes adicionales;
- iconos o fuentes externas;
- peticiones a servicios externos.

## Candidata v1

Archivo:

`shekinah-block3-validation-candidate-v1.zip`

SHA-256:

`11bd3139513a3750cc00b49760688f11cd68a2b04ff3705d7f766b54b223b790`

Tamaño:

`9996 bytes`

Archivos incluidos:

- `index.html`;
- `src/App.tsx`;
- `src/styles.css`;
- `src/App.test.tsx`;
- `tests/e2e/app.spec.ts`;
- `docs/design/BLOCK_3_VISUAL_SYSTEM.md`;
- `docs/validation/BLOCK_3_VALIDATION.md`.

## Paleta candidata

Colores observados mediante cuantización del logo autorizado:

- verde oscuro: `#13380c`;
- verde vegetal: `#5b873d`;
- salvia: `#b6cab1`;
- blanco: `#ffffff`.

Colores derivados para interfaz:

- verde de acción ajustado para contraste: `#3f6f2a`;
- fondo salvia claro: `#eef4ec`;
- borde: `#c9d8c4`.

## Controles de preparación realizados

- lista del ZIP limitada a siete archivos;
- TypeScript y TSX analizados sintácticamente mediante el compilador TypeScript disponible en el entorno;
- CSS analizado sintácticamente mediante PostCSS;
- terminaciones LF;
- ausencia de espacios finales;
- ausencia de URLs HTTP o HTTPS;
- un único elemento `h1` en `src/App.tsx`;
- ausencia de recursos visuales adicionales;
- ausencia de productos y contacto.

Estas comprobaciones son estáticas y no sustituyen la validación ejecutable con Node.js 24, npm 11 y Chromium.

## Validaciones requeridas antes de publicar

1. hash del ZIP candidato;
2. hash, dimensiones y tamaño del logo ya publicado;
3. exportación del `origin/main` esperado a un directorio temporal;
4. aplicación exacta de los siete archivos;
5. `npm ci`;
6. instalación de Chromium;
7. `npm run verify`;
8. `git diff --check`;
9. ausencia de URLs o recursos externos;
10. revisión de capturas en escritorio y móvil;
11. ausencia de desbordamiento horizontal a 390 px;
12. navegación por teclado y foco visible;
13. confirmación de un único `h1`;
14. confirmación de que no se muestran productos ni contacto.

La publicación funcional se realizará solamente después de validar el candidato exacto y revisar la evidencia visual.