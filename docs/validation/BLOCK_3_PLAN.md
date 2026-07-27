# Plan del BLOQUE 3

## Título

Diseño visual y estructura principal.

## Estado

Candidata v1 preparada; validación ejecutable y revisión visual pendientes.

## Base remota

- rama: `main`;
- SHA funcional y documental de partida: `423149fc38ee077994b3d5a3d6e8d0236a45d48d`;
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
- precios;
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

ZIP SHA-256:

`aaa4a661071283c35cfbfe12c687d27b0b652f50cadcecc54fa9af2ad77b79df`

Archivos que propone modificar o crear:

- `index.html`;
- `src/App.tsx`;
- `src/styles.css`;
- `src/App.test.tsx`;
- `tests/e2e/app.spec.ts`;
- `docs/design/BLOCK_3_VISUAL_SYSTEM.md`;
- `docs/validation/BLOCK_3_VALIDATION.md`.

## Paleta candidata

- verde oscuro observado: `#13380c`;
- verde vegetal observado: `#5b873d`;
- salvia observado: `#b6cab1`;
- blanco observado: `#ffffff`;
- verde de acción ajustado para contraste: `#3f6f2a`;
- fondo salvia claro: `#eef4ec`.

## Validaciones requeridas antes de publicar

1. hash del ZIP candidato;
2. hash, dimensiones y tamaño del logo ya publicado;
3. `npm ci`;
4. `npm run verify`;
5. `git diff --check`;
6. ausencia de URLs o recursos externos;
7. revisión de capturas en escritorio y móvil;
8. ausencia de desbordamiento horizontal a 390 px;
9. navegación por teclado y foco visible;
10. confirmación de un único `h1`;
11. confirmación de que no se muestran productos ni contacto.

La publicación funcional se realizará solamente después de validar el candidato exacto y revisar la evidencia visual.