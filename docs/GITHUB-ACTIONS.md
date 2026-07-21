# GitHub Actions

Fecha de actualización: **2026-07-21**.

## Flujo principal de integración continua

Archivo: `.github/workflows/ci.yml`.

Disparadores:

- cada push a `main`;
- ejecución manual desde **Actions → CI → Run workflow**.

Permisos del token: `contents: read`.

### Secuencia ejecutada

1. checkout exacto del commit;
2. instalación de Node.js desde `.nvmrc`;
3. restauración de caché npm basada en `package-lock.json`;
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
14. publicación temporal del artefacto `dist` y del reporte Playwright cuando existe.

La ausencia o inconsistencia del lockfile debe fallar explícitamente. CI no debe omitirse para ocultar un error.

## Interpretación del resultado

- **Verde:** el commit de `main` es técnicamente publicable.
- **Rojo:** abrir `Validate static site` y corregir el primer step rojo.
- **Cancelado:** normalmente un commit más nuevo sustituyó al anterior por la política de concurrencia.
- **Omitido:** revisar sintaxis, permisos o políticas de Actions.

No desactivar validaciones para obtener un check verde. La corrección debe publicarse como un commit normal y trazable sobre `main`.

## Relación con Cloudflare

El publicador automático principal es la **integración Git de Cloudflare Pages**, no GitHub Actions.

```text
push a main
  → CI valida el commit
  → Cloudflare detecta el mismo push
  → construye y publica dist
```

El panel de Cloudflare debe usar:

```bash
npm run build
```

como build y:

```bash
npx wrangler pages deploy dist --project-name shekinah --branch main
```

como deploy.

No usar `npx wrangler deploy`, porque corresponde a Workers.

## Workflow manual de despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Disparador único:

- ejecución manual desde **Actions → Deploy Cloudflare Pages → Run workflow**.

No se dispara después de cada CI. Esta decisión evita que Cloudflare Git Integration y GitHub Actions publiquen dos veces el mismo commit.

El workflow manual:

1. comprueba si existen los secretos;
2. si faltan, informa `Deployment not configured` sin romper CI;
3. obtiene la rama `main`;
4. ejecuta `npm ci`;
5. instala Chromium;
6. ejecuta `npm run verify` completo;
7. despliega con Wrangler al proyecto `shekinah` y rama `main`;
8. verifica la portada publicada.

Secretos requeridos:

- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

No deben almacenarse en archivos, variables públicas, issues, logs o commits.

## Cuándo usar el workflow manual

Usarlo solamente cuando:

- la integración Git de Cloudflare esté temporalmente fuera de servicio;
- se necesite una recuperación controlada;
- se decida migrar deliberadamente desde la integración Git a Direct Upload.

No configurarlo como segundo mecanismo automático habitual.

## Dependabot

`.github/dependabot.yml` revisa npm semanalmente y agrupa actualizaciones relacionadas para reducir ruido. Una actualización no debe integrarse solo porque compile: deben revisarse changelog, compatibilidad con Node 24, resultado de CI, pruebas y salida estática.

## Diagnóstico operativo

1. Abrir la pestaña **Actions**.
2. Elegir el workflow y el run del SHA que se quiere diagnosticar.
3. Abrir el job y localizar el primer step rojo.
4. Leer el error completo y no solo la última línea.
5. Corregir mediante edición de GitHub o un checkout opcional.
6. Confirmar el cambio sobre `main`.
7. Verificar el nuevo run.
8. Descargar artefactos cuando sea necesario:
   - `playwright-report-<SHA>` para fallos funcionales;
   - `shekinah-dist-<SHA>` para inspeccionar el build validado.

## Historial del bootstrap

Al inicializar el repositorio se usaron workflows efímeros para generar `package-lock.json`, ejecutar verificaciones y formatear documentación. Esos workflows fueron eliminados después de cumplir su función y no forman parte del flujo normal.
