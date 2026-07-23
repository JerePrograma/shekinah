# Despliegue en Cloudflare Pages

Fecha de actualización: **2026-07-23**.

## Configuración

- Repositorio: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Proyecto de Cloudflare Pages: `shekinah`.
- Directorio generado: `dist/`.
- URL estable: `https://shekinah-7dl.pages.dev/`.
- Publicador: GitHub Actions mediante Wrangler.
- Configuración: `wrangler.jsonc`.

## Flujo

1. Un commit llega a `main`.
2. El workflow `CI` ejecuta lint, formato, validación de contenido, build, pruebas y auditorías.
3. Solo si ese run termina correctamente, `Deploy Cloudflare Pages` recibe el SHA validado.
4. El workflow reconstruye y audita `dist/` desde ese SHA exacto.
5. Wrangler publica el artefacto en el proyecto `shekinah`, rama `main`.
6. El workflow consulta la API de Cloudflare hasta confirmar que ese SHA es el deployment canónico de producción.
7. Finalmente verifica rutas, canonicals, sitemap, robots y ausencia de contenido técnico en el dominio estable.

## Credenciales

El environment de GitHub `cloudflare-pages-production` debe proporcionar:

- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

Los valores no se escriben en archivos, logs persistentes ni artefactos públicos.

## Construcción local

```bash
npm install --package-lock=false --no-audit --no-fund
npm run install:browsers
npm run verify
```

Construcción equivalente a producción:

```bash
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run build
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:output
SITE_BASE_PATH=/ SITE_ORIGIN=https://shekinah-7dl.pages.dev npm run audit:copy
```

La publicación manual requiere además las credenciales en el entorno y el SHA validado:

```bash
DEPLOY_COMMIT_SHA=<SHA_DE_40_CARACTERES> npm run deploy:cloudflare
```

## Requisitos de Cloudflare Pages

- `production_branch`: `main`;
- proyecto: `shekinah`;
- salida: `dist/`;
- sitio servido desde la raíz `/`.

El workflow comprueba y corrige remotamente `production_branch` antes de publicar.
