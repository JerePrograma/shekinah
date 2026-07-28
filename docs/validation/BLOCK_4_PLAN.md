# Plan del BLOQUE 4

## Título

Modelo comercial y catálogo.

## Estado

Plan iniciado. Candidata ejecutable pendiente.

## Base remota

- rama: `main`;
- SHA de partida: `bb4c6181e7c308cce1c597f854c89d869596f7aa`;
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

1. registrar el SHA-256 del candidato exacto;
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
