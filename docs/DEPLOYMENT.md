# Despliegue

## Estrategia

La publicación se realiza con Cloudflare Pages mediante integración Git. GitHub Actions valida cada commit y no ejecuta el despliegue.

No se añaden tokens, IDs de cuenta ni secretos de Cloudflare al repositorio.

## Configuración de Cloudflare Pages

- Rama de producción: `main`;
- Directorio raíz: raíz del repositorio;
- Comando de build: `npm run build:pages`;
- Directorio de salida: `dist`;
- Versión de Node.js: `24.18.0`;
- Proyecto previsto: `shekinah`;
- URL: `shekinah-7dl.pages.dev`.

La conexión y el estado del despliegue deben verificarse en Cloudflare Pages. Esta documentación no acredita por sí sola que el último commit se encuentre publicado.

## Flujo esperado

1. GitHub Actions valida el commit.
2. Cloudflare Pages recibe el push mediante integración Git.
3. Pages instala dependencias.
4. Pages ejecuta `npm run build:pages`.
5. Pages publica `dist`.
6. Se verifica la asociación con el SHA de `main`.

## Verificación posterior

Comprobar:

- estado exitoso del build;
- SHA y rama desplegados;
- salida `dist`;
- encabezados de seguridad;
- portada con copy comercial y CTA `Ver catálogo`;
- catálogo con `510 productos encontrados`;
- búsqueda, filtro y paginación;
- una categoría;
- productos con y sin imagen;
- productos con y sin descripción;
- `/privacidad`;
- una ruta desconocida;
- ausencia de recursos remotos, IDs internos, metadatos internos y llamadas de red.

La verificación pública debe distinguir la conclusión de GitHub Actions, el SHA informado por Cloudflare y el contenido servido. Si el proveedor no expone el SHA, no debe inferirse esa asociación.

## CI versus despliegue

`.github/workflows/ci.yml` no contiene secretos, permisos de escritura ni comandos de Cloudflare. El artefacto `dist` sirve como evidencia del build validado, pero no se publica automáticamente.

No debe añadirse Wrangler sin una decisión explícita sobre el modo de publicación.

## Catálogo en producción

El build utiliza los datasets versionados y 484 imágenes locales. No consulta servicios externos durante instalación, build o ejecución. Deben comprobarse programáticamente las rutas y una muestra representativa mediante navegador.

## Rollback

Ante una regresión:

1. identificar el último commit válido;
2. revertir mediante un commit normal;
3. ejecutar `npm run verify`;
4. hacer push a `main`;
5. comprobar el nuevo despliegue.

## Fuera de alcance

- dominio personalizado;
- cambios DNS;
- Pages Functions;
- analítica;
- despliegue con tokens desde GitHub Actions.
