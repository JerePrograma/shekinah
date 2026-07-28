# Navegación, seguridad y privacidad del BLOQUE 5

## Alcance

Este bloque convierte la navegación por anclas en rutas internas reales y añade una vista 404 de aplicación, una página de privacidad y controles de seguridad estática.

No incorpora dependencias, productos, contacto, formularios, backend, analítica, publicidad ni recursos externos.

## Rutas

Rutas públicas:

- `/`;
- `/enfoque`;
- `/catalogo`;
- `/privacidad`.

Cualquier otra ruta se resuelve como `not-found` y muestra una vista accesible con un único `h1`.

La implementación usa:

- enlaces HTML con destinos reales;
- History API para navegación cliente;
- evento `popstate` para atrás y adelante;
- normalización de barra final;
- `aria-current="page"`;
- actualización de título y descripción;
- foco en `main` después de un cambio de ruta.

No se añadió React Router porque el número y la complejidad de rutas no justifican otra dependencia.

## Fallback de Cloudflare Pages

Cloudflare Pages trata un proyecto sin `404.html` superior como SPA y sirve la raíz para las rutas entrantes que no coinciden con un archivo.

Decisión:

- no se crea `public/404.html`;
- no se crea `public/_redirects`;
- las rutas directas son resueltas por la aplicación.

Limitación:

Una ruta desconocida puede mostrar la vista 404 de la aplicación con código HTTP `200`. Un código HTTP `404` real y navegación SPA directa simultánea exigirían prerenderizado, Pages Functions o una estrategia de publicación diferente.

## Encabezados

`public/_headers` configura:

- CSP con origen predeterminado bloqueado;
- scripts y estilos únicamente del mismo origen;
- imágenes únicamente del mismo origen;
- conexiones, fuentes, formularios, marcos, objetos, medios, manifiestos y workers bloqueados;
- `frame-ancestors 'none'`;
- política de referencia `no-referrer`;
- política de permisos restrictiva;
- HSTS;
- protección MIME;
- aislamiento de apertura y recursos;
- compatibilidad defensiva mediante `X-Frame-Options` y `X-XSS-Protection: 0`.

La CSP no incluye `unsafe-inline` ni `unsafe-eval`.

## Privacidad comprobable

La vista de privacidad declara solamente el comportamiento real de esta versión:

- no existen formularios, cuentas, carrito ni pagos;
- no existe una base de datos de la aplicación;
- no se integra analítica, publicidad ni trackers;
- no se cargan scripts, fuentes, iframes, imágenes o APIs externas;
- el alojamiento y la red pueden producir registros técnicos propios;
- la aplicación no consulta esos registros.

## Auditoría automatizada

`scripts/verify-security.mjs` comprueba:

- contenido exacto de encabezados;
- ausencia de directivas CSP inseguras;
- ausencia de URLs y APIs externas en código de producción;
- ausencia de trackers e iframes;
- ausencia de archivos `.env` rastreados;
- patrones de secretos;
- único activo visual autorizado;
- ausencia de `404.html` y `_redirects`;
- copia exacta de `_headers` en `dist`;
- referencias locales en `dist/index.html`;
- ausencia de source maps;
- URLs inesperadas en la salida.

Las únicas cadenas URL permitidas dentro del JavaScript de dependencias son namespaces técnicos de W3C y enlaces diagnósticos de errores de React. No son recursos cargados por la aplicación.
