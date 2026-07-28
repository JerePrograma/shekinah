# Despliegue

## Estrategia

La estrategia recomendada es Cloudflare Pages mediante integración Git. GitHub Actions se utiliza para integración continua y no realiza despliegues.

No se añaden tokens, IDs de cuenta ni secretos de Cloudflare al repositorio.

## Configuración de Cloudflare Pages

Configurar o revisar el proyecto en el panel con estos valores:

- Rama de producción: `main`;
- Directorio raíz: raíz del repositorio;
- Comando de build: `npm run build:pages`;
- Directorio de salida: `dist`;
- Versión de Node.js: `24.18.0`;
- Proyecto previsto: `shekinah`;
- URL conocida a verificar: `shekinah-7dl.pages.dev`.

La conexión y el estado del despliegue deben verificarse en el panel de Cloudflare Pages. La existencia de esta documentación no acredita por sí sola que el proyecto esté conectado, que el último commit haya sido desplegado ni que la URL responda con la versión actual.

## Flujo esperado

1. GitHub Actions valida el commit.
2. Cloudflare Pages recibe el push mediante su integración Git.
3. Pages instala las dependencias.
4. Pages ejecuta `npm run build:pages`.
5. Pages publica `dist`.
6. Se verifica que el despliegue corresponda al SHA de `main`.

## Verificación posterior

Comprobar en el panel:

- estado exitoso del build;
- SHA desplegado;
- rama `main`;
- salida `dist`;
- encabezados de seguridad;
- navegación directa a `/privacidad`;
- navegación directa a una ruta desconocida;
- ausencia de productos y contacto no autorizados.

## CI versus despliegue

`.github/workflows/ci.yml` no contiene secretos, permisos de escritura ni comandos de Cloudflare. Su artefacto `dist` sirve como evidencia del build verificado, pero no se publica automáticamente.

No debe añadirse Wrangler hasta confirmar si el proyecto existente usa Git integration o Direct Upload. Cambiar de modalidad puede requerir un proyecto nuevo o una reconfiguración deliberada.

## Rollback

Ante una regresión:

1. identificar el último commit válido;
2. revertir mediante un commit normal, sin reescribir historial;
3. ejecutar `npm run verify`;
4. hacer push a `main`;
5. comprobar el nuevo despliegue en Cloudflare Pages.

## Fuera de alcance

- dominio personalizado;
- cambios DNS;
- Pages Functions;
- analítica;
- despliegue con tokens desde GitHub Actions.
