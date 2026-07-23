# GitHub Actions

Fecha de actualización: **2026-07-23**.

## Validación

Archivo: `.github/workflows/ci.yml`.

El workflow `CI` se ejecuta con cada push a `main` y también admite ejecución manual. El trabajo `validate` realiza:

1. publicación del estado `shekinah/validation`;
2. checkout del commit exacto;
3. configuración de Node.js;
4. instalación de dependencias y Chromium;
5. ESLint y formato;
6. validación del catálogo;
7. build y prerender con el origen productivo;
8. validación del contenido generado;
9. pruebas unitarias y de navegador;
10. auditorías de estructura, copia pública, secretos y dependencias.

El resultado se publica sobre el SHA validado. Un fallo impide que se inicie el workflow de despliegue.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

`Deploy Cloudflare Pages` se dispara mediante `workflow_run` únicamente cuando `CI` termina correctamente sobre `main`.

El trabajo de publicación:

1. obtiene el SHA validado;
2. comprueba las credenciales y el proyecto remoto;
3. confirma `production_branch=main`;
4. reconstruye y audita `dist/` desde ese SHA;
5. publica con Wrangler;
6. espera que Cloudflare promueva el mismo SHA a producción;
7. verifica URLs de deployment, canónica y estable;
8. comprueba rutas, canonicals, sitemap, robots y ausencia de contenido residual;
9. publica `shekinah/cloudflare-pages` sobre el commit.

## Permisos y secretos

Ambos workflows utilizan:

- `contents: read`;
- `statuses: write`.

El workflow de despliegue usa el environment `cloudflare-pages-production` y sus secretos:

- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

No se utilizan permisos de GitHub Pages, `id-token`, ramas de publicación ni artefactos permanentes.
