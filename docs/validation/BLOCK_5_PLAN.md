# Plan del BLOQUE 5

## Título

Navegación, 404, seguridad y privacidad.

## Estado

Candidata v2 validada y publicada.

## Base remota inspeccionada

- rama: `main`;
- SHA de partida: `e748f12c4dc1a37bff9002aee697d1039616b01b`;
- commit de inicio del bloque: `3fc2d2013618e56baa7a4c527615adee8bee5f8d`;
- BLOQUE 4: verificado y publicado.

## Decisión de navegación

La aplicación incorpora rutas internas sin añadir una dependencia de enrutamiento. El alcance actual es pequeño y puede resolverse mediante History API, enlaces HTML reales y un resolvedor tipado propio.

Rutas previstas:

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`;
- cualquier otra ruta: vista 404 de la aplicación.

## Fallback estático

Se utiliza el comportamiento SPA nativo de Cloudflare Pages. No se crea un `404.html` de nivel raíz, porque su presencia desactiva el fallback automático de SPA.

Limitación documentada:

- Cloudflare Pages sirve la raíz de la SPA para rutas sin archivo físico cuando no existe un `404.html` superior;
- la aplicación puede mostrar una vista 404 accesible para una ruta desconocida;
- esa respuesta puede conservar código HTTP `200`;
- obtener simultáneamente navegación SPA directa y un código HTTP `404` real requeriría prerenderizado por ruta, Pages Functions o una estrategia de despliegue distinta, fuera de este bloque.

## Alcance autorizado

- completar navegación interna mediante rutas;
- soportar navegación directa y botones atrás/adelante;
- conservar enlaces HTML funcionales sin JavaScript;
- indicar la ruta activa mediante `aria-current`;
- gestionar título y descripción por vista;
- mover foco al contenido principal después de navegación cliente;
- implementar páginas de inicio, enfoque, catálogo y privacidad;
- implementar vista 404 accesible;
- mantener un único `h1` por vista;
- mantener productos vacíos y contacto ausente;
- crear encabezados estáticos para Cloudflare Pages;
- aplicar CSP restrictiva;
- verificar código fuente, archivos rastreados y `dist`;
- documentar privacidad conforme al comportamiento real de esta versión estática.

## Exclusiones

Este bloque no incorpora:

- React Router ni otra dependencia nueva;
- `404.html` superior;
- Pages Functions;
- backend;
- formularios;
- autenticación;
- cuentas;
- carrito;
- pagos;
- analítica;
- publicidad;
- trackers;
- iframes;
- APIs externas;
- scripts o fuentes remotas;
- productos, contacto o imágenes adicionales;
- secretos o credenciales.

## Encabezados previstos

El archivo `public/_headers` incluye:

- Content Security Policy sin `unsafe-inline` ni `unsafe-eval`;
- bloqueo de marcos, objetos, formularios, conexiones y workers;
- política de referencia restrictiva;
- política de permisos;
- protección MIME;
- aislamiento de apertura y recursos;
- HSTS sin precarga.

## Privacidad

La vista de privacidad solamente describe comportamientos comprobables:

- no existen formularios, cuentas, carrito ni pagos;
- la aplicación no integra analítica, publicidad ni trackers;
- no solicita APIs ni recursos externos;
- la aplicación no crea una base de datos;
- el proveedor de alojamiento y la red pueden generar registros técnicos propios que la aplicación no consulta.

## Candidata v1 descartada antes de validar

Archivo:

`shekinah-block5-validation-candidate-v1.zip`

SHA-256:

`4b1ce4b4f354303ce781636f57a087832aa8f708c6d46074c5bb16a8dda8a6f9`

La candidata v1 no se ejecutó ni se publicó. Durante la revisión previa se detectó que el control de foco dependía de una marca de primer render que podía activarse durante la doble invocación inicial de efectos en `StrictMode`. Eso podía volver inestable la primera navegación por teclado.

La candidata v2 reemplaza esa condición por una comparación entre el `pathname` anterior y el actual. El foco se traslada únicamente después de un cambio real de ruta. También amplía las pruebas de títulos y descripciones por vista.

## Candidata v2

Archivo:

`shekinah-block5-validation-candidate-v2.zip`

SHA-256:

`867fba2e3e8f4f71b920343acef828bb701e3df9f1198372e1742ba998db3d8f`

Tamaño:

`22887 bytes`

Archivos incluidos:

- `docs/design/BLOCK_5_NAVIGATION_SECURITY.md`;
- `docs/validation/BLOCK_5_VALIDATION.md`;
- `package.json`;
- `public/_headers`;
- `scripts/verify-security.mjs`;
- `src/App.test.tsx`;
- `src/App.tsx`;
- `src/catalog/CatalogSection.tsx`;
- `src/content/site-content.ts`;
- `src/main.tsx`;
- `src/pages/ApproachPage.tsx`;
- `src/pages/CatalogPage.tsx`;
- `src/pages/HomePage.tsx`;
- `src/pages/NotFoundPage.tsx`;
- `src/pages/PrivacyPage.tsx`;
- `src/routing.css`;
- `src/routing/AppLink.tsx`;
- `src/routing/routes.test.ts`;
- `src/routing/routes.ts`;
- `src/routing/useBrowserRoute.ts`;
- `tests/e2e/app.spec.ts`.

## Controles de preparación realizados

- lista del ZIP limitada a veintiún archivos;
- sintaxis TypeScript y TSX analizada con el compilador TypeScript;
- código de producción comprobado con opciones estrictas y declaraciones aisladas;
- lógica de normalización y resolución de rutas ejecutada;
- control de foco revisado para no ejecutarse durante el montaje inicial de `StrictMode`;
- títulos y descripciones cubiertos en pruebas E2E;
- sintaxis del verificador de seguridad comprobada con Node;
- `package.json` analizado;
- CSS analizado sintácticamente;
- terminaciones LF;
- ausencia de espacios finales;
- `git diff --cached --check` aprobado en un repositorio temporal;
- verificador de seguridad ejecutado sobre una salida estática simulada;
- ausencia de `404.html` y `_redirects`;
- ausencia de dependencia nueva;
- productos autorizados vacíos;
- contacto autorizado `null`.

Estas comprobaciones no sustituyen `npm ci`, Vitest, Vite, Playwright ni la inspección del `dist` real.

## Criterios de aceptación

1. rutas conocidas resueltas correctamente;
2. normalización de barra final;
3. rutas desconocidas resueltas como 404;
4. enlaces con destinos internos reales;
5. navegación cliente sin recarga completa;
6. botones atrás y adelante soportados;
7. `aria-current` correcto;
8. título y descripción por ruta;
9. foco trasladado al contenido principal únicamente después de navegación real;
10. enlace de salto como primer destino de Tab en la carga inicial;
11. un único `h1` por vista;
12. vista 404 accesible;
13. página de privacidad fiel al comportamiento real;
14. catálogo vacío y contacto ausente;
15. `public/_headers` copiado a `dist`;
16. CSP sin `unsafe-inline` ni `unsafe-eval`;
17. ausencia de `404.html` superior;
18. ausencia de `_redirects` innecesario;
19. ausencia de URLs y peticiones externas;
20. ausencia de scripts remotos, fuentes remotas, iframes y trackers;
21. ausencia de secretos y archivos `.env` rastreados;
22. ausencia de source maps en `dist`;
23. ausencia de funcionalidad excluida.

## Validación requerida antes de publicar

1. verificar la base remota exacta;
2. verificar SHA-256 y lista del candidato v2;
3. aplicar el candidato en una exportación limpia;
4. ejecutar `npm ci`;
5. instalar Chromium;
6. ejecutar `npm run verify`;
7. ejecutar la inspección de seguridad estática;
8. ejecutar `git diff --check`;
9. revisar los archivos modificados;
10. revisar capturas de inicio, privacidad, 404 y móvil;
11. publicar mediante fast-forward solamente después de un resultado íntegramente exitoso.
## Publicación definitiva

- resultado de validación: `SUCCESS`;
- SHA remoto previo: `6ccae0839ab7c114eac7fee096c7aa7b7eb5b6f5`;
- ZIP candidato v2: `867fba2e3e8f4f71b920343acef828bb701e3df9f1198372e1742ba998db3d8f`;
- ZIP de resultados v2: `711a8fd6eb92f27a32f80347fa0f44541efff4fa047d929dcd5d85fa7b216a53`;
- script de validación v2: `f47ecf420c588a3c575b1ac0db62ff0d01becd504d3e649c7172210af29b28ef`;
- intento de publicación v1: fallido durante la inspección previa, sin commit ni push;
- ZIP de resultado fallido v1: `a3df0927340060ed281c44cc92e3ccb44b8e374ba1571bf8e789040725209b6d`;
- intento de publicación v2: fallido durante la revalidación limpia, sin aplicar el candidato, crear commit ni hacer push;
- ZIP de resultado fallido v2: `bb7ee39840db14ae396041b511f143290018691603d1da8b820f93122881e100`;
- intento de publicación v3: fallido durante la inspección de evidencia, sin sincronizar, aplicar el candidato, crear commit ni hacer push;
- ZIP de resultado fallido v3: `1fe15c9064b7770b4529c44acc949cdb99fb757375d3b33ba36f43368f8201c3`;
- script de publicación v2: `bd9962128bf1646ddcb597fdd5b40a889e308b5c79756016e98fccc03ef7f17f`;
- script de publicación v3: `88973b3e7be6c568cb24626408805d89ba31d3141cc7619919cd89f84603cd72`;
- script de publicación v4: `8a495c347bacc85a464b63139e2f9b7d9162c1a029b9987ac395457a2301c233`;
- commit funcional: `5bc26706f5e971ae1bcb2c15ef46c1f6ed2b9bae`;
- instalación reproducible: aprobada;
- validación completa: aprobada;
- productos autorizados: colección vacía;
- contacto autorizado: `null`;
- Vitest: 4 archivos y 21 pruebas aprobados;
- auditoría estática de seguridad: aprobada;
- Playwright: 3 pruebas aprobadas;
- capturas de inicio, privacidad, 404 y móvil: revisadas;
- diff: aprobado;
- push: fast-forward;
- force-push: no utilizado;
- historial Git: conservado.

La publicación aplicó exactamente los veintiún archivos enumerados en este plan sobre la base remota validada.
