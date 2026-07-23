# GitHub Actions

Fecha de actualización: **2026-07-23**.

## Workflow

Archivo: `.github/workflows/ci.yml`.

Se ejecuta con cada push a `main` y también admite ejecución manual.

## Validación bloqueante

El trabajo `validate` ejecuta, en este orden:

1. checkout del commit exacto;
2. configuración de Node.js mediante `.nvmrc`;
3. instalación de dependencias;
4. instalación de Chromium;
5. ESLint;
6. verificación de formato;
7. validación del catálogo;
8. build local y prerender;
9. pruebas unitarias;
10. pruebas de navegador;
11. auditoría del resultado generado;
12. auditoría de seguridad del repositorio;
13. auditoría de dependencias productivas;
14. build final con la subruta `/shekinah/`;
15. auditoría del artefacto de GitHub Pages.

No se cargan reportes de Playwright, archivos de log ni diagnósticos internos. El único artefacto conservado es el paquete estático requerido por GitHub Pages.

## Despliegue

El trabajo `deploy` se ejecuta únicamente después de una validación exitosa de `main`.

Utiliza:

- `actions/configure-pages@v5`;
- `actions/upload-pages-artifact@v4`;
- `actions/deploy-pages@v4`;
- permisos `pages: write` e `id-token: write`;
- entorno `github-pages`.

No requiere secretos de terceros.
