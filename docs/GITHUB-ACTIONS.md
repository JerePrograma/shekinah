# GitHub Actions

Fecha de actualización: **2026-07-21**.

## CI

Archivo: `.github/workflows/ci.yml`.

Disparadores:

- cada push a `main`;
- ejecución manual desde **Actions → CI → Run workflow**.

Permisos del token: `contents: read`.

### Secuencia

1. checkout exacto del commit;
2. instalación de Node.js desde `.nvmrc`;
3. caché npm basada en `package-lock.json`;
4. `npm ci`;
5. instalación de Chromium y dependencias del sistema;
6. `npm run check`;
7. `npm run lint`;
8. `npm run format:check`;
9. `npm run build` con `SITE_URL=https://shekinah-7dl.pages.dev`;
10. pruebas unitarias y Playwright mediante `npm run test`;
11. `npm run audit:output`;
12. `npm run audit:secrets`;
13. `npm audit` como informe no bloqueante;
14. carga temporal de `dist` y del reporte Playwright cuando existe.

La ausencia o inconsistencia del lockfile debe fallar explícitamente. No se omiten controles para obtener un estado verde artificial.

## Interpretación de CI

- **Verde:** el commit es técnicamente publicable.
- **Rojo:** abrir `Validate static site` y corregir el primer step rojo.
- **Cancelado:** normalmente un commit más nuevo sustituyó al anterior.
- **Omitido:** revisar sintaxis, permisos o políticas de Actions.

## Despliegue de producción

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Disparadores:

- automáticamente cuando **CI** termina correctamente en `main`;
- manualmente desde **Actions → Deploy Cloudflare Pages → Run workflow**.

### Garantía de SHA

Para una ejecución automática, el workflow toma `github.event.workflow_run.head_sha` y hace checkout de ese commit. No despliega ciegamente el HEAD existente en el momento de ejecución.

Para una ejecución manual, usa el SHA desde el que se inició el workflow.

### Secuencia

1. comprobar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`;
2. resolver el SHA de origen;
3. hacer checkout del SHA;
4. instalar Node.js y dependencias;
5. instalar Chromium;
6. ejecutar `npm run verify` completo;
7. publicar `dist` con `wrangler pages deploy`;
8. asociar el SHA al deployment mediante `--commit-hash`;
9. registrar la URL del deployment;
10. descargar la portada y comprobar `<title>Shekinah</title>`.

Comando:

```bash
npx wrangler pages deploy dist \
  --project-name shekinah \
  --branch main \
  --commit-hash <SHA_VALIDADO>
```

## Secretos requeridos

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

El token debe limitarse a la cuenta y al permiso necesario para editar Cloudflare Pages. No debe almacenarse en archivos, variables públicas, issues, logs o commits.

## Relación con Cloudflare

GitHub Actions es el único publicador automático seleccionado.

Si Cloudflare tiene una integración Git activa para el mismo proyecto:

1. deshabilitar deployments automáticos de producción y preview;
2. conservar el proyecto Pages y su dominio;
3. no ejecutar un segundo build y deploy por cada push.

Si el panel muestra un Worker con `Deploy command = npx wrangler deploy`, ese recurso no reemplaza al proyecto Pages. Workers Builds y Pages son mecanismos distintos.

## `Deployment not configured`

El workflow no encontró ambos secretos. El job informativo termina sin publicar.

CI puede continuar en verde porque la falta de autorización de infraestructura no convierte al código en inválido.

## Dependabot

`.github/dependabot.yml` revisa npm semanalmente y agrupa actualizaciones relacionadas. Una actualización no debe integrarse solo porque compile: deben revisarse changelog, compatibilidad con Node.js 24, resultado de CI, pruebas y salida estática.

## Diagnóstico operativo

1. Abrir **Actions**.
2. Elegir el workflow y el run del SHA relevante.
3. Abrir el job y localizar el primer step rojo.
4. Leer el error completo.
5. Corregir mediante edición de GitHub o checkout opcional.
6. Confirmar en `main`.
7. Verificar el nuevo run.
8. Descargar artefactos cuando sea necesario:
   - `playwright-report-<SHA>` para fallos funcionales;
   - `shekinah-dist-<SHA>` para inspeccionar el build validado.

## Verificación final

Un cambio se considera publicado cuando:

1. existe en `main`;
2. CI está verde para su SHA;
3. el workflow de Pages está verde para el mismo SHA;
4. Cloudflare registra ese SHA;
5. el sitio público muestra el cambio.

## Automatizaciones temporales

Los workflows efímeros usados durante bootstrap, generación de lockfile, verificación o formato fueron eliminados. No forman parte del flujo productivo.
