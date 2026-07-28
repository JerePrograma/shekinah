# Validación del BLOQUE 3

## Estado

Candidata v1 preparada. Validación ejecutable y revisión de capturas pendientes.

## Alcance del candidato

Archivos modificados o creados:

- `index.html`;
- `src/App.tsx`;
- `src/styles.css`;
- `src/App.test.tsx`;
- `tests/e2e/app.spec.ts`;
- `docs/design/BLOCK_3_VISUAL_SYSTEM.md`;
- `docs/validation/BLOCK_3_VALIDATION.md`.

## Controles estáticos realizados al preparar el candidato

- lista de archivos limitada al alcance declarado;
- terminaciones de línea LF;
- ausencia de espacios finales;
- ausencia de URLs HTTP o HTTPS;
- ausencia de recursos visuales adicionales;
- ausencia de datos de contacto;
- ausencia de productos o precios concretos;
- un único elemento `h1` en la implementación JSX;
- navegación interna basada en anclas;
- contraste documentado para las combinaciones de color utilizadas.

## Controles ejecutables requeridos

1. verificar el SHA-256 del ZIP candidato registrado en `docs/validation/BLOCK_3_PLAN.md`;
2. exportar la versión remota esperada de `main` a un directorio temporal;
3. aplicar los siete archivos candidatos;
4. comprobar el logo publicado por hash, dimensiones y tamaño;
5. ejecutar `npm ci`;
6. instalar Chromium mediante Playwright;
7. ejecutar `npm run verify`;
8. ejecutar `git diff --check` en un repositorio temporal;
9. confirmar que no existen URLs externas;
10. revisar las capturas de escritorio y móvil;
11. confirmar ausencia de desbordamiento horizontal a 390 px;
12. confirmar foco visible sobre el enlace de salto;
13. confirmar ausencia de errores de consola.

## Criterio de publicación

El candidato no debe publicarse hasta que la validación completa resulte exitosa y las capturas permitan comprobar que la composición visual es legible en escritorio y móvil.
