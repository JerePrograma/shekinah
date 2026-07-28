# Validación del BLOQUE 4

## Estado

Candidata v1 preparada. Validación ejecutable y revisión visual pendientes.

## Decisión de datos

La candidata continúa sin datos comerciales:

- `authorizedProducts` es una colección vacía;
- `authorizedContact` es `null`;
- los fixtures de prueba están aislados de la fuente de producción.

## Archivos candidatos

- `docs/design/BLOCK_4_CATALOG_MODEL.md`;
- `docs/validation/BLOCK_4_VALIDATION.md`;
- `src/App.test.tsx`;
- `src/App.tsx`;
- `src/catalog.css`;
- `src/catalog/CatalogSection.test.tsx`;
- `src/catalog/CatalogSection.tsx`;
- `src/catalog/catalog.test.ts`;
- `src/catalog/catalog.ts`;
- `src/catalog/model.ts`;
- `src/config/authorized-assets.ts`;
- `src/content/site-content.ts`;
- `src/data/authorized-commercial-data.ts`;
- `src/main.tsx`;
- `src/test/fixtures/catalog-products.ts`;
- `tests/e2e/app.spec.ts`.

## Controles cubiertos

- modelo válido;
- rechazo de producto incompleto;
- rechazo de precio inválido;
- rechazo de identificadores duplicados;
- mayúsculas y minúsculas;
- espacios repetidos;
- acentos;
- categorías únicas;
- búsqueda;
- filtro de categoría;
- combinación de búsqueda y categoría;
- colección vacía;
- controles condicionales;
- tarjetas sin imágenes;
- precio opcional sin sustitutos ficticios;
- ausencia de contacto;
- año dinámico;
- un único `h1`;
- enlaces internos;
- foco visible;
- ausencia de desbordamiento horizontal en 390 px;
- ausencia de errores de consola.

## Validación ejecutable requerida

1. comprobar la base remota exacta;
2. comprobar el SHA-256 y la lista de archivos del candidato;
3. aplicar el candidato en una exportación limpia;
4. ejecutar `npm ci`;
5. instalar Chromium;
6. ejecutar `npm run verify`;
7. ejecutar `git diff --check`;
8. comprobar que la fuente comercial continúe vacía;
9. comprobar ausencia de URLs HTTP o HTTPS;
10. revisar capturas de escritorio y móvil.

La candidata no debe publicarse hasta obtener un resultado `SUCCESS`.
