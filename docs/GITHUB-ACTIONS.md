# GitHub Actions

## CI

Archivo: `.github/workflows/ci.yml`.

Disparadores:

- push a `main`;
- ejecución manual.

Pasos:

1. checkout;
2. Node desde `.nvmrc`;
3. `npm ci` con caché npm;
4. instalación de Chromium;
5. check, lint y formato;
6. build estático;
7. pruebas unitarias y Playwright;
8. auditorías de salida y secretos;
9. `npm audit` informativo;
10. artefactos `dist` y reporte Playwright.

Permiso del token: solo `contents: read`.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Se dispara después de CI exitoso en `main` o manualmente. Vuelve a construir el SHA validado, audita y despliega. Si faltan secretos, no intenta publicar y deja un mensaje claro.

Secretos requeridos:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Dependabot

`.github/dependabot.yml` revisa npm semanalmente y agrupa actualizaciones de Astro y calidad para reducir ruido.

## Diagnóstico

1. Abrir la pestaña **Actions** del repositorio.
2. Elegir el workflow y run fallido.
3. Abrir el job y el primer step rojo.
4. Corregir en un commit normal sobre `main`; no desactivar auditorías para forzar verde.
5. Descargar `playwright-report-*` cuando falle una prueba visual/funcional.
