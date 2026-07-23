# GitHub Actions

Fecha de actualización: **2026-07-23**.

## Workflow

Archivo: `.github/workflows/ci.yml`.

Se ejecuta con cada push a `main` y también admite ejecución manual.

## Validación bloqueante

El trabajo `validate` ejecuta, en este orden:

1. publica el estado `shekinah/validation`;
2. checkout del commit exacto;
3. configuración de Node.js mediante `.nvmrc`;
4. instalación de dependencias;
5. instalación de Chromium;
6. ESLint;
7. verificación de formato;
8. validación del catálogo;
9. build y prerender con el origen productivo de Cloudflare;
10. validación del contenido generado;
11. pruebas unitarias;
12. pruebas de navegador;
13. auditoría estructural de `dist/`;
14. auditoría de la copia pública;
15. auditoría de seguridad del repositorio;
16. auditoría de dependencias productivas.

El resultado se publica como estado del commit. Los fallos de build incluyen un diagnóstico breve enlazado al run correspondiente.

## Publicación y verificación

Cloudflare Pages publica `main` mediante su integración con GitHub. GitHub Actions no sube un artefacto ni utiliza Wrangler, por lo que no requiere secretos de Cloudflare.

Después de una validación exitosa, el trabajo `verify-production`:

- espera que `https://shekinah-7dl.pages.dev/` refleje el estado esperado;
- comprueba inicio, tienda, blog, recetas, un producto y una categoría;
- valida títulos y canonicals;
- rechaza vocabulario técnico o dominios anteriores;
- comprueba `robots.txt` y `sitemap.xml`;
- publica el estado `shekinah/cloudflare-pages`.

La espera evita marcar como fallido un commit mientras Cloudflare todavía está procesando el deployment de la misma rama.

## Permisos

El workflow utiliza únicamente:

- `contents: read`;
- `statuses: write`.

No necesita `pages: write`, `id-token: write`, entornos de GitHub Pages ni credenciales externas.
