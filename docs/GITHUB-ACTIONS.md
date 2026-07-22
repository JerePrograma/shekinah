# GitHub Actions

Fecha de actualización: **2026-07-22**.

## CI

Archivo: `.github/workflows/ci.yml`.

Se ejecuta en cada push a `main` y manualmente. Usa Node.js 24 y construye exclusivamente la aplicación React/TypeScript versionada.

Orden bloqueante:

1. checkout del SHA exacto;
2. instalación de dependencias declaradas;
3. instalación de Chromium;
4. ESLint;
5. verificación de formato básico;
6. TypeScript, build Vite y prerender;
7. pruebas unitarias de arquitectura y salida;
8. pruebas E2E en móvil, tablet y escritorio;
9. auditoría del directorio `dist`;
10. auditoría de secretos.

CI publica `dist` como artefacto únicamente cuando todas las verificaciones bloqueantes terminan correctamente.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

El workflow se inicia mediante `workflow_run` después de un CI exitoso sobre `main`. Resuelve el SHA validado, lo vuelve a verificar y despliega `dist` en el proyecto Pages `shekinah`.

Luego comprueba en la URL de deployment y en el dominio estable:

- rutas principales;
- títulos y canonicals;
- ausencia de marcadores o endpoints WordPress;
- `robots.txt`;
- `sitemap.xml`.

Los secretos exigidos son `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. Nunca se imprimen ni se almacenan en el repositorio.

## Instalación de dependencias

Las versiones directas están fijadas en `package.json`. El workflow usa `npm install --package-lock=false` porque la migración se publicó mediante el conector remoto sin un entorno npm capaz de regenerar y validar un lockfile. La incorporación futura de un `package-lock.json` generado por Node 24 es recomendable, pero no debe hacerse copiando o editando manualmente un lockfile obsoleto.
