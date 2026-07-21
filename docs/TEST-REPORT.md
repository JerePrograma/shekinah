# Informe de pruebas

Fecha de la validación local documentada: **2026-07-20**. Verificación remota final: **2026-07-21 UTC**.

## Comandos ejecutados en el sandbox

| Comando                                   | Resultado                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `npm ci`                                  | aprobado con el lockfile saneado que posteriormente quedó publicado    |
| `npm run check`                           | aprobado, 0 errores y 0 advertencias                                   |
| `npm run lint`                            | aprobado                                                               |
| `npm run format:check`                    | aprobado                                                               |
| `npm run test:unit`                       | aprobado, 7 pruebas                                                    |
| `npm run build`                           | aprobado, salida estática                                              |
| `npm run audit:output`                    | aprobado                                                               |
| `npm run audit:secrets`                   | aprobado                                                               |
| `npm audit --omit=dev --audit-level=high` | aprobado, 0 vulnerabilidades de producción detectadas en esa ejecución |
| `npm run test:e2e`                        | no completado dentro del sandbox por política externa del navegador    |

El `package-lock.json` publicado fue generado desde el registro público de npm por un workflow efímero y quedó como fuente reproducible de `npm ci`. El workflow temporal fue eliminado después de cumplir su única función.

## Limitación del sandbox

Playwright no pudo descargar Chromium porque el entorno efímero bloqueó la resolución del CDN. El Chromium del sistema estaba administrado con una política que bloqueaba toda navegación (`URLBlocklist: ["*"]`). No se intentó eludir esa política.

La limitación quedó resuelta mediante GitHub Actions, donde la suite se ejecutó con Chromium y dependencias del sistema en móvil, tablet y escritorio.

## Verificación remota aprobada

El informe versionado [`CI-VERIFICATION.md`](CI-VERIFICATION.md) confirma una ejecución completa en GitHub Actions con:

- Node.js **24.18.0**;
- npm **11.16.0**;
- `npm ci` aprobado;
- instalación de Chromium aprobada;
- Astro y TypeScript aprobados;
- ESLint aprobado;
- Prettier aprobado;
- build estático aprobado;
- pruebas unitarias aprobadas;
- **45 pruebas Playwright aprobadas** en móvil, tablet y escritorio;
- auditoría de salida aprobada;
- auditoría de secretos aprobada;
- auditoría de dependencias de producción aprobada.

La verificación remota no utilizó los cuatro adjuntos originales.

## Cobertura implementada

- rutas críticas con respuesta 200, `h1`, title, description, canonical y `main`;
- navegación principal, menú móvil y uso por teclado;
- carga y existencia de imágenes;
- redirecciones históricas;
- sitemap, robots y 404;
- ausencia de PHP y referencias activas a la plataforma heredada, `localhost` y dominio anterior;
- parser SQL, escapes, tipos y prefijo variable;
- parser WXR y comparación de fuentes;
- saneamiento de scripts, eventos y comentarios Gutenberg;
- detección de path traversal y ZIP sospechoso;
- auditoría de secretos, backups y referencias a adjuntos temporales.

## Auditoría de `dist`

Última medición local consolidada antes de la publicación final:

- archivos: **26**;
- tamaño total: **167.657 B**;
- archivo HTML mayor: **19.206 B**;
- recursos externos activos: **0**;
- sourcemaps: **0**;
- errores de enlaces, SEO o cadenas prohibidas: **0**.

Las métricas pueden variar levemente cuando cambie contenido o versiones de Astro. La fuente de verdad operativa es el artefacto `shekinah-dist-<SHA>` generado por el último CI aprobado.

## Criterios de aceptación de CI

Para aceptar un commit como publicable deben quedar verdes:

1. instalación con `npm ci`;
2. instalación de Chromium;
3. check de Astro/TypeScript;
4. ESLint;
5. Prettier;
6. build;
7. pruebas unitarias y Playwright;
8. auditoría de `dist`;
9. auditoría de secretos.

`npm audit` se conserva como informe y no como criterio ciego: puede informar vulnerabilidades de herramientas de desarrollo sin implicar una vulnerabilidad explotable en el HTML estático publicado.

## Pruebas omitidas

No se hicieron pruebas de compra, carrito, pagos, usuarios, pedidos, autenticación o base de datos porque esas funciones no existen en la evidencia ni forman parte de la arquitectura final.
