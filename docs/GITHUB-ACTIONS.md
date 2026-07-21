# GitHub Actions

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
9. `npm run build`;
10. pruebas unitarias y Playwright mediante `npm run test`;
11. `npm run audit:output`;
12. `npm run audit:secrets`;
13. `npm audit` como informe no bloqueante;
14. publicación temporal del artefacto `dist` y del reporte Playwright cuando existe.

El job ya no contiene una condición previa basada en `hashFiles`; el checkout y `npm ci` siempre se ejecutan. La ausencia o inconsistencia del lockfile debe fallar explícitamente, no ocultar el CI como omitido.

## Interpretación del resultado

- **Verde:** el commit puede desplegarse.
- **Rojo:** abrir el run, entrar al job `Validate static site` y corregir el primer step rojo.
- **Cancelado:** normalmente un commit más nuevo sustituyó al anterior por la política de concurrencia.
- **Omitido:** no debería ocurrir en CI normal; revisar la sintaxis del workflow o las políticas de Actions.

No desactivar validaciones para obtener un check verde. La corrección debe publicarse como un commit normal y trazable sobre `main`.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Se dispara:

- automáticamente cuando `CI` termina correctamente en `main`;
- manualmente desde **Actions → Deploy Cloudflare Pages → Run workflow**.

El workflow:

1. comprueba si existen los secretos;
2. si faltan, informa `Deployment not configured` sin romper CI;
3. si existen, obtiene el SHA validado;
4. vuelve a ejecutar `npm ci` y build;
5. audita `dist`;
6. despliega con Wrangler al proyecto `shekinah`;
7. verifica la portada publicada.

Secretos requeridos:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

No deben almacenarse en archivos, variables públicas, issues, logs o commits.

## Dependabot

`.github/dependabot.yml` revisa npm semanalmente y agrupa actualizaciones relacionadas para reducir ruido. Una actualización no debe fusionarse solo porque compile: deben revisarse changelog, compatibilidad con Node 24, resultado de CI y salida estática.

## Diagnóstico operativo

1. Abrir la pestaña **Actions**.
2. Elegir el workflow y el run del SHA que se quiere diagnosticar.
3. Abrir el job y localizar el primer step rojo.
4. Leer el error completo y no solo la última línea.
5. Corregir mediante edición de GitHub o un checkout opcional.
6. Confirmar el cambio sobre `main`.
7. Verificar el nuevo run.
8. Descargar `playwright-report-*` ante fallos funcionales y `shekinah-dist-*` para inspeccionar exactamente el build validado.

## Historial del bootstrap del lockfile

Al inicializar el repositorio fue necesario un workflow efímero que generara `package-lock.json` contra el registro público, evitando publicar URLs internas del sandbox. Una vez generado el lockfile, ese workflow fue eliminado. No forma parte del flujo normal ni debe recrearse salvo pérdida deliberada del lockfile, situación que debería resolverse preferentemente regenerándolo en una rama controlada y revisando el diff.
