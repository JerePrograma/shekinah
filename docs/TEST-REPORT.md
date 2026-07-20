# Informe de pruebas

Fecha: **2026-07-20**.

## Comandos ejecutados en el sandbox

| Comando                 | Resultado                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `npm ci`                | aprobado; advertencia esperada porque el sandbox usa Node 22 y el proyecto exige Node 24 |
| `npm run check`         | aprobado, 0 errores, 0 advertencias                                                      |
| `npm run lint`          | aprobado                                                                                 |
| `npm run format:check`  | aprobado                                                                                 |
| `npm run test:unit`     | aprobado, 7 pruebas                                                                      |
| `npm run build`         | aprobado, salida estática                                                                |
| `npm run audit:output`  | aprobado                                                                                 |
| `npm run audit:secrets` | aprobado                                                                                 |
| `npm run test:e2e`      | no ejecutable en el sandbox por política del navegador y bloqueo de descarga             |

## Limitación del sandbox

Playwright no pudo descargar Chromium porque el entorno efímero bloqueó la resolución del CDN. El Chromium del sistema está administrado con una política que bloquea toda navegación (`URLBlocklist: ["*"]`). Esto no es un error del sitio ni se eludió la política.

La suite Playwright está configurada para CI, donde `.github/workflows/ci.yml` instala Chromium con `npx playwright install --with-deps chromium` y prueba móvil, tablet y escritorio.

## Cobertura implementada

- 10 rutas críticas con respuesta 200, `h1`, title, description, canonical y `main`;
- navegación por teclado y menú móvil;
- carga de imágenes;
- redirecciones históricas;
- sitemap, robots y 404;
- ausencia de plataforma heredada y dominio anterior;
- parser SQL, escapes, tipos y prefijo variable;
- saneamiento de scripts, eventos y comentarios Gutenberg;
- detección de path traversal.

## Auditoría de `dist`

Última medición local antes de publicación:

- tamaño total: **813.432 B**;
- archivo mayor: **133.816 B**;
- recursos externos activos: **0**;
- sourcemaps: **0**;
- errores de enlaces/SEO/cadenas prohibidas: **0**.

El resultado de CI remoto se incorporará cuando exista la primera ejecución sobre `main`.
