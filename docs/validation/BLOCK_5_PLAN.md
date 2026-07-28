# Plan del BLOQUE 5

## Título

Navegación, 404, seguridad y privacidad.

## Estado

Plan iniciado. Candidata ejecutable pendiente.

## Base remota

- rama: `main`;
- SHA de partida: `e748f12c4dc1a37bff9002aee697d1039616b01b`;
- BLOQUE 4: verificado y publicado.

## Decisión de navegación

La aplicación incorporará rutas internas sin añadir una dependencia de enrutamiento. El alcance actual es pequeño y puede resolverse mediante History API, enlaces HTML reales y un resolvedor tipado propio.

Rutas previstas:

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`;
- cualquier otra ruta: vista 404 de la aplicación.

## Fallback estático

Se utilizará el comportamiento SPA nativo de Cloudflare Pages. No se creará un `404.html` de nivel raíz, porque su presencia desactiva el fallback automático de SPA.

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

El archivo `public/_headers` deberá incluir, como mínimo:

- Content Security Policy sin `unsafe-inline` ni `unsafe-eval`;
- bloqueo de marcos y objetos;
- política de referencia restrictiva;
- política de permisos;
- protección MIME;
- aislamiento de apertura y recursos;
- HSTS sin solicitar precarga.

## Privacidad

La vista de privacidad solamente describirá comportamientos comprobables:

- no existen formularios, cuentas, carrito ni pagos;
- la aplicación no integra analítica, publicidad ni trackers;
- no solicita APIs ni recursos externos;
- la aplicación no crea una base de datos;
- el proveedor de alojamiento y la red pueden generar registros técnicos propios que la aplicación no consulta.

## Criterios de aceptación

1. rutas conocidas resueltas correctamente;
2. normalización de barra final;
3. rutas desconocidas resueltas como 404;
4. enlaces con destinos internos reales;
5. navegación cliente sin recarga completa;
6. botones atrás y adelante soportados;
7. `aria-current` correcto;
8. título y descripción por ruta;
9. foco trasladado al contenido principal;
10. un único `h1` por vista;
11. vista 404 accesible;
12. página de privacidad fiel al comportamiento real;
13. catálogo vacío y contacto ausente;
14. `public/_headers` copiado a `dist`;
15. CSP sin `unsafe-inline` ni `unsafe-eval`;
16. ausencia de `404.html` superior;
17. ausencia de `_redirects` innecesario;
18. ausencia de URLs y peticiones externas;
19. ausencia de scripts remotos, fuentes remotas, iframes y trackers;
20. ausencia de secretos y archivos `.env` rastreados;
21. ausencia de source maps en `dist`;
22. ausencia de funcionalidad excluida.

## Validación requerida antes de publicar

1. verificar la base remota exacta;
2. verificar SHA-256 y lista del candidato;
3. aplicar el candidato en una exportación limpia;
4. ejecutar `npm ci`;
5. instalar Chromium;
6. ejecutar `npm run verify`;
7. ejecutar la inspección de seguridad estática;
8. ejecutar `git diff --check`;
9. revisar los archivos modificados;
10. revisar capturas de inicio, privacidad y 404;
11. publicar mediante fast-forward solamente después de un resultado íntegramente exitoso.
