# GitHub Actions

Fecha de actualización: **2026-07-22**.

## CI

Archivo: `.github/workflows/ci.yml`.

Se ejecuta en cada push a `main` y manualmente. Usa Node.js 24 desde `.nvmrc`, `npm ci` y Chromium instalado desde el paquete local de Playwright.

Orden bloqueante:

1. `npm ci`;
2. `npm run install:browsers:ci`;
3. `npm run verify:snapshot:required`;
4. `npm run check`;
5. `npm run lint`;
6. `npm run format:check`;
7. `npm run build`;
8. `npm run test:unit`;
9. `npm run test:powershell`;
10. `npm run test:e2e`;
11. `npm run audit:output`;
12. `npm run audit:secrets`.

La captura contra WordPress no ocurre en CI porque GitHub Actions no tiene acceso al Docker ni al `localhost` del usuario. CI verifica el snapshot versionado y sus hashes.

Mientras falte `reference-snapshot/site/index.html`, el fallo esperado es deliberado. Un verde obtenido mediante el fallback Astro sería un falso positivo y está prohibido.

## Despliegue

Archivo: `.github/workflows/deploy-cloudflare.yml`.

Se ejecuta automáticamente únicamente mediante `workflow_run`, después de un CI exitoso de `main`. No expone un `workflow_dispatch` que permita omitir la aprobación del SHA.

Secuencia:

1. exige `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`;
2. hace checkout del SHA validado;
3. ejecuta `npm ci`;
4. instala Chromium;
5. ejecuta `npm run verify` completo;
6. ejecuta `wrangler pages deploy dist` mediante el binario local;
7. verifica rutas en la URL de deployment y en el dominio estable;
8. verifica que exista un sitemap público.

La ausencia de secretos es un error de despliegue, no un estado verde ficticio.

## Última verificación del snapshot

- SHA: `91761a6fdb64da05b54331524d11577ae3670032`.
- CI: [run 29925014757](https://github.com/JerePrograma/shekinah/actions/runs/29925014757), **success**.
- Deploy: [run 29925142658](https://github.com/JerePrograma/shekinah/actions/runs/29925142658), **failure**.
- Causa: faltan los dos secretos Cloudflare; no se ejecutaron checkout, revalidación, Wrangler ni smoke de producción.

## Acciones utilizadas

Los workflows usan líneas mayores compatibles con Node.js 24:

- `actions/checkout@v6`;
- `actions/setup-node@v6`;
- `actions/upload-artifact@v7`.

## Artefactos

CI conserva durante siete días:

- `shekinah-dist-<SHA>`;
- `playwright-report-<SHA>` cuando existe.

Los artefactos ayudan al diagnóstico, pero la fuente de producción sigue siendo el commit versionado.

## Interpretación

- **CI rojo por snapshot faltante:** ejecutar la migración local real.
- **CI rojo por hash:** el snapshot fue modificado después de generar el manifiesto.
- **CI rojo por E2E:** corregir el primer recurso, ruta o consola fallidos.
- **Deploy rojo por secretos:** configurar los dos secretos exactos.
- **Deploy rojo en Wrangler:** verificar proyecto Pages, cuenta y permiso del token.
- **Deploy verde:** aún debe verificarse dominio estable y SHA.
