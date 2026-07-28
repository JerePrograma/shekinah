# Plan del BLOQUE 4

## Título

Modelo comercial y catálogo.

## Estado

Candidata v1 preparada. Validación ejecutable y revisión visual pendientes.

## Base remota inspeccionada

- rama: `main`;
- SHA de partida: `bb4c6181e7c308cce1c597f854c89d869596f7aa`;
- commit de inicio del bloque: `839d5789cf52d57ca0843634e10b6b3374d191df`;
- BLOQUE 3: verificado y publicado.

## Decisión sobre datos comerciales

Se continúa sin datos comerciales.

Hasta recibir información expresamente autorizada:

- la colección pública de productos permanece vacía;
- no se muestra información de contacto;
- no se inventan nombres, categorías, presentaciones, precios, descripciones ni canales comerciales.

## Alcance autorizado

- definir un modelo explícito e inmutable de producto;
- validar datos de producto antes de incorporarlos al catálogo;
- centralizar la colección de datos comerciales autorizados;
- separar contenido estructural, datos autorizados, activos autorizados y fixtures de prueba;
- implementar normalización de búsqueda independiente de mayúsculas, espacios y acentos;
- obtener categorías únicamente a partir de productos autorizados;
- combinar búsqueda y filtro de categoría;
- mostrar controles de búsqueda y filtros solo cuando existan productos;
- mantener un estado vacío claro cuando la colección esté vacía;
- construir tarjetas de producto sin imágenes y sin completar campos opcionales inexistentes;
- conservar el año dinámico, la navegación interna y un único `h1` en la vista.

## Exclusiones

Este bloque no incorpora:

- productos reales no proporcionados;
- datos de contacto;
- imágenes de producto;
- categorías vacías o ficticias;
- precios de ejemplo;
- recetas;
- blog;
- carrito;
- pagos;
- backend;
- persistencia;
- peticiones externas;
- React Router;
- dependencias nuevas.

## Reglas del modelo

Un producto válido debe contener:

- identificador no vacío;
- nombre no vacío;
- categoría no vacía;
- presentación no vacía.

El precio es opcional. Cuando exista debe contener un importe finito y positivo en pesos argentinos. Los campos opcionales ausentes no deben sustituirse por textos o valores ficticios.

Los datos inválidos deben rechazarse de forma explícita y no llegar al renderizado.

## Candidata v1

Archivo:

`shekinah-block4-validation-candidate-v1.zip`

SHA-256:

`8dd069418f12ccfea2343a5eb7f6fb15b8f882d7eb64588121bf9746a3986bd5`

Tamaño:

`14763 bytes`

Archivos incluidos:

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

## Controles de preparación realizados

- lista del ZIP limitada a dieciséis archivos;
- sintaxis TypeScript y TSX analizada con el compilador TypeScript;
- código de producción comprobado con opciones estrictas, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals` y `noUnusedParameters`;
- lógica del modelo, normalización, categorías y filtros ejecutada mediante una comprobación aislada;
- terminaciones LF;
- ausencia de espacios finales;
- ausencia de URLs HTTP o HTTPS;
- un único elemento `h1` en `src/App.tsx`;
- fuente comercial de producción vacía;
- contacto autorizado establecido en `null`;
- fixtures separados de la fuente comercial.

Estas comprobaciones no sustituyen la instalación reproducible, las pruebas reales con React/Vitest ni Playwright.

## Criterios de aceptación

1. búsqueda insensible a mayúsculas y minúsculas;
2. búsqueda con espacios iniciales, finales o repetidos;
3. búsqueda insensible a acentos;
4. categorías únicas derivadas de la colección autorizada;
5. filtrado por categoría;
6. combinación de búsqueda y categoría;
7. catálogo vacío sin controles inútiles;
8. tarjetas sin imágenes;
9. precio omitido cuando no fue proporcionado;
10. año dinámico correcto;
11. producto válido aceptado;
12. producto inválido rechazado;
13. ausencia de contacto cuando no fue autorizado;
14. un único `h1` en la vista;
15. ausencia de URLs y recursos externos;
16. navegación por teclado y ausencia de desbordamiento horizontal a 390 px.

## Validación requerida antes de publicar

1. verificar el SHA-256 del candidato exacto;
2. exportar el `origin/main` esperado a un directorio temporal;
3. aplicar únicamente los archivos candidatos;
4. ejecutar `npm ci`;
5. instalar Chromium mediante Playwright;
6. ejecutar `npm run verify`;
7. ejecutar `git diff --check`;
8. revisar la lista completa de archivos modificados;
9. comprobar ausencia de datos comerciales no autorizados;
10. revisar capturas de escritorio y móvil;
11. publicar mediante fast-forward sobre `origin/main` solo después de un resultado íntegramente exitoso.
